"""Opportunity Engine endpoint surface — unified feed.

Surfaces *both* area-derived intelligence signals and broker-submitted
deals under one set of routes, distinguished on the response by ``kind``
(``area_signal`` | ``broker_deal``).

  GET  /api/v1/opportunities                              — unified list (kind=all|signals|deals)
  GET  /api/v1/opportunities/deals/{id}                   — broker-deal detail
  POST /api/v1/opportunities/deals/{id}/request-consultation
  POST /api/v1/opportunities/{area_id}/explain            — lazy structured AI (signal only)
  POST /api/v1/opportunities/recompute                    — admin cache reset
"""
from datetime import datetime, timezone
from statistics import median
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.routes.consultations import _create_lead_and_consultation, SUCCESS_MESSAGE
from app.core.dependencies import AuthPrincipal, require_admin
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.dld import DldArea, DldBuildingDerived
from app.models.investment_opportunity import InvestmentOpportunity
from app.models.market_snapshot import MarketSnapshot
from app.redis_client import redis_client
from app.schemas.consultation import ConsultationOut, ConsultationRequestResponse
from app.schemas.investor_lead import LeadCreate, LeadOut
from app.schemas.opportunity_deal import DealOut
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


def _deal_to_card(d: InvestmentOpportunity) -> dict:
    """Serialize a broker-submitted deal into a card shape parallel to the
    area-signal card. Frontend branches on ``kind``."""
    score = float(d.opportunity_score) if d.opportunity_score is not None else 0.0
    return {
        "kind": "broker_deal",
        "id": str(d.id),
        "title": d.title,
        "area_name": d.area,
        "emirate": d.emirate,
        "price": float(d.price),
        "property_type": d.property_type,
        "unit_type": d.unit_type,
        "rental_yield": d.expected_gross_yield,
        "expected_net_yield": d.expected_net_yield,
        "opportunity_score": score,
        "strategy": d.strategy_type,
        "risk_level": d.risk_level,
        "confidence_score": d.confidence_score,
        "why_short": (d.why_opportunity or "")[:200],
        "source_type": d.source_type,
        "broker": {
            "id": str(d.broker.id),
            "full_name": d.broker.full_name,
            "company_name": d.broker.company_name,
        }
        if d.broker
        else None,
    }


