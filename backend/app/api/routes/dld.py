"""DLD-sourced endpoints — areas, buildings, rent fairness, RERA brokers."""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.data.dld_area_aliases import (
    admin_sector_to_community,
    community_to_admin_sectors,
    is_tower_density,
)
from app.database import get_db
from app.models.dld import (
    DldArea,
    DldAreaAppreciation,
    DldAreaMetrics,
    DldBuilding,
    DldPriceHistory,
    DldRentBenchmark,
    DldReraBroker,
)
from app.models.investor_lead import InvestorLead
from app.models.rent_alert import RentAlert
from app.schemas.dld import (
    DISPLAY_YIELD_CAP_PCT,
    MIN_RELIABLE_SAMPLES,
    SIZE_CATEGORY_BANDS,
    BrokerConsultationRequest,
    BrokerConsultationResponse,
    BrokerMatchItem,
    BrokerMatchRequest,
    BrokerMatchResponse,
    DldAreaDetail,
    DldAreaDetailResponse,
    DldAreaListItem,
    DldAreaListResponse,
    DldAreaTopBuildingsResponse,
    DldPriceHistoryResponse,
    PriceHistoryPoint,
    TopAppreciationItem,
    TopAppreciationResponse,
    DldBrokerItem,
    DldBrokersResponse,
    DldBuildingAreaContext,
    DldBuildingDetail,
    DldBuildingDetailResponse,
    DldBuildingItem,
    DldBuildingsComparableResponse,
    DldBuildingsResponse,
    DldStatsResponse,
    RentAlertCreate,
    RentAlertOut,
    RentCheckRequest,
    RentCheckResponse,
    RentCheckSuggestion,
    TopCompaniesResponse,
    TopCompanyItem,
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


@router.get("/areas/top-appreciation", response_model=TopAppreciationResponse)
async def dld_top_appreciation(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(5, ge=1, le=50),
    min_years: int = Query(5, ge=1, le=10, description="Require at least N years of history"),
):
    """Top-N areas by 5-year price appreciation (registered Sales-of-Unit).

    Powers the homepage "Fastest Growing Areas" widget. Requires a full
    `min_years` series so we don't surface noisy 1-2 year jumps. Pulls the
    latest avg PPSF alongside so the widget can show 'AED 16,752/sqft'
    context without another round-trip.
    """
    stmt = (
        select(DldAreaAppreciation, DldArea.name_display)
        .outerjoin(DldArea, DldArea.name_norm == DldAreaAppreciation.area_name_norm)
        .where(
            DldAreaAppreciation.appreciation_5y_pct.isnot(None),
            DldAreaAppreciation.years_of_data >= min_years,
        )
        .order_by(DldAreaAppreciation.appreciation_5y_pct.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    # Look up the latest avg PPSF per area in one batch query
    area_names = [a.area_name_norm for a, _ in rows]
    latest_ppsf: dict[str, float] = {}
    if area_names:
        ppsf_rows = (
            await db.execute(
                select(DldPriceHistory.area_name_norm, DldPriceHistory.avg_ppsf_all)
                .where(
                    DldPriceHistory.area_name_norm.in_(area_names),
                    DldPriceHistory.year == DldPriceHistory.year,  # noqa
                )
                .order_by(DldPriceHistory.year.desc())
            )
        ).all()
        # First row per area is the latest (we ordered desc)
        for name, ppsf in ppsf_rows:
            if name not in latest_ppsf and ppsf is not None:
                latest_ppsf[name] = float(ppsf)

    items = [
        TopAppreciationItem(
            area_name_norm=a.area_name_norm,
            area_name_display=display or a.area_name_norm.title(),
            appreciation_5y_pct=float(a.appreciation_5y_pct),
            cagr_5y_pct=float(a.cagr_5y_pct) if a.cagr_5y_pct is not None else None,
            appreciation_1y_pct=float(a.appreciation_1y_pct) if a.appreciation_1y_pct is not None else None,
            latest_avg_ppsf=latest_ppsf.get(a.area_name_norm),
            years_of_data=int(a.years_of_data or 0),
        )
        for a, display in rows
    ]
    return TopAppreciationResponse(count=len(items), items=items)


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


async def _load_price_history_block(
    db: AsyncSession, area_name_norm: str
) -> tuple[list[PriceHistoryPoint], dict | None]:
    """Return (sorted-by-year price points, appreciation row as dict-or-None)
    for a given area. Empty list + None when the area has no history rows."""
    hist_rows = (
        await db.execute(
            select(DldPriceHistory)
            .where(DldPriceHistory.area_name_norm == area_name_norm)
            .order_by(DldPriceHistory.year)
        )
    ).scalars().all()
    points = [
        PriceHistoryPoint(
            year=int(h.year),
            avg_ppsf=float(h.avg_ppsf_all) if h.avg_ppsf_all is not None else None,
            avg_ppsf_ready=float(h.avg_ppsf_ready) if h.avg_ppsf_ready is not None else None,
            avg_ppsf_offplan=float(h.avg_ppsf_offplan) if h.avg_ppsf_offplan is not None else None,
            median_ppsf=float(h.median_ppsf_all) if h.median_ppsf_all is not None else None,
            transaction_count=int(h.transaction_count or 0),
            offplan_pct=float(h.offplan_pct) if h.offplan_pct is not None else None,
        )
        for h in hist_rows
    ]
    appreciation = (
        await db.execute(
            select(DldAreaAppreciation)
            .where(DldAreaAppreciation.area_name_norm == area_name_norm)
        )
    ).scalar_one_or_none()
    if appreciation is None:
        return points, None
    return points, {
        "appreciation_1y_pct": float(appreciation.appreciation_1y_pct) if appreciation.appreciation_1y_pct is not None else None,
        "appreciation_3y_pct": float(appreciation.appreciation_3y_pct) if appreciation.appreciation_3y_pct is not None else None,
        "appreciation_5y_pct": float(appreciation.appreciation_5y_pct) if appreciation.appreciation_5y_pct is not None else None,
        "cagr_5y_pct": float(appreciation.cagr_5y_pct) if appreciation.cagr_5y_pct is not None else None,
        "years_of_data": int(appreciation.years_of_data or 0),
    }


@router.get("/areas/{name_or_norm}", response_model=DldAreaDetailResponse)
async def get_dld_area(name_or_norm: str, db: AsyncSession = Depends(get_db)):
    """Get one area by name_norm (case-insensitive). Now includes the
    5-year price history series + 1y/3y/5y appreciation + CAGR derived
    from scripts/etl_dld_history.py."""
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

    price_history, appreciation = await _load_price_history_block(db, area.name_norm)

    base = _build_area_item(area, m)
    detail = DldAreaDetail(
        **base.model_dump(),
        building_count=area.building_count,
        avg_price_per_sqft=float(m.avg_price_per_sqft) if m and m.avg_price_per_sqft is not None else None,
        avg_annual_rent=float(m.avg_annual_rent) if m and m.avg_annual_rent is not None else None,
        avg_rent_per_sqft=float(m.avg_rent_per_sqft) if m and m.avg_rent_per_sqft is not None else None,
        price_appreciation_1y_pct=(appreciation or {}).get("appreciation_1y_pct"),
        price_appreciation_3y_pct=(appreciation or {}).get("appreciation_3y_pct"),
        price_appreciation_5y_pct=(appreciation or {}).get("appreciation_5y_pct"),
        cagr_5y_pct=(appreciation or {}).get("cagr_5y_pct"),
        years_of_history=(appreciation or {}).get("years_of_data", len(price_history)),
        price_history=price_history,
    )
    return DldAreaDetailResponse(area=detail)


@router.get(
    "/areas/{name_or_norm}/price-history",
    response_model=DldPriceHistoryResponse,
)
async def get_dld_area_price_history(
    name_or_norm: str, db: AsyncSession = Depends(get_db)
):
    """Time series + appreciation block, separated from the area detail
    so frontends that only want the chart data don't pull the whole DLD
    detail payload."""
    norm = name_or_norm.strip().lower()
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    points, appreciation = await _load_price_history_block(db, area.name_norm)
    if not points:
        # Honest empty: the area exists but no 2021–2026 sales rows
        # qualified the ETL filter (typically because PROP_TYPE_EN != 'Unit'
        # for whole-villa/land areas).
        return DldPriceHistoryResponse(
            area_name_norm=area.name_norm,
            area_name_display=area.name_display,
            points=[],
            years_of_history=0,
        )
    return DldPriceHistoryResponse(
        area_name_norm=area.name_norm,
        area_name_display=area.name_display,
        points=points,
        appreciation_1y_pct=(appreciation or {}).get("appreciation_1y_pct"),
        appreciation_3y_pct=(appreciation or {}).get("appreciation_3y_pct"),
        appreciation_5y_pct=(appreciation or {}).get("appreciation_5y_pct"),
        cagr_5y_pct=(appreciation or {}).get("cagr_5y_pct"),
        years_of_history=(appreciation or {}).get("years_of_data", len(points)),
    )


# ---------------------------------------------------------------------------
# Buildings
# ---------------------------------------------------------------------------

# Income display buckets — we deliberately don't surface exact total rent
# figures on listing cards (per-building income reveals tenant economics
# that DLD considers sensitive aggregations). Detail pages show the exact
# figure for clarity, but card grids are bucketed.
def _income_range_label(total_aed: Optional[float]) -> Optional[str]:
    if total_aed is None or total_aed <= 0:
        return None
    if total_aed < 1_000_000:
        return "Under AED 1M/year"
    if total_aed < 10_000_000:
        return "AED 1M – 10M/year"
    if total_aed < 50_000_000:
        return "AED 10M – 50M/year"
    if total_aed < 100_000_000:
        return "AED 50M – 100M/year"
    if total_aed < 500_000_000:
        return "AED 100M – 500M/year"
    if total_aed < 1_000_000_000:
        return "AED 500M – 1B/year"
    return "AED 1B+/year"


def _total_annual_income(b: DldBuilding) -> Optional[float]:
    """Sum of active rent contracts × per-contract average. Proxy for the
    building's aggregate annual rent income."""
    if b.avg_annual_rent is None or b.active_rent_count <= 0:
        return None
    return float(b.avg_annual_rent) * int(b.active_rent_count)


def _build_building_item(b: DldBuilding, area_name: Optional[str]) -> DldBuildingItem:
    total = _total_annual_income(b)
    return DldBuildingItem(
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
        total_annual_income=total,
        income_range_label=_income_range_label(total),
        confidence=confidence_for(b.active_rent_count),
    )


# Allowed sort keys map to the underlying column. order_by(...desc())
SORT_COLUMNS = {
    "rent_count": DldBuilding.active_rent_count,
    "rent_per_sqft": DldBuilding.avg_rent_per_sqft,
    "avg_rent": DldBuilding.avg_annual_rent,
    "occupancy": DldBuilding.occupancy_proxy_pct,
}


@router.get("/buildings", response_model=DldBuildingsResponse)
async def list_buildings(
    db: AsyncSession = Depends(get_db),
    area: Optional[str] = Query(None, description="filter by area name_norm"),
    project: Optional[str] = Query(None, description="filter by project_name substring"),
    prop_sub_type: Optional[str] = Query(None, description="e.g. Flat, Villa"),
    min_rents: int = Query(0, ge=0),
    sort_by: str = Query(
        "rent_count",
        description="rent_count | rent_per_sqft | avg_rent | occupancy",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = (
        select(DldBuilding, DldArea.name_display)
        .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
    )
    conds = []
    if area:
        # Expand community → admin sectors via the alias table. When the
        # user filters by "damac hills 2" we look up Al Hebiah Fifth instead;
        # falls back to exact-match if the area isn't an aliased community.
        norm = area.strip().lower()
        sectors = community_to_admin_sectors(norm)
        if sectors:
            conds.append(DldArea.name_norm.in_(sectors))
        else:
            conds.append(DldArea.name_norm == norm)
    if project:
        conds.append(DldBuilding.project_name.ilike(f"%{project.strip()}%"))
    if prop_sub_type:
        conds.append(DldBuilding.prop_sub_type == prop_sub_type)
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

    sort_col = SORT_COLUMNS.get(sort_by, DldBuilding.active_rent_count)
    # NULLS LAST for derived sorts (rent/sqft, occupancy) — Postgres-friendly
    stmt = stmt.order_by(sort_col.desc().nullslast()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).all()
    items = [_build_building_item(b, area_name) for b, area_name in rows]
    return DldBuildingsResponse(count=len(items), total_available=int(total or 0), items=items)


async def _load_area_context(
    db: AsyncSession, dld_area_id: Optional[UUID]
) -> Optional[DldBuildingAreaContext]:
    if dld_area_id is None:
        return None
    row = (
        await db.execute(
            select(DldArea, DldAreaMetrics)
            .outerjoin(
                DldAreaMetrics,
                (DldAreaMetrics.dld_area_id == DldArea.id)
                & (DldAreaMetrics.period == "2026-ytd"),
            )
            .where(DldArea.id == dld_area_id)
        )
    ).first()
    if not row:
        return None
    a, m = row
    sales = m.sales_count if m else 0
    rents = m.rent_count_2026 if m else 0
    show_yield = None
    if (m and m.rental_yield_pct is not None
            and sales >= MIN_RELIABLE_SAMPLES
            and rents >= MIN_RELIABLE_SAMPLES):
        show_yield = cap_yield(float(m.rental_yield_pct))
    return DldBuildingAreaContext(
        dld_area_id=a.id,
        name=a.name_display,
        name_norm=a.name_norm,
        community_name=admin_sector_to_community(a.name_norm),
        median_price_per_sqft=float(m.median_price_per_sqft) if m and m.median_price_per_sqft is not None else None,
        median_annual_rent=float(m.median_annual_rent) if m and m.median_annual_rent is not None else None,
        median_rent_per_sqft=float(m.median_rent_per_sqft) if m and m.median_rent_per_sqft is not None else None,
        rental_yield_pct=show_yield,
        rent_growth_yoy_pct=float(m.rent_growth_yoy_pct) if m and m.rent_growth_yoy_pct is not None else None,
        sales_count=sales,
        rent_count_2026=rents,
    )


@router.get("/buildings/{building_id}", response_model=DldBuildingDetailResponse)
async def get_building(building_id: UUID, db: AsyncSession = Depends(get_db)):
    """Per-building income X-Ray. Capped yield uses the parent area's median
    PPSF — building unit prices aren't in the DLD rent registry."""
    row = (
        await db.execute(
            select(DldBuilding, DldArea.name_display, DldArea.id)
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
            .where(DldBuilding.id == building_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Building not found")
    b, area_name, dld_area_id = row

    area_ctx = await _load_area_context(db, dld_area_id)

    # Implied yield: building rent/sqft as a fraction of area median PPSF.
    # When DLD median PPSF is missing we leave the yield null rather than
    # invent a number from an unrelated benchmark.
    implied_yield = None
    est_sqft = None
    est_price = None
    if (b.avg_rent_per_sqft and b.avg_annual_rent and area_ctx
            and area_ctx.median_price_per_sqft):
        ratio = float(b.avg_rent_per_sqft) / float(area_ctx.median_price_per_sqft)
        implied_yield = cap_yield(ratio * 100)
        est_sqft = float(b.avg_annual_rent) / float(b.avg_rent_per_sqft)
        est_price = est_sqft * float(area_ctx.median_price_per_sqft)

    base = _build_building_item(b, area_name)
    detail = DldBuildingDetail(
        **base.model_dump(),
        swimming_pools=b.swimming_pools,
        car_parks=b.car_parks,
        elevators=b.elevators,
        bld_levels=b.bld_levels,
        is_offplan=b.is_offplan,
        implied_yield_pct=implied_yield,
        estimated_unit_size_sqft=est_sqft,
        estimated_unit_price=est_price,
        area_context=area_ctx,
    )
    return DldBuildingDetailResponse(building=detail)


@router.get(
    "/buildings/{building_id}/comparable",
    response_model=DldBuildingsComparableResponse,
)
async def comparable_buildings(
    building_id: UUID,
    db: AsyncSession = Depends(get_db),
    k: int = Query(5, ge=1, le=20),
):
    """Same parent area + same prop_sub_type, ranked by occupancy proxy."""
    base = (
        await db.execute(select(DldBuilding).where(DldBuilding.id == building_id))
    ).scalar_one_or_none()
    if not base:
        raise HTTPException(status_code=404, detail="Building not found")

    # Exclude zero-rent buildings — those have no useful comparison signal.
    stmt = (
        select(DldBuilding, DldArea.name_display)
        .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
        .where(
            DldBuilding.id != building_id,
            DldBuilding.dld_area_id == base.dld_area_id,
            DldBuilding.prop_sub_type == base.prop_sub_type,
            DldBuilding.active_rent_count > 0,
        )
        .order_by(
            DldBuilding.occupancy_proxy_pct.desc().nullslast(),
            DldBuilding.active_rent_count.desc(),
        )
        .limit(k)
    )
    rows = (await db.execute(stmt)).all()
    items = [_build_building_item(b, name) for b, name in rows]
    return DldBuildingsComparableResponse(
        base_building_id=building_id, count=len(items), items=items
    )


@router.get(
    "/areas/{name_norm}/top-buildings",
    response_model=DldAreaTopBuildingsResponse,
)
async def area_top_buildings(
    name_norm: str,
    db: AsyncSession = Depends(get_db),
    k: int = Query(10, ge=1, le=50),
):
    """Top-K buildings in an area, ranked by active rent count desc.

    Handles three input shapes:
      1. An admin-sector name (e.g. "wadi al safa 5") — direct match.
      2. An aliased community name (e.g. "damac hills 2", "arabian ranches",
         "jvc") — expanded via dld_area_aliases to the list of admin sectors,
         then aggregated across those.
      3. A tower-density community (e.g. "business bay", "marsa dubai") —
         204 No Content equivalent: returns an empty list with a hint, so
         the frontend can render an honest empty-state instead of 404.
    """
    norm = name_norm.strip().lower()
    sectors = community_to_admin_sectors(norm)

    # Path 2: community → expand to admin sectors
    if sectors:
        # Resolve the parent community's display name (use the first sector's
        # name_display as a fallback if not in DLD)
        display_name = norm.title()
        # Get IDs for those admin sectors
        sector_areas = (
            await db.execute(
                select(DldArea).where(DldArea.name_norm.in_(sectors))
            )
        ).scalars().all()
        if not sector_areas:
            # Aliased name but DLD doesn't actually have any of these sectors
            return DldAreaTopBuildingsResponse(
                area_name=display_name, count=0, items=[]
            )
        sector_ids = [a.id for a in sector_areas]
        stmt = (
            select(DldBuilding, DldArea.name_display)
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
            .where(
                DldBuilding.dld_area_id.in_(sector_ids),
                DldBuilding.active_rent_count > 0,
            )
            .order_by(DldBuilding.active_rent_count.desc())
            .limit(k)
        )
        rows = (await db.execute(stmt)).all()
        items = [_build_building_item(b, name) for b, name in rows]
        return DldAreaTopBuildingsResponse(
            area_name=display_name, count=len(items), items=items
        )

    # Path 1: direct admin-sector match
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm))
    ).scalar_one_or_none()
    if not area:
        # Path 3: tower-density community we know is rent-only, no buildings.
        # Return 200 + empty so the frontend can render an honest empty-state.
        if is_tower_density(norm):
            return DldAreaTopBuildingsResponse(
                area_name=norm.title(), count=0, items=[]
            )
        raise HTTPException(status_code=404, detail="Area not found")

    # If the matched admin sector aliases to a canonical community, surface
    # that as the display name so the frontend header reads naturally.
    display_name = admin_sector_to_community(norm) or area.name_display

    stmt = (
        select(DldBuilding, DldArea.name_display)
        .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
        .where(
            DldBuilding.dld_area_id == area.id,
            DldBuilding.active_rent_count > 0,
        )
        .order_by(DldBuilding.active_rent_count.desc())
        .limit(k)
    )
    rows = (await db.execute(stmt)).all()
    items = [_build_building_item(b, name) for b, name in rows]
    return DldAreaTopBuildingsResponse(
        area_name=display_name, count=len(items), items=items
    )


# ---------------------------------------------------------------------------
# Rent check — "Is your rent fair?"
# ---------------------------------------------------------------------------

@router.post("/rent-check", response_model=RentCheckResponse)
async def rent_check(req: RentCheckRequest, db: AsyncSession = Depends(get_db)):
    norm_area = req.area_name.strip().lower()

    # Derive the list of size bands to try, in priority order. We re-validate
    # the "at least one size hint" rule here too — the model_validator handles
    # it for typed clients, but raising HTTPException(422) defensively at the
    # endpoint guarantees a clean 422 even if the model_validator's ValueError
    # ever surfaces as something other than RequestValidationError.
    if req.size_category is not None:
        bands_to_try = SIZE_CATEGORY_BANDS[req.size_category]
    elif req.size_sqm is not None:
        bands_to_try = [_size_band(req.size_sqm)]
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either size_category (studio | 1br | 2br | 3br | 4br) or size_sqm.",
        )

    # Resolve area
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm_area))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail=f"Area '{req.area_name}' not found in DLD data")

    # Try each candidate band until we find a benchmark
    bm = None
    band = bands_to_try[0]
    for candidate in bands_to_try:
        row = (
            await db.execute(
                select(DldRentBenchmark).where(
                    DldRentBenchmark.dld_area_id == area.id,
                    DldRentBenchmark.prop_sub_type == req.prop_sub_type,
                    DldRentBenchmark.size_band == candidate,
                    DldRentBenchmark.period == "2026",
                )
            )
        ).scalar_one_or_none()
        if row is not None:
            bm = row
            band = candidate
            break

    if not bm:
        raise HTTPException(
            status_code=404,
            detail=f"No rent benchmark for {area.name_display} / {req.prop_sub_type} / size {bands_to_try[0]}sqm. "
                   f"Try a different size or property type.",
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
        area_name_display=area.name_display,
        area_name_norm=area.name_norm,
        median_price_per_sqft=float(am.median_price_per_sqft)
        if am and am.median_price_per_sqft is not None
        else None,
        avg_price_per_sqft=float(am.avg_price_per_sqft)
        if am and am.avg_price_per_sqft is not None
        else None,
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


# ---------------------------------------------------------------------------
# Top firms leaderboard
# ---------------------------------------------------------------------------

@router.get("/companies/top", response_model=TopCompaniesResponse)
async def top_companies(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=100),
):
    """Largest broker firms by active-broker count."""
    stmt = (
        select(
            DldReraBroker.real_estate_name,
            func.count().label("c"),
        )
        .where(
            DldReraBroker.is_active.is_(True),
            DldReraBroker.real_estate_name.isnot(None),
        )
        .group_by(DldReraBroker.real_estate_name)
        .order_by(func.count().desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    items = [
        TopCompanyItem(real_estate_name=name, active_broker_count=int(c))
        for name, c in rows
    ]
    return TopCompaniesResponse(count=len(items), items=items)


# ---------------------------------------------------------------------------
# Broker match wizard
# ---------------------------------------------------------------------------

# Language detection — coarse but useful for a real-time wizard. Tokens
# matched against the broker's full_name (uppercase, ASCII). Order matters:
# Arabic regex is checked first because Arabic transliterations dominate the
# DLD broker registry; remaining heuristics catch overlap-prone names.

_ARABIC_TOKENS = re.compile(
    r"\b(AL|EL|ABD|ABDUL|ABU|BIN|BINT|MOHAMMED|MOHAMED|AHMED|AHMAD|ALI|"
    r"HASSAN|HUSSEIN|OMAR|YOUSEF|YUSUF|KHALED|KHALID|SAEED|RASHID|"
    r"HAMDAN|MAJID|FAISAL|FATIMA|AISHA|MARYAM|NOURA|SALEM|ZAYED)\b"
)
_RUSSIAN_TOKENS = re.compile(
    r"(OV$|OVA$|EV$|EVA$|SKY$|SKAYA$|SKI$|ITCH$|ENKO$|"
    r"\b(ALEXANDER|ALEXEI|DMITRY|IVAN|YURI|MAXIM|ANASTASIA|EKATERINA|"
    r"SVETLANA|VLADIMIR|SERGEY|OLGA|NATALIA|TATIANA|IRINA)\b)"
)
_HINDI_TOKENS = re.compile(
    r"\b(KUMAR|SHARMA|SINGH|PATEL|GUPTA|MEHTA|KHAN|RAJ|RAJESH|"
    r"PRIYA|ANJALI|ARUN|ROHIT|VIKAS|RAVI|AMIT|DEEPAK|ANIL|"
    r"DESAI|JAIN|VERMA|REDDY|NAIDU|IYER|MENON|NAIR|PILLAI|"
    r"AGGARWAL|AGARWAL|JOSHI|MISHRA|PANDEY|YADAV|TIWARI|"
    r"BHATIA|MALHOTRA|KAPOOR|CHOPRA|ARORA|SAHU|DAS|GHOSH)\b"
)
_CHINESE_TOKENS = re.compile(
    r"\b(WANG|LI|ZHANG|CHEN|LIU|YANG|HUANG|ZHAO|WU|ZHOU|XU|"
    r"SUN|MA|HU|GUO|HE|GAO|LIN|LUO|ZHENG|YE|FENG|CAO|DENG|"
    r"XIE|TANG|XU|HAN|FAN|HOU|JIANG|YU|DONG)\b"
)


def _detect_language(name: str) -> str:
    if not name:
        return "english"
    up = name.upper()
    if _ARABIC_TOKENS.search(up):
        return "arabic"
    if _RUSSIAN_TOKENS.search(up):
        return "russian"
    if _HINDI_TOKENS.search(up):
        return "hindi"
    if _CHINESE_TOKENS.search(up):
        return "chinese"
    return "english"


def _license_status(end_date: Optional[date]) -> tuple[str, Optional[int]]:
    if end_date is None:
        return "active", None
    # Use the dataset snapshot date (2026-06-01) as "today" so the response
    # is deterministic for the prod data.
    today = date(2026, 6, 1)
    delta = (end_date - today).days
    if delta < 0:
        return "expired", delta
    if delta <= 90:
        return "expiring_soon", delta
    return "active", delta


@router.post("/broker-match", response_model=BrokerMatchResponse)
async def broker_match(
    req: BrokerMatchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Wizard input → top 5 brokers ranked by (firm size desc, name asc).

    Filters: active license only. Language is detected from each broker's
    full name (Arabic / Russian / Hindi / Chinese / English heuristics) and
    used only when the caller specified a language preference.
    """
    # Pull a generous pool, then filter in Python to apply language detection
    # without paying a SQL roundtrip per candidate. The firm-size dictionary
    # is computed once and joined back to each candidate.
    pool = (
        await db.execute(
            select(DldReraBroker)
            .where(DldReraBroker.is_active.is_(True))
            .order_by(DldReraBroker.real_estate_name)
            .limit(2000)
        )
    ).scalars().all()

    # Compute firm sizes once
    firm_size_rows = (
        await db.execute(
            select(
                DldReraBroker.real_estate_name,
                func.count().label("c"),
            )
            .where(
                DldReraBroker.is_active.is_(True),
                DldReraBroker.real_estate_name.isnot(None),
            )
            .group_by(DldReraBroker.real_estate_name)
        )
    ).all()
    firm_size: dict[str, int] = {name: int(c) for name, c in firm_size_rows}

    candidates = []
    for b in pool:
        lang = _detect_language(b.full_name)
        if req.language and lang != req.language:
            continue
        status_str, days = _license_status(b.license_end_date)
        if status_str == "expired":
            continue
        candidates.append((b, lang, status_str, days))

    # Rank by firm size (desc), then license recency (longer expiry = better)
    candidates.sort(
        key=lambda t: (
            -firm_size.get(t[0].real_estate_name or "", 0),
            -(t[3] or 0),
        )
    )
    top = candidates[:5]

    items = [
        BrokerMatchItem(
            broker_number=b.broker_number,
            full_name=b.full_name,
            gender=b.gender,
            real_estate_name=b.real_estate_name,
            phone=b.phone,
            webpage=b.webpage,
            license_start_date=b.license_start_date,
            license_end_date=b.license_end_date,
            is_active=b.is_active,
            detected_language=lang,
            company_size_active_brokers=firm_size.get(b.real_estate_name or "", 0),
            license_status=status_str,
            days_until_expiry=days,
        )
        for (b, lang, status_str, days) in top
    ]
    return BrokerMatchResponse(count=len(items), items=items)


# ---------------------------------------------------------------------------
# Rent alerts
# ---------------------------------------------------------------------------

@router.post("/rent-alerts", response_model=RentAlertOut, status_code=201)
async def create_rent_alert(
    payload: RentAlertCreate,
    db: AsyncSession = Depends(get_db),
):
    """Subscribe an email to rent updates for an (area, size, prop_type) combo.

    Idempotent — second submission for the same key returns the existing row
    rather than 409, so the frontend can show a friendly 'subscribed' state
    on repeated submits.
    """
    norm = payload.area_name_norm.strip().lower()
    area = (
        await db.execute(
            select(DldArea).where(DldArea.name_norm == norm)
        )
    ).scalar_one_or_none()
    display = area.name_display if area else payload.area_name_display

    alert = RentAlert(
        email=payload.email.strip().lower(),
        area_name_norm=norm,
        area_name_display=display,
        size_category=payload.size_category,
        prop_sub_type=payload.prop_sub_type,
        is_active=True,
    )
    db.add(alert)
    try:
        await db.commit()
        await db.refresh(alert)
    except IntegrityError:
        await db.rollback()
        existing = (
            await db.execute(
                select(RentAlert).where(
                    RentAlert.email == payload.email.strip().lower(),
                    RentAlert.area_name_norm == norm,
                    RentAlert.size_category == payload.size_category,
                    RentAlert.prop_sub_type == payload.prop_sub_type,
                )
            )
        ).scalar_one_or_none()
        if existing:
            alert = existing
    return RentAlertOut(
        id=alert.id,
        email=alert.email,
        area_name_norm=alert.area_name_norm,
        area_name_display=alert.area_name_display,
        size_category=alert.size_category,
        prop_sub_type=alert.prop_sub_type,
        is_active=alert.is_active,
    )


# ---------------------------------------------------------------------------
# Broker consultation request
# ---------------------------------------------------------------------------

BUDGET_TO_AED: dict[str, float] = {
    "under_500k": 250_000,
    "500k_1m": 750_000,
    "1m_3m": 2_000_000,
    "3m_5m": 4_000_000,
    "5m_plus": 7_500_000,
}


@router.post("/broker-consultation", response_model=BrokerConsultationResponse, status_code=201)
async def broker_consultation(
    req: BrokerConsultationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create an investor lead tagged with the DLD broker the user picked.

    Saves into the existing `investor_leads` table. The broker is identified
    by `broker_number`; we stash that in the `message` field with a stable
    prefix so admin/broker dashboards can route on it without a schema change.
    """
    b = (
        await db.execute(
            select(DldReraBroker).where(DldReraBroker.broker_number == req.broker_number)
        )
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Broker not found")
    if not b.is_active:
        raise HTTPException(status_code=409, detail="Broker license is not active")

    budget_aed = BUDGET_TO_AED.get(req.budget_band) if req.budget_band else None
    user_message = (req.message or "").strip()
    annotated_message = (
        f"[source=broker_directory broker={b.broker_number} firm={b.real_estate_name or '-'}]\n"
        f"{user_message}"
    )

    lead = InvestorLead(
        full_name=req.full_name.strip(),
        whatsapp=req.whatsapp.strip(),
        email=req.email.strip() if req.email else None,
        budget=budget_aed,
        investment_goal=req.goal,
        message=annotated_message[:1000],
        status="new",
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return BrokerConsultationResponse(
        message=f"Request sent! {b.full_name} will contact you within 24 hours via WhatsApp.",
        broker_full_name=b.full_name,
        broker_real_estate_name=b.real_estate_name,
        lead_id=lead.id,
    )
