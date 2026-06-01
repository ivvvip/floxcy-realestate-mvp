"""DLD-sourced endpoints — areas, buildings, rent fairness, RERA brokers."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld import (
    DldArea,
    DldAreaMetrics,
    DldBuilding,
    DldRentBenchmark,
    DldReraBroker,
)
from app.schemas.dld import (
    DISPLAY_YIELD_CAP_PCT,
    MIN_RELIABLE_SAMPLES,
    DldAreaDetail,
    DldAreaDetailResponse,
    DldAreaListItem,
    DldAreaListResponse,
    DldBrokerItem,
    DldBrokersResponse,
    DldBuildingItem,
    DldBuildingsResponse,
    DldStatsResponse,
    RentCheckRequest,
    RentCheckResponse,
    RentCheckSuggestion,
    cap_yield,
    confidence_for,
)

router = APIRouter(
    prefix="/api/v1/dld",
    tags=["dld"],
    dependencies=[Depends(rate_limit_dependency)],
)


SIZE_BANDS = [
    ("<50", 0, 50),
    ("50-99", 50, 100),
    ("100-149", 100, 150),
    ("150-199", 150, 200),
    ("200-299", 200, 300),
    ("300+", 300, float("inf")),
]


def _size_band(sqm: float) -> str:
    for label, lo, hi in SIZE_BANDS:
        if lo <= sqm < hi:
            return label
    return "300+"


def _build_area_item(area: DldArea, m: Optional[DldAreaMetrics]) -> DldAreaListItem:
    yld = float(m.rental_yield_pct) if m and m.rental_yield_pct is not None else None
    sales = m.sales_count if m else 0
    rents = m.rent_count_2026 if m else 0
    # Only expose yield when both samples are sufficient; cap the display
    show_yield = yld if (sales >= MIN_RELIABLE_SAMPLES and rents >= MIN_RELIABLE_SAMPLES) else None
    return DldAreaListItem(
        id=area.id,
        name=area.name_display,
        name_norm=area.name_norm,
        median_price_per_sqft=float(m.median_price_per_sqft) if m and m.median_price_per_sqft is not None else None,
        median_annual_rent=float(m.median_annual_rent) if m and m.median_annual_rent is not None else None,
        median_rent_per_sqft=float(m.median_rent_per_sqft) if m and m.median_rent_per_sqft is not None else None,
        rental_yield_pct=cap_yield(show_yield),
        rent_growth_yoy_pct=float(m.rent_growth_yoy_pct) if m and m.rent_growth_yoy_pct is not None else None,
        sales_count=sales,
        rent_count_2026=rents,
        confidence=confidence_for(max(sales, rents)),
    )


# ---------------------------------------------------------------------------
# Areas
# ---------------------------------------------------------------------------

@router.get("/areas", response_model=DldAreaListResponse)
async def list_dld_areas(
    db: AsyncSession = Depends(get_db),
    q: Optional[str] = Query(None, description="filter by area name (case-insensitive substring)"),
    min_sales: int = Query(0, ge=0),
    min_rents: int = Query(0, ge=0),
    has_yield: bool = Query(False, description="only areas with displayable yield"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List DLD areas with current 2026-YTD metrics."""
    stmt = (
        select(DldArea, DldAreaMetrics)
        .outerjoin(
            DldAreaMetrics,
            and_(DldAreaMetrics.dld_area_id == DldArea.id, DldAreaMetrics.period == "2026-ytd"),
        )
    )
    conds = []
    if q:
        conds.append(DldArea.name_norm.ilike(f"%{q.strip().lower()}%"))
    if min_sales > 0:
        conds.append(DldAreaMetrics.sales_count >= min_sales)
    if min_rents > 0:
        conds.append(DldAreaMetrics.rent_count_2026 >= min_rents)
    if has_yield:
        conds.append(DldAreaMetrics.rental_yield_pct.isnot(None))
        conds.append(DldAreaMetrics.sales_count >= MIN_RELIABLE_SAMPLES)
        conds.append(DldAreaMetrics.rent_count_2026 >= MIN_RELIABLE_SAMPLES)
    if conds:
        stmt = stmt.where(and_(*conds))

    count_stmt = (
        select(func.count())
        .select_from(DldArea)
        .outerjoin(
            DldAreaMetrics,
            and_(DldAreaMetrics.dld_area_id == DldArea.id, DldAreaMetrics.period == "2026-ytd"),
        )
    )
    if conds:
        count_stmt = count_stmt.where(and_(*conds))
    total = await db.scalar(count_stmt)

    stmt = stmt.order_by(DldArea.name_display).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).all()
    items = [_build_area_item(a, m) for a, m in rows]
    return DldAreaListResponse(count=len(items), total_available=int(total or 0), items=items)


