"""Dashboard summary endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.schemas.dashboard import DashboardSummary, TopAreaItem, TrendPoint

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Market-wide aggregates derived from the latest snapshot per area."""
    total_areas = await db.scalar(select(func.count()).select_from(Area)) or 0

    # Latest snapshot per area via correlated subquery
    latest_date_subq = (
        select(
            MarketSnapshot.area_id,
            func.max(MarketSnapshot.snapshot_date).label("latest_date"),
        )
        .group_by(MarketSnapshot.area_id)
        .subquery()
    )

    latest_q = (
        select(Area, MarketSnapshot)
        .join(MarketSnapshot, MarketSnapshot.area_id == Area.id)
        .join(
            latest_date_subq,
            (latest_date_subq.c.area_id == MarketSnapshot.area_id)
            & (latest_date_subq.c.latest_date == MarketSnapshot.snapshot_date),
        )
    )
    rows = (await db.execute(latest_q)).all()

    if not rows:
        return DashboardSummary(
            total_areas=total_areas,
            avg_yield=0,
            avg_price_per_sqft=0,
            top_performer=None,
            total_transaction_volume=0,
            top_areas=[],
            price_trend=[],
        )

    yields = [float(s.rental_yield) for _, s in rows]
    prices = [float(s.avg_price_per_sqft) for _, s in rows]
    volumes = [int(s.transaction_volume or 0) for _, s in rows]

    avg_yield = round(sum(yields) / len(yields), 2)
    avg_pps = round(sum(prices) / len(prices), 2)
    total_vol = sum(volumes)

    # Build top areas by investment_score (or yield if missing)
    items = [
        TopAreaItem(
            id=str(area.id),
            name=area.name,
            name_arabic=area.name_arabic,
            area_type=area.area_type,
            avg_price_per_sqft=float(snap.avg_price_per_sqft),
            rental_yield=float(snap.rental_yield),
            appreciation_1y=float(snap.appreciation_1y) if snap.appreciation_1y else None,
            investment_score=float(snap.investment_score) if snap.investment_score else None,
        )
        for area, snap in rows
    ]
    items.sort(key=lambda x: x.investment_score or x.rental_yield, reverse=True)
    top_5 = items[:5]
    top_performer = top_5[0] if top_5 else None

    # Price trend: aggregate avg price_per_sqft and yield per month across all areas
    trend_q = (
        select(
            MarketSnapshot.snapshot_date,
            func.avg(MarketSnapshot.avg_price_per_sqft).label("avg_pps"),
            func.avg(MarketSnapshot.rental_yield).label("avg_yield"),
        )
        .group_by(MarketSnapshot.snapshot_date)
        .order_by(MarketSnapshot.snapshot_date)
    )
    trend_rows = (await db.execute(trend_q)).all()
    price_trend = [
        TrendPoint(
            month=row.snapshot_date.strftime("%Y-%m"),
            avg_price_per_sqft=round(float(row.avg_pps), 2),
            avg_yield=round(float(row.avg_yield), 2),
        )
        for row in trend_rows
    ]

    return DashboardSummary(
        total_areas=total_areas,
        avg_yield=avg_yield,
        avg_price_per_sqft=avg_pps,
        top_performer=top_performer,
        total_transaction_volume=total_vol,
        top_areas=top_5,
        price_trend=price_trend,
    )
