"""Market-level + per-area AI insight endpoints (P2)."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import ai_rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.services.insights import (
    compute_trends,
    market_brief,
    structured_area_insight,
)
from app.services.undervaluation import detect_undervaluation


router = APIRouter(
    prefix="/api/v1/insights",
    tags=["insights"],
    dependencies=[Depends(ai_rate_limit_dependency)],
)


async def _all_latest(db: AsyncSession) -> list[tuple[Area, MarketSnapshot]]:
    """Each area + its most-recent snapshot. Areas with no snapshot are skipped."""
    areas = (await db.execute(select(Area).order_by(Area.name))).scalars().all()
    out: list[tuple[Area, MarketSnapshot]] = []
    for a in areas:
        snap = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == a.id)
                .order_by(MarketSnapshot.snapshot_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if snap is not None:
            out.append((a, snap))
    return out


@router.get("/market-brief")
async def get_market_brief(db: AsyncSession = Depends(get_db)) -> dict:
    """3-5 LLM-generated bullets summarizing today's UAE market. Cached daily."""
    pairs = await _all_latest(db)
    if not pairs:
        raise HTTPException(status_code=503, detail="No data")

    # Aggregate inputs
    yields = [float(s.rental_yield) for _, s in pairs]
    prices = [float(s.avg_price_per_sqft) for _, s in pairs]
    avg_yield = sum(yields) / len(yields)
    avg_price = sum(prices) / len(prices)

    # Top opportunities (reuse undervaluation logic, light cohort filter)
    universe_areas = [a for a, _ in pairs]
    cohort_prices = prices
    cohort_yields = yields
    # Need full history per area for momentum-aware score. Pull cheaply.
    by_id = {a.id: a for a in universe_areas}
    universe_full: list[tuple[Area, list[MarketSnapshot]]] = []
    for a in universe_areas:
        hist = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == a.id)
                .order_by(MarketSnapshot.snapshot_date)
            )
        ).scalars().all()
        universe_full.append((a, list(hist)))

    opps: list[dict] = []
    for a, hist in universe_full:
        if not hist:
            continue
        latest = hist[-1]
        report = detect_undervaluation(
            area=a,
            latest=latest,
            history=hist,
            cohort_prices=[p for p in cohort_prices if p != float(latest.avg_price_per_sqft)],
            cohort_yields=[y for y in cohort_yields if y != float(latest.rental_yield)],
        )
        opps.append(
            {
                "name": a.name,
                "score": report.score,
                "tier": report.tier,
                "yield": float(latest.rental_yield),
                "price": float(latest.avg_price_per_sqft),
            }
        )
    opps.sort(key=lambda r: r["score"], reverse=True)

    # Top movers (1Y appreciation, latest snapshot)
    movers = sorted(
        [
            {
                "name": a.name,
                "metric": "1Y appreciation",
                "change_pct": float(s.appreciation_1y) if s.appreciation_1y else 0.0,
            }
            for a, s in pairs
        ],
        key=lambda m: m["change_pct"],
        reverse=True,
    )

    payload = await market_brief(
        avg_yield=avg_yield,
        avg_price_per_sqft=avg_price,
        total_areas=len(pairs),
        top_opportunities=opps[:5],
        top_movers=movers[:5],
    )
    if payload is None:
        # Lightweight fallback so the dashboard always has SOMETHING to render
        return {
            "as_of": "",
            "brief": [
                {
                    "headline": f"{m['name']} leads 1Y appreciation",
                    "body": f"{m['name']} posted {m['change_pct']:+.2f}% appreciation in the last 12 months.",
                    "area_name": m["name"],
                }
                for m in movers[:3]
            ],
            "model": None,
            "tokens": 0,
            "cached": False,
            "fallback_used": True,
        }
    return payload


@router.get("/area/{area_id}")
async def get_area_insight(
    area_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Structured insight for one area. Cached 24h per (area, score, tier)."""
    area = (await db.execute(select(Area).where(Area.id == area_id))).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    history = (
        await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.area_id == area_id)
            .order_by(MarketSnapshot.snapshot_date)
        )
    ).scalars().all()
    if not history:
        raise HTTPException(status_code=404, detail="No snapshots for area")
    latest = history[-1]

    # Need cohort medians for the undervaluation score that drives the cache key.
    pairs = await _all_latest(db)
    cohort_prices = [
        float(s.avg_price_per_sqft) for _, s in pairs
        if s.id != latest.id
    ]
    cohort_yields = [
        float(s.rental_yield) for _, s in pairs if s.id != latest.id
    ]
    report = detect_undervaluation(
        area=area,
        latest=latest,
        history=list(history),
        cohort_prices=cohort_prices,
        cohort_yields=cohort_yields,
    )

    payload = await structured_area_insight(
        area_id=str(area_id),
        area_name=area.name,
        rental_yield=float(latest.rental_yield),
        price_per_sqft=float(latest.avg_price_per_sqft),
        appreciation_1y=float(latest.appreciation_1y) if latest.appreciation_1y else None,
        appreciation_3y=float(latest.appreciation_3y) if latest.appreciation_3y else None,
        risk_score=float(latest.risk_score) if latest.risk_score else None,
        demand_score=float(latest.demand_score) if latest.demand_score else None,
        occupancy=float(latest.occupancy_rate) if latest.occupancy_rate else None,
        transaction_volume=latest.transaction_volume,
        score=report.score,
        tier=report.tier,
    )
    if payload is None:
        raise HTTPException(status_code=503, detail="Insight unavailable")
    return {
        "area_id": str(area_id),
        "area_name": area.name,
        "undervaluation_score": report.score,
        "tier": report.tier,
        **payload,
    }


@router.get("/trends")
async def get_trends(db: AsyncSession = Depends(get_db)) -> dict:
    """Movers + LLM narrative. Cached 24h."""
    areas = (await db.execute(select(Area).order_by(Area.name))).scalars().all()
    universe: list[dict] = []
    for a in areas:
        snaps = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == a.id)
                .order_by(MarketSnapshot.snapshot_date)
            )
        ).scalars().all()
        if not snaps:
            continue
        universe.append(
            {
                "area_id": str(a.id),
                "name": a.name,
                "history": [
                    {
                        "avg_price_per_sqft": float(s.avg_price_per_sqft),
                        "rental_yield": float(s.rental_yield),
                        "transaction_volume": s.transaction_volume or 0,
                    }
                    for s in snaps
                ],
            }
        )
    return await compute_trends(universe=universe)
