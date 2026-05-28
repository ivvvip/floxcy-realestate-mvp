"""Undervalued Area Detector — the killer feature endpoint."""
from statistics import median
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.services.confidence import build_confidence_report, confidence_to_dict
from app.services.insights import area_explanation
from app.services.undervaluation import (
    NearbyArea,
    TIER_DISPLAY,
    detect_undervaluation,
    haversine_km,
    report_to_dict,
)

router = APIRouter(
    prefix="/api/v1/opportunities",
    tags=["opportunities"],
    dependencies=[Depends(rate_limit_dependency)],
)


async def _load_universe(
    db: AsyncSession,
) -> list[tuple[Area, list[MarketSnapshot]]]:
    """Load every area with its full snapshot history (ordered)."""
    areas = (await db.execute(select(Area).order_by(Area.name))).scalars().all()
    out: list[tuple[Area, list[MarketSnapshot]]] = []
    for a in areas:
        snaps = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == a.id)
                .order_by(MarketSnapshot.snapshot_date)
            )
        ).scalars().all()
        out.append((a, list(snaps)))
    return out


def _score_all(
    universe: list[tuple[Area, list[MarketSnapshot]]],
) -> list[dict]:
    """Compute undervaluation + confidence for every area in the universe."""
    universe_latest = [(a, h[-1]) for a, h in universe if h]
    cohort_prices = [float(s.avg_price_per_sqft) for _, s in universe_latest]
    cohort_yields = [float(s.rental_yield) for _, s in universe_latest]

    rows: list[dict] = []
    for area, history in universe:
        if not history:
            continue
        latest = history[-1]
        report = detect_undervaluation(
            area=area,
            latest=latest,
            history=history,
            cohort_prices=[
                p for p in cohort_prices if p != float(latest.avg_price_per_sqft)
            ],
            cohort_yields=[
                y for y in cohort_yields if y != float(latest.rental_yield)
            ],
        )
        confidence = build_confidence_report(area, history)
        rows.append(
            {
                "area": area,
                "latest": latest,
                "history": history,
                "report": report,
                "confidence": confidence,
            }
        )
    return rows


def _attach_nearby(rows: list[dict], k: int = 3) -> None:
    """Mutates each row's report.nearby_comparison with the k closest peers."""
    coords = [
        (r["area"].id, r["area"].name, r["area"].latitude, r["area"].longitude, r)
        for r in rows
        if r["area"].latitude is not None and r["area"].longitude is not None
    ]
    for r in rows:
        a = r["area"]
        if a.latitude is None or a.longitude is None:
            continue
        cands = []
        for oid, oname, olat, olng, orow in coords:
            if oid == a.id:
                continue
            d = haversine_km(a.latitude, a.longitude, olat, olng)
            cands.append((d, orow))
        cands.sort(key=lambda x: x[0])
        nearby: list[NearbyArea] = []
        for d, orow in cands[:k]:
            o_report = orow["report"]
            o_latest = orow["latest"]
            nearby.append(
                NearbyArea(
                    area_id=str(o_report.area_id),
                    area_name=o_report.area_name,
                    distance_km=round(d, 2),
                    score=o_report.score,
                    tier=o_report.tier,
                    price_per_sqft=float(o_latest.avg_price_per_sqft),
                    rental_yield=float(o_latest.rental_yield),
                )
            )
        r["report"].nearby_comparison = nearby


def _to_payload(row: dict) -> dict:
    report = row["report"]
    confidence = row["confidence"]
    latest = row["latest"]
    return {
        **report_to_dict(report),
        "tier_display": TIER_DISPLAY.get(report.tier, report.tier),
        "confidence": confidence_to_dict(confidence),
        "snapshot": {
            "snapshot_date": latest.snapshot_date.isoformat(),
            "avg_price_per_sqft": float(latest.avg_price_per_sqft),
            "rental_yield": float(latest.rental_yield),
            "appreciation_1y": float(latest.appreciation_1y) if latest.appreciation_1y else None,
            "transaction_volume": latest.transaction_volume,
            "investment_score": float(latest.investment_score) if latest.investment_score else None,
        },
    }


@router.get("")
async def list_opportunities(
    db: AsyncSession = Depends(get_db),
    tier: Optional[str] = Query(default=None, description="strong|moderate|neutral|overpriced"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """Rank every area by undervaluation score (descending)."""
    universe = await _load_universe(db)
    rows = _score_all(universe)
    _attach_nearby(rows, k=3)
    out = [_to_payload(r) for r in rows]
    if tier:
        out = [r for r in out if r["tier"] == tier]
    out.sort(key=lambda r: r["score"], reverse=True)
    return {"count": len(out[:limit]), "results": out[:limit]}


@router.post("/{area_id}/explain")
async def explain_opportunity(
    area_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Lazy LLM-generated explainer for one area. Cached 24h per (area, score, tier)."""
    universe = await _load_universe(db)
    rows = _score_all(universe)
    target = next((r for r in rows if r["area"].id == area_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Area not found or no snapshots")

    report = target["report"]
    latest = target["latest"]
    cohort_yields = [
        float(s.rental_yield) for _, h in universe for s in [h[-1]] if h
    ]
    cohort_prices = [
        float(s.avg_price_per_sqft) for _, h in universe for s in [h[-1]] if h
    ]

    payload = await area_explanation(
        area_id=str(area_id),
        area_name=report.area_name,
        score=report.score,
        tier=report.tier,
        rental_yield=float(latest.rental_yield),
        price_per_sqft=float(latest.avg_price_per_sqft),
        appreciation_1y=(float(latest.appreciation_1y) if latest.appreciation_1y else None),
        risk_score=(float(latest.risk_score) if latest.risk_score else None),
        demand_score=(float(latest.demand_score) if latest.demand_score else None),
        transaction_volume=latest.transaction_volume,
        cohort_yield_median=median(cohort_yields) if cohort_yields else 6.5,
        cohort_price_median=median(cohort_prices) if cohort_prices else float(latest.avg_price_per_sqft),
        reasons=report.reasons,
        risks=report.risks,
    )
    if payload is None:
        raise HTTPException(
            status_code=503,
            detail="LLM explanation unavailable",
        )
    return {
        "area_id": str(area_id),
        "area_name": report.area_name,
        **payload,
    }
