"""Opportunity Engine endpoint surface.

Powers the platform's investment-decision layer:
  GET  /api/v1/opportunities                       — ranked list
  POST /api/v1/opportunities/{area_id}/explain     — lazy structured AI
  POST /api/v1/opportunities/recompute             — admin cache reset
"""
from datetime import datetime, timezone
from statistics import median
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import AuthPrincipal, require_admin
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.redis_client import redis_client
from app.services.confidence import build_confidence_report, confidence_to_dict
from app.services.insights import opportunity_explanation
from app.services.opportunity_engine import (
    attach_nearby,
    build_report,
    compute_cohort_median,
    report_to_dict,
)


router = APIRouter(
    prefix="/api/v1/opportunities",
    tags=["opportunities"],
    dependencies=[Depends(rate_limit_dependency)],
)


async def _load_universe(
    db: AsyncSession,
) -> tuple[list[Area], dict[UUID, list[MarketSnapshot]]]:
    """Load all areas + their full snapshot history (sorted ascending)."""
    areas = (await db.execute(select(Area).order_by(Area.name))).scalars().all()
    history_by_id: dict[UUID, list[MarketSnapshot]] = {}
    for a in areas:
        snaps = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == a.id)
                .order_by(MarketSnapshot.snapshot_date)
            )
        ).scalars().all()
        history_by_id[a.id] = list(snaps)
    return list(areas), history_by_id


def _score_all(
    areas: list[Area], history_by_id: dict[UUID, list[MarketSnapshot]]
) -> list:
    """Build OpportunityReports for every area with at least one snapshot."""
    latest_prices: list[float] = []
    for a in areas:
        hist = history_by_id.get(a.id) or []
        if hist:
            latest_prices.append(float(hist[-1].avg_price_per_sqft))
    cohort_median = float(median(latest_prices)) if latest_prices else 1500.0

    reports = []
    for a in areas:
        hist = history_by_id.get(a.id) or []
        if not hist:
            continue
        latest = hist[-1]
        reports.append(
            build_report(
                area=a,
                latest=latest,
                history=hist,
                cohort_median_price=cohort_median,
            )
        )
    return reports


@router.get("")
async def list_opportunities(
    db: AsyncSession = Depends(get_db),
    type: Optional[str] = Query(default=None, description="Filter by opportunity_type"),
    min_score: int = Query(default=0, ge=0, le=100),
    limit: int = Query(default=10, ge=1, le=50),
    sort_by: str = Query(default="score", description="score|yield|appreciation"),
):
    """Top opportunities across all tracked UAE areas.

    Response shape:
      {
        "opportunities": [...],
        "total": <count after filters>,
        "generated_at": "<ISO>",
        "methodology_link": "/methodology"
      }
    """
    areas, history_by_id = await _load_universe(db)
    if not areas:
        return {
            "opportunities": [],
            "total": 0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "methodology_link": "/methodology",
        }

    reports = _score_all(areas, history_by_id)
    areas_by_id = {a.id: a for a in areas}
    attach_nearby(reports, {str(k): v for k, v in areas_by_id.items()}, k=3)

    # Filter
    filtered = [r for r in reports if r.opportunity_score >= min_score]
    if type:
        filtered = [r for r in filtered if r.opportunity_type == type]

    # Sort
    key_map = {
        "score": lambda r: r.opportunity_score,
        "yield": lambda r: r.key_metrics.rental_yield,
        "appreciation": lambda r: r.key_metrics.appreciation_1y or 0.0,
    }
    sort_fn = key_map.get(sort_by, key_map["score"])
    filtered.sort(key=sort_fn, reverse=True)

    # Attach confidence (data confidence, not the engine's confidence_level)
    out: list[dict] = []
    for r in filtered[:limit]:
        history = history_by_id.get(UUID(r.area_id))
        confidence = build_confidence_report(
            areas_by_id.get(UUID(r.area_id)), list(history) if history else []
        )
        d = report_to_dict(r)
        d["data_confidence"] = confidence_to_dict(confidence)
        out.append(d)

    return {
        "opportunities": out,
        "total": len(filtered),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "methodology_link": "/methodology",
    }


@router.post("/{area_id}/explain")
async def explain_opportunity(
    area_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Lazy LLM-generated structured explanation. Cached 24h per (area, score, type).

    Returns {why, risks, best_for, strategy, model, tokens, cached}. If the LLM
    call fails, returns the rules-based fallback from the engine."""
    areas, history_by_id = await _load_universe(db)
    target = next((a for a in areas if a.id == area_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Area not found")
    history = history_by_id.get(area_id) or []
    if not history:
        raise HTTPException(status_code=404, detail="No snapshots for area")
    latest = history[-1]

    cohort = compute_cohort_median(
        [h[-1] for h in history_by_id.values() if h]
    )
    report = build_report(
        area=target, latest=latest, history=history, cohort_median_price=cohort
    )

    structured = await opportunity_explanation(
        area_id=str(area_id),
        area_name=target.name,
        opportunity_score=report.opportunity_score,
        opportunity_type=report.opportunity_type,
        rental_yield=report.key_metrics.rental_yield,
        price_per_sqft=report.key_metrics.price_per_sqft,
        appreciation_1y=report.key_metrics.appreciation_1y,
        risk_score=report.key_metrics.risk_score,
        demand_score=report.key_metrics.demand_score,
        transaction_volume=report.key_metrics.transaction_volume,
        cohort_median_price=cohort,
        why_rules=report.why,
        risks_rules=report.risks,
    )

    if structured is None:
        # Fallback to rules-based fields already in the report
        return {
            "area_id": str(area_id),
            "area_name": target.name,
            "why": report.why,
            "risks": report.risks,
            "best_for": report.best_for,
            "strategy": report.strategy,
            "model": None,
            "tokens": 0,
            "cached": False,
            "fallback_used": True,
        }

    return {"area_id": str(area_id), "area_name": target.name, **structured}


@router.post("/recompute")
async def recompute(
    db: AsyncSession = Depends(get_db),
    _: AuthPrincipal = Depends(require_admin),
):
    """Admin: clear all Opportunity Engine LLM caches.

    Forces fresh AI explanations on next request. Snapshot data is untouched.
    """
    cleared = 0
    try:
        # Scan and delete all opportunity-explanation cache keys
        async for key in redis_client.scan_iter(match="ai:opp_explain:*", count=200):
            await redis_client.delete(key)
            cleared += 1
    except Exception:
        pass
    return {
        "status": "ok",
        "cleared_keys": cleared,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
