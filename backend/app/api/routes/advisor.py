"""Rules-based investment advisor endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.schemas.advisor import AdvisorQueryRequest, AdvisorQueryResponse
from app.services.advisor import build_recommendations

router = APIRouter(prefix="/api/v1/advisor", tags=["advisor"])


@router.post("/query", response_model=AdvisorQueryResponse)
async def advisor_query(
    request: AdvisorQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rank areas by goal/risk preference (rules-based, no LLM)."""
    latest_date_subq = (
        select(
            MarketSnapshot.area_id,
            func.max(MarketSnapshot.snapshot_date).label("latest_date"),
        )
        .group_by(MarketSnapshot.area_id)
        .subquery()
    )
    q = (
        select(Area, MarketSnapshot)
        .join(MarketSnapshot, MarketSnapshot.area_id == Area.id)
        .join(
            latest_date_subq,
            (latest_date_subq.c.area_id == MarketSnapshot.area_id)
            & (latest_date_subq.c.latest_date == MarketSnapshot.snapshot_date),
        )
    )
    rows = (await db.execute(q)).all()

    snapshots = [
        {
            "area_id": area.id,
            "area_name": area.name,
            "area_name_arabic": area.name_arabic,
            "avg_price_per_sqft": float(snap.avg_price_per_sqft),
            "rental_yield": float(snap.rental_yield),
            "appreciation_1y": float(snap.appreciation_1y) if snap.appreciation_1y else None,
            "risk_score": float(snap.risk_score) if snap.risk_score else None,
            "investment_score": float(snap.investment_score) if snap.investment_score else None,
        }
        for area, snap in rows
    ]

    return build_recommendations(request, snapshots)