@router.get("/areas/stats", response_model=DldStatsResponse)
async def dld_stats(db: AsyncSession = Depends(get_db)):
    total_areas = await db.scalar(select(func.count()).select_from(DldArea))
    areas_with_metrics = await db.scalar(
        select(func.count(func.distinct(DldAreaMetrics.dld_area_id))).where(
            DldAreaMetrics.period == "2026-ytd"
        )
    )
    areas_with_full_yield = await db.scalar(
        select(func.count())
        .select_from(DldAreaMetrics)
        .where(
            DldAreaMetrics.period == "2026-ytd",
            DldAreaMetrics.rental_yield_pct.isnot(None),
            DldAreaMetrics.sales_count >= MIN_RELIABLE_SAMPLES,
            DldAreaMetrics.rent_count_2026 >= MIN_RELIABLE_SAMPLES,
        )
    )
    total_buildings = await db.scalar(select(func.count()).select_from(DldBuilding))
    total_active_brokers = await db.scalar(
        select(func.count()).select_from(DldReraBroker).where(DldReraBroker.is_active.is_(True))
    )
    total_benchmarks = await db.scalar(select(func.count()).select_from(DldRentBenchmark))

    return DldStatsResponse(
        total_areas=int(total_areas or 0),
        areas_with_metrics=int(areas_with_metrics or 0),
        areas_with_full_yield=int(areas_with_full_yield or 0),
        total_buildings=int(total_buildings or 0),
        total_active_brokers=int(total_active_brokers or 0),
        total_rent_benchmark_cells=int(total_benchmarks or 0),
    )


