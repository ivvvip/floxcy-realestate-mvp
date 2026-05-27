"""Area comparison endpoint."""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.schemas.compare import CompareResponse, CompareAreaData, CompareSnapshotPoint

router = APIRouter(prefix="/api/v1/areas", tags=["compare"])


@router.get("/compare", response_model=CompareResponse)
async def compare_areas(
    ids: str = Query(..., description="Comma-separated area UUIDs (2-4)"),
    db: AsyncSession = Depends(get_db),
):
    """Side-by-side comparison of 2-4 areas with 12-month history."""
    try:
        id_list = [UUID(x.strip()) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "Invalid UUID in ids parameter")

    if not 2 <= len(id_list) <= 4:
        raise HTTPException(400, "Provide 2 to 4 area IDs")

    areas_q = select(Area).where(Area.id.in_(id_list))
    areas = (await db.execute(areas_q)).scalars().all()
    if len(areas) != len(id_list):
        raise HTTPException(404, "One or more areas not found")

    snaps_q = (
        select(MarketSnapshot)
        .where(MarketSnapshot.area_id.in_(id_list))
        .order_by(MarketSnapshot.snapshot_date)
    )
    all_snaps = (await db.execute(snaps_q)).scalars().all()
    by_area: dict = {}
    for s in all_snaps:
        by_area.setdefault(s.area_id, []).append(s)

    result: List[CompareAreaData] = []
    for area in areas:
        snaps = by_area.get(area.id, [])
        if not snaps:
            continue
        latest = snaps[-1]
        history = [
            CompareSnapshotPoint(
                snapshot_date=s.snapshot_date,
                avg_price_per_sqft=float(s.avg_price_per_sqft),
                rental_yield=float(s.rental_yield),
                avg_sale_price=float(s.avg_sale_price),
            )
            for s in snaps
        ]
        result.append(CompareAreaData(
            id=str(area.id),
            name=area.name,
            name_arabic=area.name_arabic,
            area_type=area.area_type,
            latest_price_per_sqft=float(latest.avg_price_per_sqft),
            latest_yield=float(latest.rental_yield),
            latest_sale_price=float(latest.avg_sale_price),
            appreciation_1y=float(latest.appreciation_1y) if latest.appreciation_1y else None,
            appreciation_3y=float(latest.appreciation_3y) if latest.appreciation_3y else None,
            occupancy_rate=float(latest.occupancy_rate) if latest.occupancy_rate else None,
            demand_score=float(latest.demand_score) if latest.demand_score else None,
            risk_score=float(latest.risk_score) if latest.risk_score else None,
            investment_score=float(latest.investment_score) if latest.investment_score else None,
            history=history,
        ))

    return CompareResponse(areas=result)
