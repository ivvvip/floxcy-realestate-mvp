"""Areas API endpoints."""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.dld import DldArea, DldAreaMetrics
from app.models.market_snapshot import MarketSnapshot
from app.schemas.area import (
    AreaResponse,
    AreaStatsResponse,
    AreaDetailResponse,
    AreaLatestSnapshot,
    AreaSnapshotPoint,
    AreaListItem,
)
from app.schemas.dld import MIN_RELIABLE_SAMPLES, cap_yield
from app.services.confidence import build_confidence_report, confidence_to_dict

router = APIRouter(
    prefix="/api/v1/areas",
    tags=["areas"],
    dependencies=[Depends(rate_limit_dependency)],
)


@router.get("", response_model=List[AreaListItem])
async def list_areas(db: AsyncSession = Depends(get_db)):
    """Get all curated areas with their latest market snapshot inline.

    DLD-derived metrics override the curated snapshot when available
    (matched via dld_areas.curated_area_id, 2026-ytd period).
    """
    latest_date_subq = (
        select(
            MarketSnapshot.area_id,
            func.max(MarketSnapshot.snapshot_date).label("latest_date"),
        )
        .group_by(MarketSnapshot.area_id)
        .subquery()
    )
    q = (
        select(Area, MarketSnapshot, DldAreaMetrics)
        .outerjoin(MarketSnapshot, MarketSnapshot.area_id == Area.id)
        .outerjoin(
            latest_date_subq,
            (latest_date_subq.c.area_id == MarketSnapshot.area_id)
            & (latest_date_subq.c.latest_date == MarketSnapshot.snapshot_date),
        )
        .outerjoin(DldArea, DldArea.curated_area_id == Area.id)
        .outerjoin(
            DldAreaMetrics,
            (DldAreaMetrics.dld_area_id == DldArea.id)
            & (DldAreaMetrics.period == "2026-ytd"),
        )
        .where(
            (latest_date_subq.c.latest_date.isnot(None))
            | (MarketSnapshot.id.is_(None))
        )
        .order_by(Area.name)
    )
    rows = (await db.execute(q)).all()

    items = []
    seen = set()
    for area, snap, dld in rows:
        if area.id in seen:
            continue
        seen.add(area.id)

        # Default to curated snapshot
        ppsf = float(snap.avg_price_per_sqft) if snap else None
        yld = float(snap.rental_yield) if snap else None

        # Overlay DLD when available
        if dld:
            if dld.median_price_per_sqft is not None:
                ppsf = float(dld.median_price_per_sqft)
            if (dld.rental_yield_pct is not None
                    and (dld.sales_count or 0) >= MIN_RELIABLE_SAMPLES
                    and (dld.rent_count_2026 or 0) >= MIN_RELIABLE_SAMPLES):
                yld = cap_yield(float(dld.rental_yield_pct))

        items.append(AreaListItem(
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
            latest_price_per_sqft=ppsf,
            latest_yield=yld,
            appreciation_1y=float(snap.appreciation_1y) if snap and snap.appreciation_1y else None,
            investment_score=float(snap.investment_score) if snap and snap.investment_score else None,
        ))
    return items


@router.get("/stats", response_model=AreaStatsResponse)
async def get_areas_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate stats — total reflects full DLD coverage, not just curated."""
    curated_total = await db.scalar(select(func.count()).select_from(Area))
    dld_total = await db.scalar(select(func.count()).select_from(DldArea))

    type_rows = await db.execute(
        select(Area.area_type, func.count()).group_by(Area.area_type)
    )
    count_by_type = {area_type: count for area_type, count in type_rows.all()}

    dld_name_rows = await db.execute(
        select(DldArea.name_display).order_by(DldArea.name_display)
    )
    area_names = [name for (name,) in dld_name_rows.all()]

    return AreaStatsResponse(
        total_count=int(dld_total or 0),
        curated_count=int(curated_total or 0),
        count_by_type=count_by_type,
        area_names=area_names,
    )


@router.get("/{area_id}/undervaluation")
async def area_undervaluation(area_id: UUID, db: AsyncSession = Depends(get_db)):
    """Opportunity Engine report for a single area, including nearby-3 comparison.

    Endpoint name retained for backward compat with existing frontend imports;
    payload now uses the new opportunity_score/opportunity_type contract.
    """
    from app.api.routes.opportunities import _load_universe, _score_all
    from app.services.opportunity_engine import attach_nearby, report_to_dict

    area = (await db.execute(select(Area).where(Area.id == area_id))).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    areas, history_by_id = await _load_universe(db)
    reports = _score_all(areas, history_by_id)
    areas_by_id = {str(a.id): a for a in areas}
    attach_nearby(reports, areas_by_id, k=3)
    target = next((r for r in reports if r.area_id == str(area_id)), None)
    if not target:
        raise HTTPException(status_code=404, detail="No snapshots for area")
    return report_to_dict(target)


@router.get("/{area_id}/confidence")
async def area_confidence(area_id: UUID, db: AsyncSession = Depends(get_db)):
    """Data confidence breakdown for a single area."""
    area = (await db.execute(select(Area).where(Area.id == area_id))).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    snaps = (
        await db.execute(
            select(MarketSnapshot)
            .where(MarketSnapshot.area_id == area_id)
            .order_by(MarketSnapshot.snapshot_date)
        )
    ).scalars().all()
    report = build_confidence_report(area, list(snaps))
    return {
        "area_id": str(area_id),
        "area_name": area.name,
        **confidence_to_dict(report),
    }


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