@router.get("/areas/{name_or_norm}", response_model=DldAreaDetailResponse)
async def get_dld_area(name_or_norm: str, db: AsyncSession = Depends(get_db)):
    """Get one area by name_norm (case-insensitive)."""
    norm = name_or_norm.strip().lower()
    row = (
        await db.execute(
            select(DldArea, DldAreaMetrics)
            .outerjoin(
                DldAreaMetrics,
                and_(DldAreaMetrics.dld_area_id == DldArea.id, DldAreaMetrics.period == "2026-ytd"),
            )
            .where(DldArea.name_norm == norm)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Area not found")
    area, m = row
    base = _build_area_item(area, m)
    detail = DldAreaDetail(
        **base.model_dump(),
        building_count=area.building_count,
        avg_price_per_sqft=float(m.avg_price_per_sqft) if m and m.avg_price_per_sqft is not None else None,
        avg_annual_rent=float(m.avg_annual_rent) if m and m.avg_annual_rent is not None else None,
        avg_rent_per_sqft=float(m.avg_rent_per_sqft) if m and m.avg_rent_per_sqft is not None else None,
    )
    return DldAreaDetailResponse(area=detail)


# ---------------------------------------------------------------------------
# Buildings
# ---------------------------------------------------------------------------

@router.get("/buildings", response_model=DldBuildingsResponse)
async def list_buildings(
    db: AsyncSession = Depends(get_db),
    area: Optional[str] = Query(None, description="filter by area name_norm"),
    project: Optional[str] = Query(None, description="filter by project_name substring"),
    min_rents: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = (
        select(DldBuilding, DldArea.name_display)
        .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
    )
    conds = []
    if area:
        conds.append(DldArea.name_norm == area.strip().lower())
    if project:
        conds.append(DldBuilding.project_name.ilike(f"%{project.strip()}%"))
    if min_rents > 0:
        conds.append(DldBuilding.active_rent_count >= min_rents)
    if conds:
        stmt = stmt.where(and_(*conds))

    count_stmt = (
        select(func.count())
        .select_from(DldBuilding)
        .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
    )
    if conds:
        count_stmt = count_stmt.where(and_(*conds))
    total = await db.scalar(count_stmt)

    stmt = stmt.order_by(DldBuilding.active_rent_count.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).all()
    items = [
        DldBuildingItem(
            id=b.id,
            project_name=b.project_name,
            master_project=b.master_project,
            area_name=area_name,
            prop_sub_type=b.prop_sub_type,
            flats=b.flats,
            floors=b.floors,
            avg_annual_rent=float(b.avg_annual_rent) if b.avg_annual_rent is not None else None,
            avg_rent_per_sqft=float(b.avg_rent_per_sqft) if b.avg_rent_per_sqft is not None else None,
            active_rent_count=b.active_rent_count,
            occupancy_proxy_pct=float(b.occupancy_proxy_pct) if b.occupancy_proxy_pct is not None else None,
            is_freehold=b.is_freehold,
        )
        for b, area_name in rows
    ]
    return DldBuildingsResponse(count=len(items), total_available=int(total or 0), items=items)


# ---------------------------------------------------------------------------
# Rent check — "Is your rent fair?"
# ---------------------------------------------------------------------------

@router.post("/rent-check", response_model=RentCheckResponse)
async def rent_check(req: RentCheckRequest, db: AsyncSession = Depends(get_db)):
    norm_area = req.area_name.strip().lower()
    band = _size_band(req.size_sqm)

    # Resolve area
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm_area))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail=f"Area '{req.area_name}' not found in DLD data")

    # Lookup benchmark for this (area, prop_sub_type, size_band)
    bm = (
        await db.execute(
            select(DldRentBenchmark).where(
                DldRentBenchmark.dld_area_id == area.id,
                DldRentBenchmark.prop_sub_type == req.prop_sub_type,
                DldRentBenchmark.size_band == band,
                DldRentBenchmark.period == "2026",
            )
        )
    ).scalar_one_or_none()
    if not bm:
        raise HTTPException(
            status_code=404,
            detail=f"No rent benchmark for {area.name_display} / {req.prop_sub_type} / size {band}sqm. "
                   f"Try a different size band or property type.",
        )

    median = float(bm.median_annual_rent)
    diff_pct = ((req.annual_rent - median) / median) * 100

    # Verdict bands: ±10% = fair, otherwise above/below
    if req.annual_rent > float(bm.p75_annual_rent):
        verdict = "above_market"
    elif req.annual_rent < float(bm.p25_annual_rent):
        verdict = "below_market"
    else:
        verdict = "fair"

    # Empirical percentile from the 5-point CDF (p10, p25, p50, p75, p90)
    knots = [
        (float(bm.p10_annual_rent), 0.10),
        (float(bm.p25_annual_rent), 0.25),
        (float(bm.median_annual_rent), 0.50),
        (float(bm.p75_annual_rent), 0.75),
        (float(bm.p90_annual_rent), 0.90),
    ]
    pct = _interp_percentile(knots, req.annual_rent)

    # YoY trend from area metrics (not the benchmark cell itself)
    am = (
        await db.execute(
            select(DldAreaMetrics).where(
                DldAreaMetrics.dld_area_id == area.id, DldAreaMetrics.period == "2026-ytd"
            )
        )
    ).scalar_one_or_none()
    yoy = float(am.rent_growth_yoy_pct) if am and am.rent_growth_yoy_pct is not None else None

    # Suggested similar cheaper areas — same prop_sub_type + size_band, lower median, ≥5 samples
    cheaper_stmt = (
        select(DldRentBenchmark, DldArea.name_display)
        .join(DldArea, DldArea.id == DldRentBenchmark.dld_area_id)
        .where(
            DldRentBenchmark.prop_sub_type == req.prop_sub_type,
            DldRentBenchmark.size_band == band,
            DldRentBenchmark.period == "2026",
            DldRentBenchmark.median_annual_rent < median,
            DldArea.id != area.id,
        )
        .order_by(DldRentBenchmark.median_annual_rent.desc())
        .limit(3)
    )
    rows = (await db.execute(cheaper_stmt)).all()
    suggestions = [
        RentCheckSuggestion(
            area_name=disp,
            median_annual_rent=float(b.median_annual_rent),
            median_rent_per_sqft=float(b.median_rent_per_sqft),
            saving_pct=round((median - float(b.median_annual_rent)) / median * 100, 1),
            sample_size=b.sample_count,
        )
        for b, disp in rows
    ]

    return RentCheckResponse(
        user_rent=req.annual_rent,
        area_median=round(median, 2),
        percentile=round(pct * 100, 1),
        verdict=verdict,
        percentage_diff=round(diff_pct, 1),
        sample_size=bm.sample_count,
        yoy_trend=round(yoy, 2) if yoy is not None else None,
        size_band=band,
        confidence=confidence_for(bm.sample_count),
        suggested_areas=suggestions,
    )