@router.get("")
async def list_opportunities(
    db: AsyncSession = Depends(get_db),
    kind: str = Query(
        default="all",
        pattern="^(all|signals|deals)$",
        description="all=merged feed, signals=area-derived only, deals=broker-submitted only",
    ),
    type: Optional[str] = Query(default=None, description="Signal-only: opportunity_type"),
    area: Optional[str] = Query(default=None, description="Deal-only: case-insensitive area substring"),
    strategy: Optional[str] = Query(default=None, description="Deal-only: strategy_type"),
    category: Optional[str] = Query(
        default=None,
        description=(
            "Comma-separated property_category list. When set, returns only "
            "opportunities whose area has ≥1 building in the selected "
            "category set (dld_buildings_derived). Mixed-use areas appear in "
            "every category they host."
        ),
    ),
    min_score: int = Query(default=0, ge=0, le=100),
    limit: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="score", description="score|yield|appreciation"),
):
    """Unified opportunity feed.

    Returns a single list mixing two ``kind`` values:
      - ``area_signal`` — computed by ``opportunity_engine`` (no broker).
      - ``broker_deal`` — broker-submitted, approved by admin.

    Response shape::

      {
        "opportunities": [{kind, ...}, ...],
        "total": <count after filters, pre-limit>,
        "generated_at": "<ISO>",
        "methodology_link": "/methodology"
      }
    """
    items: list[dict] = []

    # ---- Category filter: pre-compute the set of areas that have buildings
    # in the requested category set. Mixed-use areas appear in every
    # category they host (no scoring change — see Step 7 spec). ----
    allowed_curated_area_ids: Optional[set[str]] = None
    allowed_area_name_norms: Optional[set[str]] = None
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        if cats:
            # Join dld_buildings_derived → dld_areas → curated areas. The
            # area_signal endpoint keys on curated `Area.id`; broker deals
            # match by area name. Resolve both sets in one round-trip.
            stmt = (
                select(DldArea.name_norm, DldArea.curated_area_id)
                .join(
                    DldBuildingDerived,
                    DldBuildingDerived.dld_area_id == DldArea.id,
                )
                .where(DldBuildingDerived.property_category.in_(cats))
                .distinct()
            )
            rows = (await db.execute(stmt)).all()
            allowed_area_name_norms = {r[0] for r in rows if r[0]}
            allowed_curated_area_ids = {
                str(r[1]) for r in rows if r[1] is not None
            }

    # ---- Area signals ----
    if kind in ("all", "signals"):
        areas, history_by_id = await _load_universe(db)
        if areas:
            reports = _score_all(areas, history_by_id)
            areas_by_id = {a.id: a for a in areas}
            attach_nearby(reports, {str(k): v for k, v in areas_by_id.items()}, k=3)
            filtered = [r for r in reports if r.opportunity_score >= min_score]
            if type:
                filtered = [r for r in filtered if r.opportunity_type == type]
            if allowed_curated_area_ids is not None:
                filtered = [
                    r for r in filtered if str(r.area_id) in allowed_curated_area_ids
                ]
            for r in filtered:
                history = history_by_id.get(UUID(r.area_id))
                confidence = build_confidence_report(
                    areas_by_id.get(UUID(r.area_id)),
                    list(history) if history else [],
                )
                signal = report_to_dict(r)
                signal["kind"] = "area_signal"
                signal["data_confidence"] = confidence_to_dict(confidence)
                items.append(signal)

    # ---- Broker deals ----
    if kind in ("all", "deals"):
        stmt = (
            select(InvestmentOpportunity)
            .where(InvestmentOpportunity.status == "approved")
            .options(selectinload(InvestmentOpportunity.broker))
            .order_by(InvestmentOpportunity.created_at.desc())
        )
        if area:
            stmt = stmt.where(InvestmentOpportunity.area.ilike(f"%{area}%"))
        if strategy:
            stmt = stmt.where(InvestmentOpportunity.strategy_type == strategy)
        deals = (await db.execute(stmt)).scalars().all()
        for d in deals:
            score = float(d.opportunity_score) if d.opportunity_score is not None else 0.0
            if score < min_score:
                continue
            if allowed_area_name_norms is not None:
                # Broker deals have a free-text area field — match
                # case-insensitively against the resolved name_norms.
                deal_area_norm = (d.area or "").strip().lower()
                if deal_area_norm not in allowed_area_name_norms:
                    continue
            items.append(_deal_to_card(d))

    # ---- Sort across the merged set ----
    def _yield_key(item: dict) -> float:
        if item["kind"] == "area_signal":
            km = item.get("key_metrics") or {}
            return float(km.get("rental_yield") or 0.0)
        return float(item.get("rental_yield") or 0.0)

    def _appr_key(item: dict) -> float:
        if item["kind"] == "area_signal":
            km = item.get("key_metrics") or {}
            return float(km.get("appreciation_1y") or 0.0)
        return 0.0

    key_map = {
        "score": lambda x: float(x.get("opportunity_score") or 0.0),
        "yield": _yield_key,
        "appreciation": _appr_key,
    }
    items.sort(key=key_map.get(sort_by, key_map["score"]), reverse=True)

    return {
        "opportunities": items[:limit],
        "total": len(items),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "methodology_link": "/methodology",
    }


# ---- Broker-deal detail + consultation request ----


@router.get("/deals/{deal_id}", response_model=DealOut)
async def get_deal(deal_id: UUID, db: AsyncSession = Depends(get_db)):
    """Broker-deal detail (only approved deals are visible publicly)."""
    deal = (
        await db.execute(
            select(InvestmentOpportunity)
            .where(InvestmentOpportunity.id == deal_id)
            .where(InvestmentOpportunity.status == "approved")
            .options(selectinload(InvestmentOpportunity.broker))
        )
    ).scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post(
    "/deals/{deal_id}/request-consultation",
    response_model=ConsultationRequestResponse,
    status_code=201,
)
async def request_deal_consultation(
    deal_id: UUID,
    payload: LeadCreate,
    db: AsyncSession = Depends(get_db),
):
    """Investor requests a consultation tied to a specific broker deal.

    Lead + Consultation are created and assigned to the deal's broker.
    """
    deal = (
        await db.execute(
            select(InvestmentOpportunity)
            .where(InvestmentOpportunity.id == deal_id)
            .where(InvestmentOpportunity.status == "approved")
        )
    ).scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    # Path-derived opportunity_id wins over any body-supplied value.
    payload.opportunity_id = deal.id
    lead, consultation = await _create_lead_and_consultation(db, payload, deal)
    return ConsultationRequestResponse(
        message=SUCCESS_MESSAGE,
        lead=LeadOut.model_validate(lead),
        consultation=ConsultationOut.model_validate(consultation),
    )


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
