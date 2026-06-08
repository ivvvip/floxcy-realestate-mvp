"""Dashboard summary endpoint — real DLD only (World B retired, Phase 1).

Market-wide aggregates + top areas come from the same DLD universe and scoring
as /opportunities (no seeded market_snapshots). The price trend is the real
DLD yearly series aggregated across areas.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dld import DldAreaMetrics
from app.schemas.dashboard import DashboardSummary, TopAreaItem, TrendPoint
from app.api.routes.opportunities import _load_universe_dld, _score_all_dld

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

# Yearly market trend across all areas (real DLD): avg area-median ppsf + avg
# derived gross yield per year. Replaces the monthly seeded snapshot trend.
_TREND_SQL = text(
    """
    SELECT p.year AS year,
           AVG(p.avg_ppsf_all) AS avg_ppsf,
           (SELECT AVG(y.gross_yield_pct) FROM dld_yield_history y WHERE y.year = p.year) AS avg_yield
    FROM dld_price_history p
    WHERE p.avg_ppsf_all IS NOT NULL
    GROUP BY p.year
    ORDER BY p.year
    """
)


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Market-wide aggregates derived from real DLD area metrics + scoring."""
    total_areas = await db.scalar(
        select(func.count()).select_from(DldAreaMetrics).where(
            DldAreaMetrics.period == "2026-ytd"
        )
    ) or 0

    inputs = await _load_universe_dld(db)
    if not inputs:
        return DashboardSummary(
            total_areas=int(total_areas), avg_yield=0, avg_price_per_sqft=0,
            top_performer=None, total_transaction_volume=0, top_areas=[], price_trend=[],
        )
    reports = _score_all_dld(inputs)

    yields = [
        float(r.key_metrics.rental_yield)
        for r in reports if r.key_metrics.rental_yield is not None
    ]
    prices = [i.price_per_sqft for i in inputs if i.price_per_sqft is not None]
    total_vol = sum(i.sales_count for i in inputs)

    avg_yield = round(sum(yields) / len(yields), 2) if yields else 0
    avg_pps = round(sum(prices) / len(prices), 2) if prices else 0

    # Top areas by opportunity score; TopAreaItem requires non-null price+yield,
    # so restrict to scored areas that carry a real (gated) yield.
    ranked = sorted(
        [r for r in reports
         if r.key_metrics.rental_yield is not None and r.key_metrics.price_per_sqft is not None],
        key=lambda r: r.opportunity_score, reverse=True,
    )
    top_5 = [
        TopAreaItem(
            id=r.area_id,
            name=r.area_name,
            name_arabic=r.area_name_arabic,
            area_type=r.area_type,
            avg_price_per_sqft=float(r.key_metrics.price_per_sqft),
            rental_yield=float(r.key_metrics.rental_yield),
            appreciation_1y=r.key_metrics.appreciation_1y,
            investment_score=r.key_metrics.investment_score,
        )
        for r in ranked[:5]
    ]
    top_performer = top_5[0] if top_5 else None

    trend_rows = (await db.execute(_TREND_SQL)).mappings().all()
    price_trend = [
        TrendPoint(
            month=str(int(row["year"])),
            avg_price_per_sqft=round(float(row["avg_ppsf"]), 2) if row["avg_ppsf"] is not None else 0.0,
            avg_yield=round(float(row["avg_yield"]), 2) if row["avg_yield"] is not None else 0.0,
        )
        for row in trend_rows
    ]

    return DashboardSummary(
        total_areas=int(total_areas),
        avg_yield=avg_yield,
        avg_price_per_sqft=avg_pps,
        top_performer=top_performer,
        total_transaction_volume=int(total_vol),
        top_areas=top_5,
        price_trend=price_trend,
    )
