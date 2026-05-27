"""Areas API endpoints."""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.schemas.area import (
    AreaResponse,
    AreaStatsResponse,
    AreaDetailResponse,
    AreaLatestSnapshot,
    AreaSnapshotPoint,
)

router = APIRouter(prefix="/api/v1/areas", tags=["areas"])


@router.get("", response_model=List[AreaResponse])
async def list_areas(db: AsyncSession = Depends(get_db)):
    """Get all areas."""
    result = await db.execute(select(Area).order_by(Area.name))
    areas = result.scalars().all()
    return areas


@router.get("/stats", response_model=AreaStatsResponse)
async def get_areas_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate stats across all areas."""
    total = await db.scalar(select(func.count()).select_from(Area))

    type_rows = await db.execute(
        select(Area.area_type, func.count()).group_by(Area.area_type)
    )
    count_by_type = {area_type: count for area_type, count in type_rows.all()}

    name_rows = await db.execute(select(Area.name).order_by(Area.name))
    area_names = [name for (name,) in name_rows.all()]

    return AreaStatsResponse(
        total_count=total or 0,
        count_by_type=count_by_type,
        area_names=area_names,
    )


@router.get("/{area_id}", response_model=AreaDetailResponse)
async def get_area(area_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get area detail including latest snapshot and 12-month history."""
    result = await db.execute(select(Area).where(Area.id == area_id))
    area = result.scalar_one_or_none()

    if not area:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Area with id {area_id} not found"
        )

    snaps_q = (
        select(MarketSnapshot)
        .where(MarketSnapshot.area_id == area_id)
        .order_by(MarketSnapshot.snapshot_date)
    )
    snaps = (await db.execute(snaps_q)).scalars().all()

    latest = None
    history: List[AreaSnapshotPoint] = []
    if snaps:
        last = snaps[-1]
        latest = AreaLatestSnapshot(
            snapshot_date=last.snapshot_date.isoformat(),
            avg_sale_price=float(last.avg_sale_price),
            avg_price_per_sqft=float(last.avg_price_per_sqft),
            avg_annual_rent=float(last.avg_annual_rent),
            rental_yield=float(last.rental_yield),
            occupancy_rate=float(last.occupancy_rate) if last.occupancy_rate else None,
            appreciation_1y=float(last.appreciation_1y) if last.appreciation_1y else None,
            appreciation_3y=float(last.appreciation_3y) if last.appreciation_3y else None,
            transaction_volume=last.transaction_volume,
            demand_score=float(last.demand_score) if last.demand_score else None,
            risk_score=float(last.risk_score) if last.risk_score else None,
            investment_score=float(last.investment_score) if last.investment_score else None,
        )
        history = [
            AreaSnapshotPoint(
                snapshot_date=s.snapshot_date.isoformat(),
                avg_price_per_sqft=float(s.avg_price_per_sqft),
                avg_sale_price=float(s.avg_sale_price),
                rental_yield=float(s.rental_yield),
            )
            for s in snaps
        ]

    return AreaDetailResponse(
        id=area.id,
        name=area.name,
        name_arabic=area.name_arabic,
        city=area.city,
        emirate=area.emirate,
        description=area.description,
        area_type=area.area_type,
        latitude=area.latitude,
        longitude=area.longitude,
        created_at=area.created_at,
        updated_at=area.updated_at,
        latest=latest,
        history=history,
    )
