"""Area comparison endpoint."""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.area import Area
from app.models.dld import DldArea, DldAreaMetrics
from app.models.market_snapshot import MarketSnapshot
from app.schemas.compare import (
    CompareAreaData,
    CompareDldBlock,
    CompareResponse,
    CompareSnapshotPoint,
)
from app.schemas.dld import MIN_RELIABLE_SAMPLES, cap_yield, confidence_for

router = APIRouter(prefix="/api/v1/areas", tags=["compare"])


@router.get("/compare", response_model=CompareResponse)
async def compare_areas(
    ids: str = Query(..., description="Comma-separated area UUIDs (2-4)"),
    db: AsyncSession = Depends(get_db),
):
    """Side-by-side comparison of 2-4 areas with 12-month history + DLD overlay."""
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

    # DLD overlay for the same area set (matched by curated_area_id)
    dld_rows = (
        await db.execute(
            select(DldArea, DldAreaMetrics)
            .outerjoin(
                DldAreaMetrics,
                (DldAreaMetrics.dld_area_id == DldArea.id)
                & (DldAreaMetrics.period == "2026-ytd"),
            )
            .where(DldArea.curated_area_id.in_(id_list))
        )
    ).all()
    dld_by_curated: dict = {}
    for da, dm in dld_rows:
        dld_by_curated[da.curated_area_id] = (da, dm)

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

        dld_block = None
        if area.id in dld_by_curated:
            da, dm = dld_by_curated[area.id]
            sales = dm.sales_count if dm else 0
            rents = dm.rent_count_2026 if dm else 0
            show_yield = None
            if (dm and dm.rental_yield_pct is not None
                    and sales >= MIN_RELIABLE_SAMPLES
                    and rents >= MIN_RELIABLE_SAMPLES):
                show_yield = cap_yield(float(dm.rental_yield_pct))
            dld_block = CompareDldBlock(
                dld_area_id=da.id,
                dld_name=da.name_display,
                median_price_per_sqft=float(dm.median_price_per_sqft) if dm and dm.median_price_per_sqft is not None else None,
                median_annual_rent=float(dm.median_annual_rent) if dm and dm.median_annual_rent is not None else None,
                median_rent_per_sqft=float(dm.median_rent_per_sqft) if dm and dm.median_rent_per_sqft is not None else None,
                rental_yield_pct=show_yield,
                rent_growth_yoy_pct=float(dm.rent_growth_yoy_pct) if dm and dm.rent_growth_yoy_pct is not None else None,
                sales_count=sales,
                rent_count_2026=rents,
                confidence=confidence_for(max(sales, rents)),
            )

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
            dld=dld_block,
        ))

    return CompareResponse(areas=result)