def _interp_percentile(knots: list[tuple[float, float]], x: float) -> float:
    """Linear interpolation between empirical knots. Clamp to [0.05, 0.95]."""
    if x <= knots[0][0]:
        return 0.05
    if x >= knots[-1][0]:
        return 0.95
    for (x1, p1), (x2, p2) in zip(knots, knots[1:]):
        if x1 <= x <= x2:
            if x2 == x1:
                return p1
            return p1 + (p2 - p1) * (x - x1) / (x2 - x1)
    return 0.5


# ---------------------------------------------------------------------------
# RERA Brokers directory
# ---------------------------------------------------------------------------

@router.get("/brokers", response_model=DldBrokersResponse)
async def list_brokers(
    db: AsyncSession = Depends(get_db),
    q: Optional[str] = Query(None, description="search by name (case-insensitive)"),
    firm: Optional[str] = Query(None, description="search by real_estate_name"),
    active: Optional[bool] = Query(True, description="True = active only, False = expired, None = all"),
    gender: Optional[str] = Query(None, pattern="^(male|female)$"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(DldReraBroker)
    conds = []
    if q:
        conds.append(DldReraBroker.full_name.ilike(f"%{q.strip()}%"))
    if firm:
        conds.append(DldReraBroker.real_estate_name.ilike(f"%{firm.strip()}%"))
    if active is not None:
        conds.append(DldReraBroker.is_active.is_(active))
    if gender:
        conds.append(DldReraBroker.gender == gender)
    if conds:
        stmt = stmt.where(and_(*conds))

    count_stmt = select(func.count()).select_from(DldReraBroker)
    if conds:
        count_stmt = count_stmt.where(and_(*conds))
    total = await db.scalar(count_stmt)

    stmt = stmt.order_by(DldReraBroker.full_name).limit(limit).offset(offset)
    brokers = (await db.execute(stmt)).scalars().all()
    items = [DldBrokerItem.model_validate(b) for b in brokers]
    return DldBrokersResponse(count=len(items), total_available=int(total or 0), items=items)


@router.get("/brokers/{broker_number}", response_model=DldBrokerItem)
async def get_broker(broker_number: str, db: AsyncSession = Depends(get_db)):
    b = (
        await db.execute(
            select(DldReraBroker).where(DldReraBroker.broker_number == broker_number)
        )
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Broker not found")
    return DldBrokerItem.model_validate(b)
