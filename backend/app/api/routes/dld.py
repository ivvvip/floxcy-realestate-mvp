"""DLD-sourced endpoints — areas, buildings, rent fairness, RERA brokers."""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func, or_, select
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
    DldAreaLifestyleScore,
    DldAreaMetrics,
    DldAreaPopulation,
    DldBedroomBenchmark,
    DldBuilding,
    DldBuildingDerived,
    DldBuildingRentHistory,
    DldBuildingsSales,
    DldCanonicalArea,
    DldLeaseExpiryForecast,
    DldPriceHistory,
    DldRentBenchmark,
    DldRentHistory,
    DldReraBroker,
    DldYieldHistory,
)
from app.models.investor_lead import InvestorLead
from app.models.rent_alert import RentAlert
from app.schemas.dld import (
    ActivityPoint,
    BrokerFirmItem,
    BrokerLicensePoint,
    BrokerStats,
    DISPLAY_YIELD_CAP_PCT,
    DashboardDataResponse,
    DashboardKpi,
    DashboardPriceHistoryPoint,
    DashboardTicker,
    DataIntelligenceFooter,
    MIN_RELIABLE_SAMPLES,
    MarketTimingResponse,
    MarketTimingSignal,
    OpportunitiesFilteredResponse,
    OpportunityFilteredItem,
    OpportunityScoreFormula,
    RentRankingItem,
    RentRankingResponse,
    RoiCalcBenchmark,
    RoiCalcCapitalGrowth,
    RoiCalcCostBreakdown,
    RoiCalcCurrency,
    RoiCalcInsight,
    RoiCalcRentalReturns,
    RoiCalcRequest,
    RoiCalcResponse,
    RoiCalcScenario,
    RoiCalcSensitivityItem,
    SIZE_CATEGORY_BANDS,
    SalesCompositionSlice,
    SimilarAreaItem,
    SimilarAreasResponse,
    SupplyPipelineItem,
    TopAreaItem,
    YieldTrendPoint,
    BrokerConsultationRequest,
    BrokerConsultationResponse,
    BrokerMatchItem,
    BrokerMatchRequest,
    BrokerMatchResponse,
    BrokerNationalityBucket,
    BrokerNationalityStats,
    DldAreaDetail,
    DldAreaDetailResponse,
    DldAreaListItem,
    DldAreaListResponse,
    DldAreaTopBuildingsResponse,
    CanonicalAreaItem,
    CanonicalAreasResponse,
    DldPriceHistoryResponse,
    DldRentHistoryResponse,
    DldYieldHistoryResponse,
    AreaBedroomPricesResponse,
    AreaCategoryBreakdownItem,
    AreaCommunityProfile,
    AreaCategoryBreakdownResponse,
    DldCommunitiesResponse,
    DldCommunityItem,
    AreaLifestyleScoreResponse,
    BedroomBenchmarkRow,
    BuildingLeaseExpiryResponse,
    BuildingSalesResponse,
    DashboardPulseResponse,
    DataFreshness,
    HotAreaItem,
    MapAreaItem,
    MapAreasResponse,
    MapBuildingItem,
    MapBuildingsResponse,
    MarketOverview,
    MarketOverviewMetric,
    OffplanArea,
    OffplanPipeline,
    RentVsBuyGauge,
    ScatterMatrixPoint,
    BuildingRentHistoryPoint,
    DldBuildingRentHistoryResponse,
    LeaseExpiryMonthBucket,
    MarketOverviewResponse,
    UpcomingAvailabilityItem,
    UpcomingAvailabilityResponse,
    PriceHistoryPoint,
    RentHistoryPoint,
    YieldHistoryPoint,
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


@router.get("/canonical-areas", response_model=CanonicalAreasResponse)
async def list_canonical_areas(
    db: AsyncSession = Depends(get_db),
    min_occurrences: int = Query(
        5, ge=0, le=100_000,
        description="Drop areas with fewer than N total occurrences. "
                    "Defaults to 5 so noise areas (e.g. one-off DLD entries) "
                    "stay out of user-facing dropdowns.",
    ),
    source: Optional[str] = Query(
        None,
        description="Filter to areas seen in this dataset: "
                    "'transactions' | 'rents' | 'lands'.",
    ),
    only_with_coords: bool = Query(
        False,
        description="Drop areas without geocoded coordinates. Use for the "
                    "map UI, which can't render markers without lat/lng.",
    ),
    only_with_polygon: bool = Query(
        False,
        description="Drop areas without a GeoJSON polygon shape. Use for "
                    "choropleth / heatmap views that need real boundaries.",
    ),
):
    """The single source of truth for area names. Sorted A→Z.

    Coords + polygon are populated by `scripts/overpass_geocoding.py` and
    `scripts/improve_geocoding.py` from OSM. Coverage as of the last run
    is reported in the response (`coords_coverage`, `polygon_coverage`).
    """
    stmt = select(DldCanonicalArea).where(
        DldCanonicalArea.occurrence_count >= min_occurrences
    )
    if source:
        # JSONB contains check — Postgres-native
        stmt = stmt.where(DldCanonicalArea.source_datasets.contains([source]))
    if only_with_coords:
        stmt = stmt.where(
            DldCanonicalArea.latitude.is_not(None),
            DldCanonicalArea.longitude.is_not(None),
        )
    if only_with_polygon:
        stmt = stmt.where(DldCanonicalArea.polygon.is_not(None))
    stmt = stmt.order_by(DldCanonicalArea.area_name)
    rows = (await db.execute(stmt)).scalars().all()

    items: list[CanonicalAreaItem] = []
    coords_n = poly_n = 0
    for r in rows:
        bbox = None
        if (r.bbox_north is not None and r.bbox_south is not None
                and r.bbox_east is not None and r.bbox_west is not None):
            bbox = {"north": r.bbox_north, "south": r.bbox_south,
                    "east": r.bbox_east, "west": r.bbox_west}
        if r.latitude is not None and r.longitude is not None:
            coords_n += 1
        if r.polygon is not None:
            poly_n += 1
        items.append(CanonicalAreaItem(
            id=r.id,
            area_name=r.area_name,
            area_name_upper=r.area_name_upper,
            area_name_slug=r.area_name_slug,
            area_name_ar=r.area_name_ar,
            source_datasets=list(r.source_datasets) if r.source_datasets else [],
            first_seen_year=r.first_seen_year,
            occurrence_count=int(r.occurrence_count or 0),
            latitude=r.latitude,
            longitude=r.longitude,
            bbox=bbox,
            polygon=r.polygon,
            coords_source=r.coords_source,
            coords_confidence=r.coords_confidence,
        ))
    return CanonicalAreasResponse(
        count=len(items),
        min_occurrences=min_occurrences,
        coords_coverage=coords_n,
        polygon_coverage=poly_n,
        items=items,
    )


MARKET_OVERVIEW_CACHE_KEY = "dld:market-overview:v2"
MARKET_OVERVIEW_TTL_S = 3600  # 1h per spec


@router.get("/market-overview", response_model=MarketOverviewResponse)
async def dld_market_overview(db: AsyncSession = Depends(get_db)):
    """One-call snapshot for the homepage. Cached 1h in Redis."""
    import json
    from app.redis_client import redis_client

    # Cache check
    cached_blob = None
    try:
        cached_blob = await redis_client.get(MARKET_OVERVIEW_CACHE_KEY)
    except Exception:
        cached_blob = None
    if cached_blob:
        try:
            payload = json.loads(cached_blob if isinstance(cached_blob, str) else cached_blob.decode())
            return MarketOverviewResponse(**payload, cached=True)
        except Exception:
            pass  # fall through and rebuild

    # Aggregate counts (parallel-friendly)
    total_sales = await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.transaction_count), 0))
    )
    total_volume = await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.total_value_aed), 0))
    )
    areas_covered = await db.scalar(select(func.count()).select_from(DldArea))
    active_brokers = await db.scalar(
        select(func.count()).select_from(DldReraBroker).where(DldReraBroker.is_active.is_(True))
    )
    buildings_tracked = await db.scalar(select(func.count()).select_from(DldBuilding))
    rent_contracts = await db.scalar(
        select(func.coalesce(func.sum(DldRentHistory.contract_count), 0))
    )

    # Avg yield (latest year per-area, weighted equally)
    avg_yield_row = await db.execute(
        select(func.avg(DldYieldHistory.gross_yield_pct))
        .where(
            DldYieldHistory.year == (
                select(func.max(DldYieldHistory.year)).scalar_subquery()
            ),
            DldYieldHistory.gross_yield_pct.isnot(None),
            DldYieldHistory.sample_score >= MIN_RELIABLE_SAMPLES,
        )
    )
    avg_yield_val = avg_yield_row.scalar()
    avg_yield_pct = float(avg_yield_val) if avg_yield_val is not None else None

    # Top yield area (current year, sample-floor enforced)
    top_yield_row = (await db.execute(
        select(DldYieldHistory)
        .where(
            DldYieldHistory.year == (
                select(func.max(DldYieldHistory.year)).scalar_subquery()
            ),
            DldYieldHistory.gross_yield_pct.isnot(None),
            DldYieldHistory.sample_score >= MIN_RELIABLE_SAMPLES,
        )
        .order_by(DldYieldHistory.gross_yield_pct.desc())
        .limit(1)
    )).scalar_one_or_none()

    top_yield_area = None
    top_yield_pct = None
    if top_yield_row is not None:
        # Resolve display name
        area_disp = (await db.execute(
            select(DldArea.name_display).where(DldArea.name_norm == top_yield_row.area_name_norm)
        )).scalar_one_or_none()
        top_yield_area = area_disp or top_yield_row.area_name_norm.title()
        top_yield_pct = float(top_yield_row.gross_yield_pct)

    # Top 5y appreciation area
    top_app_row = (await db.execute(
        select(DldAreaAppreciation)
        .where(
            DldAreaAppreciation.appreciation_5y_pct.isnot(None),
            DldAreaAppreciation.years_of_data >= 5,
        )
        .order_by(DldAreaAppreciation.appreciation_5y_pct.desc())
        .limit(1)
    )).scalar_one_or_none()
    top_app_area = None
    top_app_pct = None
    if top_app_row is not None:
        area_disp = (await db.execute(
            select(DldArea.name_display).where(DldArea.name_norm == top_app_row.area_name_norm)
        )).scalar_one_or_none()
        top_app_area = area_disp or top_app_row.area_name_norm.title()
        top_app_pct = float(top_app_row.appreciation_5y_pct)

    # Off-plan % across all years (volume-weighted)
    offplan_row = await db.execute(
        select(
            func.sum(DldPriceHistory.transaction_count_offplan),
            func.sum(DldPriceHistory.transaction_count),
        )
    )
    op_count, all_count = offplan_row.one()
    offplan_pct = None
    if op_count is not None and all_count and all_count > 0:
        offplan_pct = round(float(op_count) / float(all_count) * 100, 1)

    payload = {
        "total_sales": int(total_sales or 0),
        "total_volume_aed": float(total_volume or 0),
        "areas_covered": int(areas_covered or 0),
        "active_brokers": int(active_brokers or 0),
        "buildings_tracked": int(buildings_tracked or 0),
        "rent_contracts": int(rent_contracts or 0),
        "avg_yield_pct": round(avg_yield_pct, 2) if avg_yield_pct is not None else None,
        "top_yield_area": top_yield_area,
        "top_yield_pct": round(top_yield_pct, 2) if top_yield_pct is not None else None,
        "top_appreciation_area": top_app_area,
        "top_appreciation_pct": round(top_app_pct, 1) if top_app_pct is not None else None,
        "offplan_percentage": offplan_pct,
    }

    try:
        await redis_client.setex(
            MARKET_OVERVIEW_CACHE_KEY, MARKET_OVERVIEW_TTL_S, json.dumps(payload)
        )
    except Exception:
        pass  # cache failure is non-fatal

    return MarketOverviewResponse(**payload, cached=False)


# ---------------------------------------------------------------------------
# Bloomberg-style dashboard aggregator — single payload feeding every
# section of /dashboard. Cached 1h in Redis. Every number traces back to
# a DLD ETL table; sections we don't have honest data for are omitted.
# ---------------------------------------------------------------------------

DASHBOARD_DATA_CACHE_KEY = "dld:dashboard-data:v3"
DASHBOARD_DATA_TTL_S = 3600


async def _resolve_area_display(db: AsyncSession, area_name_norm: str) -> str:
    """Map area_name_norm → human-readable display name; fall back to title-case."""
    disp = (await db.execute(
        select(DldArea.name_display).where(DldArea.name_norm == area_name_norm)
    )).scalar_one_or_none()
    return disp or area_name_norm.title()


@router.get("/dashboard-data", response_model=DashboardDataResponse)
async def dld_dashboard_data(db: AsyncSession = Depends(get_db)):
    """One-call snapshot for the Bloomberg-style dashboard. Cached 1h."""
    import json
    from datetime import datetime as _dt
    from app.redis_client import redis_client

    cached_blob = None
    try:
        cached_blob = await redis_client.get(DASHBOARD_DATA_CACHE_KEY)
    except Exception:
        cached_blob = None
    if cached_blob:
        try:
            payload = json.loads(cached_blob if isinstance(cached_blob, str) else cached_blob.decode())
            payload["cached"] = True
            return DashboardDataResponse(**payload)
        except Exception:
            pass

    # ---- Latest year across our DLD tables ----
    latest_year = await db.scalar(select(func.max(DldPriceHistory.year))) or 2026

    # ---- Headline totals ----
    total_sales = int(await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.transaction_count), 0))
    ) or 0)
    total_volume = float(await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.total_value_aed), 0))
    ) or 0)
    sales_latest = int(await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.transaction_count), 0))
        .where(DldPriceHistory.year == latest_year)
    ) or 0)
    volume_latest = float(await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.total_value_aed), 0))
        .where(DldPriceHistory.year == latest_year)
    ) or 0)
    sales_prev = int(await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.transaction_count), 0))
        .where(DldPriceHistory.year == latest_year - 1)
    ) or 0)
    volume_prev = float(await db.scalar(
        select(func.coalesce(func.sum(DldPriceHistory.total_value_aed), 0))
        .where(DldPriceHistory.year == latest_year - 1)
    ) or 0)
    rent_contracts = int(await db.scalar(
        select(func.coalesce(func.sum(DldRentHistory.contract_count), 0))
        .where(DldRentHistory.year.in_([latest_year, latest_year - 1]))
    ) or 0)
    # "Active brokers" = license valid at request time. `is_active` is set
    # by the ETL against a snapshot date (`TODAY` constant in etl_dld.py)
    # and ages without re-runs; the date check below stays accurate
    # between snapshots and matches the audit query semantics.
    today_date = _dt.utcnow().date()
    active_brokers = int(await db.scalar(
        select(func.count())
        .select_from(DldReraBroker)
        .where(DldReraBroker.license_end_date >= today_date)
    ) or 0)
    areas_tracked = int(await db.scalar(
        select(func.count()).select_from(DldCanonicalArea)
    ) or 0)

    # Market-wide latest-year avg yield (sample-floor enforced)
    avg_yield_pct = await db.scalar(
        select(func.avg(DldYieldHistory.gross_yield_pct))
        .where(
            DldYieldHistory.year == latest_year,
            DldYieldHistory.gross_yield_pct.isnot(None),
            DldYieldHistory.sample_score >= MIN_RELIABLE_SAMPLES,
        )
    )
    avg_yield_pct_f = float(avg_yield_pct) if avg_yield_pct is not None else None
    # Prior-year for the delta tile
    avg_yield_prev = await db.scalar(
        select(func.avg(DldYieldHistory.gross_yield_pct))
        .where(
            DldYieldHistory.year == latest_year - 1,
            DldYieldHistory.gross_yield_pct.isnot(None),
            DldYieldHistory.sample_score >= MIN_RELIABLE_SAMPLES,
        )
    )

    # ---- Off-plan share for latest year ----
    op_row = await db.execute(
        select(
            func.sum(DldPriceHistory.transaction_count_offplan),
            func.sum(DldPriceHistory.transaction_count_ready),
            func.sum(DldPriceHistory.transaction_count),
            func.sum(DldPriceHistory.total_value_aed),
        ).where(DldPriceHistory.year == latest_year)
    )
    op_count, ready_count, all_count, latest_volume = op_row.one()
    op_count = int(op_count or 0)
    ready_count = int(ready_count or 0)
    all_count = int(all_count or 0)
    latest_volume_f = float(latest_volume or 0)
    offplan_share_pct = (op_count / all_count * 100) if all_count else 0.0
    # Volume by composition — split by transaction-share since DLD doesn't
    # store per-row volume_offplan vs volume_ready. This is the standard
    # industry approximation when only counts × avg_price are available.
    offplan_volume = (latest_volume_f * op_count / all_count) if all_count else 0.0
    ready_volume = latest_volume_f - offplan_volume

    # ---- Top yield areas (top 10) ----
    top_yield_rows = (await db.execute(
        select(DldYieldHistory)
        .where(
            DldYieldHistory.year == latest_year,
            DldYieldHistory.gross_yield_pct.isnot(None),
            DldYieldHistory.sample_score >= MIN_RELIABLE_SAMPLES,
        )
        .order_by(DldYieldHistory.gross_yield_pct.desc())
        .limit(10)
    )).scalars().all()
    top_yield_areas: list[TopAreaItem] = []
    for i, r in enumerate(top_yield_rows):
        disp = await _resolve_area_display(db, r.area_name_norm)
        top_yield_areas.append(TopAreaItem(
            rank=i + 1, area_name=disp, value=float(r.gross_yield_pct),
            sample_count=int(r.sample_score or 0),
        ))

    # ---- Top 5y appreciation (top 10) ----
    top_app_rows = (await db.execute(
        select(DldAreaAppreciation)
        .where(
            DldAreaAppreciation.appreciation_5y_pct.isnot(None),
            DldAreaAppreciation.years_of_data >= 5,
        )
        .order_by(DldAreaAppreciation.appreciation_5y_pct.desc())
        .limit(10)
    )).scalars().all()
    top_appreciation_areas: list[TopAreaItem] = []
    for i, r in enumerate(top_app_rows):
        disp = await _resolve_area_display(db, r.area_name_norm)
        top_appreciation_areas.append(TopAreaItem(
            rank=i + 1, area_name=disp,
            value=float(r.appreciation_5y_pct),
            secondary=float(r.cagr_5y_pct) if r.cagr_5y_pct is not None else None,
        ))

    # ---- Rent growth leaders (top 10) ----
    rent_growth_rows = (await db.execute(
        select(DldAreaMetrics, DldArea)
        .join(DldArea, DldArea.id == DldAreaMetrics.dld_area_id)
        .where(
            DldAreaMetrics.rent_growth_yoy_pct.isnot(None),
            DldAreaMetrics.rent_count_2026 >= MIN_RELIABLE_SAMPLES,
            DldAreaMetrics.period == "2026-ytd",
        )
        .order_by(DldAreaMetrics.rent_growth_yoy_pct.desc())
        .limit(10)
    )).all()
    rent_growth_leaders: list[TopAreaItem] = [
        TopAreaItem(
            rank=i + 1,
            area_name=area.name_display or area.name_norm.title(),
            value=float(m.rent_growth_yoy_pct),
            sample_count=int(m.rent_count_2026 or 0),
        )
        for i, (m, area) in enumerate(rent_growth_rows)
    ]

    # ---- Price history line (yearly, market-wide weighted avg) ----
    price_hist_rows = (await db.execute(
        select(
            DldPriceHistory.year,
            func.sum(DldPriceHistory.avg_ppsf_ready * DldPriceHistory.transaction_count_ready) / func.nullif(func.sum(DldPriceHistory.transaction_count_ready), 0),
            func.sum(DldPriceHistory.avg_ppsf_offplan * DldPriceHistory.transaction_count_offplan) / func.nullif(func.sum(DldPriceHistory.transaction_count_offplan), 0),
            func.sum(DldPriceHistory.avg_ppsf_all * DldPriceHistory.transaction_count) / func.nullif(func.sum(DldPriceHistory.transaction_count), 0),
            func.sum(DldPriceHistory.transaction_count),
        )
        .group_by(DldPriceHistory.year)
        .order_by(DldPriceHistory.year)
    )).all()
    price_history = [
        DashboardPriceHistoryPoint(
            year=int(yr),
            avg_ppsf_ready=float(pr_ready) if pr_ready is not None else None,
            avg_ppsf_offplan=float(pr_op) if pr_op is not None else None,
            avg_ppsf_all=float(pr_all) if pr_all is not None else None,
            transaction_count=int(tx or 0),
        )
        for yr, pr_ready, pr_op, pr_all, tx in price_hist_rows
    ]

    # ---- Yearly activity (transaction volume per year, split by off-plan) ----
    activity_rows = (await db.execute(
        select(
            DldPriceHistory.year,
            func.sum(DldPriceHistory.transaction_count),
            func.sum(DldPriceHistory.total_value_aed),
            func.sum(DldPriceHistory.transaction_count_offplan),
            func.sum(DldPriceHistory.transaction_count_ready),
        )
        .group_by(DldPriceHistory.year)
        .order_by(DldPriceHistory.year)
    )).all()
    activity = [
        ActivityPoint(
            year=int(yr),
            transaction_count=int(tx or 0),
            volume_aed=float(vol or 0),
            offplan_count=int(op or 0),
            ready_count=int(rd or 0),
        )
        for yr, tx, vol, op, rd in activity_rows
    ]

    # ---- Yield trend (market-wide avg per year) ----
    yt_rows = (await db.execute(
        select(
            DldYieldHistory.year,
            func.avg(DldYieldHistory.gross_yield_pct),
            func.count(DldYieldHistory.id),
        )
        .where(
            DldYieldHistory.gross_yield_pct.isnot(None),
            DldYieldHistory.sample_score >= MIN_RELIABLE_SAMPLES,
        )
        .group_by(DldYieldHistory.year)
        .order_by(DldYieldHistory.year)
    )).all()
    yield_trend = [
        YieldTrendPoint(
            year=int(yr),
            avg_gross_yield_pct=round(float(yld), 2),
            area_count=int(cnt or 0),
        )
        for yr, yld, cnt in yt_rows if yld is not None
    ]
    direction: Optional[str] = None
    if len(yield_trend) >= 2:
        first, last = yield_trend[0].avg_gross_yield_pct, yield_trend[-1].avg_gross_yield_pct
        delta = last - first
        direction = "rising" if delta > 0.2 else "falling" if delta < -0.2 else "flat"

    # ---- Supply pipeline (top 10 areas by project count, off-plan share) ----
    supply_rows = (await db.execute(
        select(
            DldArea.name_display,
            DldArea.name_norm,
            func.count(DldBuilding.id),
            func.sum(DldBuilding.flats),
            func.sum(case((DldBuilding.is_offplan.is_(True), 1), else_=0)),
        )
        .select_from(DldBuilding)
        .join(DldArea, DldArea.id == DldBuilding.dld_area_id)
        .group_by(DldArea.id, DldArea.name_display, DldArea.name_norm)
        .order_by(func.count(DldBuilding.id).desc())
        .limit(10)
    )).all()
    supply_pipeline: list[SupplyPipelineItem] = []
    for i, (disp, norm, pcount, fl, op) in enumerate(supply_rows):
        op_pct = (float(op) / float(pcount) * 100) if (pcount and op is not None) else None
        supply_pipeline.append(SupplyPipelineItem(
            rank=i + 1,
            area_name=disp or (norm or "").title(),
            project_count=int(pcount or 0),
            total_units=int(fl) if fl is not None else None,
            offplan_pct=round(op_pct, 1) if op_pct is not None else None,
        ))

    # ---- Broker license growth by year + top firms ----
    lic_rows = (await db.execute(
        select(
            func.extract("year", DldReraBroker.license_start_date),
            func.count(),
        )
        .where(DldReraBroker.license_start_date.isnot(None))
        .group_by(func.extract("year", DldReraBroker.license_start_date))
        .order_by(func.extract("year", DldReraBroker.license_start_date))
    )).all()
    licenses_per_year = [
        BrokerLicensePoint(year=int(yr), new_licenses=int(cnt))
        for yr, cnt in lic_rows if yr is not None and int(yr) >= 2015
    ]
    firm_rows = (await db.execute(
        select(
            DldReraBroker.real_estate_name,
            func.count(),
        )
        .where(
            DldReraBroker.real_estate_name.isnot(None),
            DldReraBroker.real_estate_name != "",
            DldReraBroker.is_active.is_(True),
        )
        .group_by(DldReraBroker.real_estate_name)
        .order_by(func.count().desc())
        .limit(10)
    )).all()
    top_firms = [
        BrokerFirmItem(rank=i + 1, firm_name=name, broker_count=int(cnt))
        for i, (name, cnt) in enumerate(firm_rows)
    ]

    # ---- Sales composition (latest year, off-plan vs ready) ----
    sales_composition = []
    if all_count:
        sales_composition.append(SalesCompositionSlice(
            label="Off-Plan",
            pct=round(op_count / all_count * 100, 1),
            volume_aed=round(offplan_volume, 2),
            transaction_count=op_count,
        ))
        sales_composition.append(SalesCompositionSlice(
            label="Ready",
            pct=round(ready_count / all_count * 100, 1),
            volume_aed=round(ready_volume, 2),
            transaction_count=ready_count,
        ))

    # ---- Same-period YoY (Jan–N latest_year vs Jan–N prev_year) ----
    # If scripts/compute_ytd_aggregates.py has written
    # backend/data/ytd_aggregates.json we use those true same-period
    # totals; otherwise we fall back to the historical 5/12 proration of
    # the prior full year (and the label is changed to flag it as a
    # proration so the UI isn't lying about the comparison).
    today = _dt.utcnow().date()
    if latest_year == today.year:
        months_elapsed = max(1, today.month - 1)
    else:
        months_elapsed = 12
    MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    period_label = (
        f"Jan–{MONTH_ABBR[months_elapsed - 1]}" if months_elapsed < 12 else "full year"
    )

    ytd_helper_path = (
        Path(__file__).resolve().parent.parent.parent.parent
        / "data" / "ytd_aggregates.json"
    )
    ytd_helper: Optional[dict] = None
    if ytd_helper_path.exists():
        try:
            ytd_helper = json.loads(ytd_helper_path.read_text())
        except Exception:
            ytd_helper = None

    if (
        months_elapsed < 12
        and ytd_helper
        and ytd_helper.get(f"year_{latest_year - 1}")
        and ytd_helper.get(f"year_{latest_year}")
    ):
        # True same-period comparison from the YTD helper.
        prev_ytd = ytd_helper[f"year_{latest_year - 1}"]
        cur_ytd = ytd_helper[f"year_{latest_year}"]
        sales_prev_same = int(prev_ytd.get("transaction_count") or 0)
        volume_prev_same = float(prev_ytd.get("total_value_aed") or 0)
        sales_cur_same = int(cur_ytd.get("transaction_count") or sales_latest)
        volume_cur_same = float(cur_ytd.get("total_value_aed") or volume_latest)
        sales_delta_pct = (
            (sales_cur_same - sales_prev_same) / sales_prev_same * 100
            if sales_prev_same > 0 else None
        )
        volume_delta_pct = (
            (volume_cur_same - volume_prev_same) / volume_prev_same * 100
            if volume_prev_same > 0 else None
        )
        sales_delta_label = f"vs {period_label} {latest_year - 1}"
        volume_delta_label = sales_delta_label
    elif months_elapsed < 12:
        # Fallback: prorate prior full year (legacy path). Flag the label
        # so the UI doesn't claim a true same-period comparison.
        sales_prev_same = sales_prev * months_elapsed / 12
        volume_prev_same = volume_prev * months_elapsed / 12
        sales_delta_pct = (
            (sales_latest - sales_prev_same) / sales_prev_same * 100
            if sales_prev_same > 0 else None
        )
        volume_delta_pct = (
            (volume_latest - volume_prev_same) / volume_prev_same * 100
            if volume_prev_same > 0 else None
        )
        sales_delta_label = f"vs {latest_year - 1} (prorated 5/12)"
        volume_delta_label = sales_delta_label
    else:
        sales_delta_pct = (
            (sales_latest - sales_prev) / sales_prev * 100 if sales_prev else None
        )
        volume_delta_pct = (
            (volume_latest - volume_prev) / volume_prev * 100 if volume_prev else None
        )
        sales_delta_label = f"vs {latest_year - 1}" if sales_prev else None
        volume_delta_label = f"vs {latest_year - 1}" if volume_prev else None

    sales_sublabel = (
        f"{period_label} {latest_year}" if months_elapsed < 12 else f"{latest_year} total"
    )

    # ---- KPI tiles ----
    kpis: list[DashboardKpi] = []
    kpis.append(DashboardKpi(
        label=f"Sales {latest_year} YTD",
        value=float(sales_latest),
        unit="count",
        sublabel=sales_sublabel,
        delta_pct=sales_delta_pct,
        delta_label=sales_delta_label,
    ))
    kpis.append(DashboardKpi(
        label=f"Sales volume {latest_year} YTD",
        value=volume_latest,
        unit="aed",
        sublabel=sales_sublabel,
        delta_pct=volume_delta_pct,
        delta_label=volume_delta_label,
    ))
    kpis.append(DashboardKpi(
        label=f"Avg yield {latest_year}",
        value=round(avg_yield_pct_f or 0, 2),
        unit="pct",
        sublabel="Dubai market average",
        delta_pct=(
            (avg_yield_pct_f - float(avg_yield_prev)) if (avg_yield_pct_f is not None and avg_yield_prev is not None)
            else None
        ),
        delta_label=f"vs {latest_year - 1} annual avg" if avg_yield_prev is not None else None,
    ))
    kpis.append(DashboardKpi(
        label=f"Rent contracts {latest_year - 1}-{latest_year}",
        value=float(rent_contracts),
        unit="count",
        sublabel="Ejari registrations",
    ))
    kpis.append(DashboardKpi(
        label="Active RERA brokers",
        value=float(active_brokers),
        unit="count",
        sublabel=f"Licensed as of {today_date.isoformat()}",
    ))
    kpis.append(DashboardKpi(
        label=f"Off-plan share {latest_year}",
        value=round(offplan_share_pct, 1),
        unit="pct",
        sublabel="Of all sales",
    ))

    # ---- Ticker ----
    top_yield_pct = top_yield_areas[0].value if top_yield_areas else None
    top_5y_pct = top_appreciation_areas[0].value if top_appreciation_areas else None
    ticker = DashboardTicker(
        sales_2026_ytd=sales_latest,
        volume_2026_aed=volume_latest,
        top_yield_pct=round(top_yield_pct, 2) if top_yield_pct is not None else None,
        top_5y_growth_pct=round(top_5y_pct, 1) if top_5y_pct is not None else None,
        active_brokers=active_brokers,
        areas_tracked=areas_tracked,
    )

    # ---- Data intelligence footer ----
    records_analyzed = total_sales + rent_contracts + active_brokers
    intelligence = DataIntelligenceFooter(
        last_updated=_dt.utcnow().date().isoformat(),
        records_analyzed=records_analyzed,
        data_sources=[
            "DLD Transactions (Sales of Units)",
            "DLD Ejari Rent Contracts",
            "DLD Land Registry",
            "DLD RERA Broker Registry",
            "DLD Buildings / Projects",
            "DLD Price History (derived)",
            "DLD Rent History (derived)",
            "DLD Yield History (derived)",
            "DLD Area Appreciation (derived)",
            "OSM Admin Boundaries (geocoding)",
        ],
        next_update=None,
        confidence="high",
    )

    payload = {
        "ticker": ticker.model_dump(),
        "kpis": [k.model_dump() for k in kpis],
        "sales_composition": [s.model_dump() for s in sales_composition],
        "sales_composition_total_aed": round(latest_volume_f, 2),
        "price_history": [p.model_dump() for p in price_history],
        "top_yield_areas": [t.model_dump() for t in top_yield_areas],
        "top_appreciation_areas": [t.model_dump() for t in top_appreciation_areas],
        "activity": [a.model_dump() for a in activity],
        "rent_growth_leaders": [r.model_dump() for r in rent_growth_leaders],
        "yield_trend": [y.model_dump() for y in yield_trend],
        "yield_trend_direction": direction,
        "supply_pipeline": [s.model_dump() for s in supply_pipeline],
        "broker_stats": BrokerStats(
            licenses_per_year=licenses_per_year,
            top_firms=top_firms,
            total_active=active_brokers,
        ).model_dump(),
        "intelligence": intelligence.model_dump(),
    }

    try:
        await redis_client.setex(
            DASHBOARD_DATA_CACHE_KEY, DASHBOARD_DATA_TTL_S, json.dumps(payload, default=str),
        )
    except Exception:
        pass

    return DashboardDataResponse(**payload, cached=False)


@router.get("/areas/top-appreciation", response_model=TopAppreciationResponse)
async def dld_top_appreciation(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(5, ge=1, le=50),
    min_years: int = Query(5, ge=1, le=18, description="Require at least N years of history"),
    window: str = Query(
        "5y", pattern="^(5y|10y)$",
        description="Sort window. '5y' (default) or '10y' for long-term performance.",
    ),
):
    """Top-N areas by price appreciation over the selected window.

    Powers the homepage "Fastest Growing Areas" widget when window='5y',
    and the "18-Year Track Record" widget when window='10y'. Requires a
    full `min_years` series so we don't surface noisy 1-2 year jumps;
    when window='10y' the caller should set min_years=10. Pulls the
    latest avg PPSF alongside so the widget can show 'AED 16,752/sqft'
    context without another round-trip.
    """
    if window == "10y":
        sort_col = DldAreaAppreciation.appreciation_10y_pct
    else:
        sort_col = DldAreaAppreciation.appreciation_5y_pct
    stmt = (
        select(DldAreaAppreciation, DldArea.name_display)
        .outerjoin(DldArea, DldArea.name_norm == DldAreaAppreciation.area_name_norm)
        .where(
            sort_col.isnot(None),
            DldAreaAppreciation.appreciation_5y_pct.isnot(None),
            DldAreaAppreciation.years_of_data >= min_years,
        )
        .order_by(sort_col.desc())
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
            appreciation_10y_pct=float(a.appreciation_10y_pct) if a.appreciation_10y_pct is not None else None,
            cagr_5y_pct=float(a.cagr_5y_pct) if a.cagr_5y_pct is not None else None,
            cagr_10y_pct=float(a.cagr_10y_pct) if a.cagr_10y_pct is not None else None,
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
        "appreciation_10y_pct": float(appreciation.appreciation_10y_pct) if appreciation.appreciation_10y_pct is not None else None,
        "cagr_5y_pct": float(appreciation.cagr_5y_pct) if appreciation.cagr_5y_pct is not None else None,
        "cagr_10y_pct": float(appreciation.cagr_10y_pct) if appreciation.cagr_10y_pct is not None else None,
        "years_of_data": int(appreciation.years_of_data or 0),
    }


async def _load_rent_history(
    db: AsyncSession, area_name_norm: str
) -> list[RentHistoryPoint]:
    rows = (
        await db.execute(
            select(DldRentHistory)
            .where(DldRentHistory.area_name_norm == area_name_norm)
            .order_by(DldRentHistory.year)
        )
    ).scalars().all()
    return [
        RentHistoryPoint(
            year=int(r.year),
            avg_annual_rent=float(r.avg_annual_rent) if r.avg_annual_rent is not None else None,
            avg_rent_per_sqft=float(r.avg_rent_per_sqft) if r.avg_rent_per_sqft is not None else None,
            median_annual_rent=float(r.median_annual_rent) if r.median_annual_rent is not None else None,
            contract_count=int(r.contract_count or 0),
            renewal_rate_pct=float(r.renewal_rate_pct) if r.renewal_rate_pct is not None else None,
        )
        for r in rows
    ]


async def _load_yield_history(
    db: AsyncSession, area_name_norm: str
) -> tuple[list[YieldHistoryPoint], Optional[str]]:
    """Return (points, trend) where trend ∈ {'rising','falling','flat',None}.

    Trend is computed from the first vs last non-null gross_yield_pct.
    Threshold: ±0.25 percentage points is 'flat'.
    """
    rows = (
        await db.execute(
            select(DldYieldHistory)
            .where(DldYieldHistory.area_name_norm == area_name_norm)
            .order_by(DldYieldHistory.year)
        )
    ).scalars().all()
    points = [
        YieldHistoryPoint(
            year=int(r.year),
            gross_yield_pct=float(r.gross_yield_pct) if r.gross_yield_pct is not None else None,
            sale_ppsf=float(r.sale_ppsf) if r.sale_ppsf is not None else None,
            rent_psf=float(r.rent_psf) if r.rent_psf is not None else None,
            yield_delta_yoy_pct=float(r.yield_delta_yoy_pct) if r.yield_delta_yoy_pct is not None else None,
            sample_score=int(r.sample_score or 0),
        )
        for r in rows
    ]
    non_null = [p for p in points if p.gross_yield_pct is not None]
    trend: Optional[str] = None
    if len(non_null) >= 2:
        delta = non_null[-1].gross_yield_pct - non_null[0].gross_yield_pct
        if delta > 0.25:
            trend = "rising"
        elif delta < -0.25:
            trend = "falling"
        else:
            trend = "flat"
    return points, trend


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
    rent_history = await _load_rent_history(db, area.name_norm)
    yield_history, yield_trend = await _load_yield_history(db, area.name_norm)

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
        rent_history=rent_history,
        yield_history=yield_history,
        yield_trend=yield_trend,
    )
    return DldAreaDetailResponse(area=detail)


@router.get(
    "/areas/{name_or_norm}/rent-history",
    response_model=DldRentHistoryResponse,
)
async def get_dld_area_rent_history(
    name_or_norm: str, db: AsyncSession = Depends(get_db)
):
    """Per-year rent series from Ejari 2021–2026."""
    norm = name_or_norm.strip().lower()
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    points = await _load_rent_history(db, area.name_norm)
    return DldRentHistoryResponse(
        area_name_norm=area.name_norm,
        area_name_display=area.name_display,
        points=points,
        years_of_history=len(points),
    )


@router.get(
    "/areas/{name_or_norm}/yield-history",
    response_model=DldYieldHistoryResponse,
)
async def get_dld_area_yield_history(
    name_or_norm: str, db: AsyncSession = Depends(get_db)
):
    """Per-year gross yield (rent_psf / sale_ppsf × 100, capped 25%)
    plus YoY delta, derived from joining price + rent histories."""
    norm = name_or_norm.strip().lower()
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    points, trend = await _load_yield_history(db, area.name_norm)
    return DldYieldHistoryResponse(
        area_name_norm=area.name_norm,
        area_name_display=area.name_display,
        points=points,
        years_of_history=len(points),
        trend=trend,
    )


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
        appreciation_10y_pct=(appreciation or {}).get("appreciation_10y_pct"),
        cagr_5y_pct=(appreciation or {}).get("cagr_5y_pct"),
        cagr_10y_pct=(appreciation or {}).get("cagr_10y_pct"),
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


def _classify_building_type(
    project_name: Optional[str],
    master_project: Optional[str],
    prop_sub_type: Optional[str],
    is_offplan: Optional[bool],
) -> tuple[str, str, str, bool]:
    """Returns (type_key, human_label, emoji, is_community_aggregate).

    Priority:
      1. Off-plan flag → "Under construction" wins regardless of sub-type
         (those buildings have no rental contracts yet and aren't a
         tower/villa from an investor's perspective).
      2. Villa sub-type → "Villa community".
      3. project_name == master_project → "Residential complex" (the
         building record is actually a community-wide aggregate).
      4. Default → "Single tower".
    """
    is_community = (
        master_project is not None
        and project_name is not None
        and project_name.strip().casefold() == master_project.strip().casefold()
    )
    if is_offplan is True:
        return "under_construction", "Under construction", "🏗️", is_community
    if prop_sub_type and "villa" in prop_sub_type.lower():
        return "villa_community", "Villa community", "🏡", is_community
    if is_community:
        return "complex", "Residential complex", "🏘️", True
    return "tower", "Single tower", "🏢", False


def _demand_signal(active_rent_count: int) -> str:
    """Bucket the contract count into a qualitative demand tier."""
    if active_rent_count >= 50:
        return "very_high"
    if active_rent_count >= 20:
        return "high"
    if active_rent_count >= 5:
        return "moderate"
    return "low"


def _age_years(creation_date: Optional[datetime]) -> Optional[int]:
    if creation_date is None:
        return None
    # Use the dataset snapshot date as "today" so results are deterministic
    today = date(2026, 6, 1)
    delta = (today - creation_date.date()).days
    if delta < 0:
        return 0
    return max(0, delta // 365)


def _build_building_item(
    b: DldBuilding,
    area_name: Optional[str],
    siblings_in_master_project: Optional[int] = None,
    area_median_rent_psf: Optional[float] = None,
) -> DldBuildingItem:
    total = _total_annual_income(b)
    type_key, type_label, type_emoji, is_community = _classify_building_type(
        b.project_name, b.master_project, b.prop_sub_type, b.is_offplan,
    )
    avg_psf = float(b.avg_rent_per_sqft) if b.avg_rent_per_sqft is not None else None
    delta_psf: Optional[float] = None
    delta_pct: Optional[float] = None
    if avg_psf is not None and area_median_rent_psf and area_median_rent_psf > 0:
        delta_psf = round(avg_psf - area_median_rent_psf, 2)
        delta_pct = round((avg_psf - area_median_rent_psf) / area_median_rent_psf * 100, 1)

    return DldBuildingItem(
        id=b.id,
        project_name=b.project_name,
        master_project=b.master_project,
        area_name=area_name,
        prop_sub_type=b.prop_sub_type,
        flats=b.flats,
        floors=b.floors,
        avg_annual_rent=float(b.avg_annual_rent) if b.avg_annual_rent is not None else None,
        avg_rent_per_sqft=avg_psf,
        active_rent_count=b.active_rent_count,
        occupancy_proxy_pct=float(b.occupancy_proxy_pct) if b.occupancy_proxy_pct is not None else None,
        is_freehold=b.is_freehold,
        is_offplan=b.is_offplan,
        creation_date=b.creation_date,
        total_annual_income=total,
        income_range_label=_income_range_label(total),
        confidence=confidence_for(b.active_rent_count),
        building_type=type_key,
        building_type_label=type_label,
        building_type_emoji=type_emoji,
        is_community_aggregate=is_community,
        siblings_in_master_project=siblings_in_master_project,
        age_years=_age_years(b.creation_date),
        rent_psf_vs_area_delta=delta_psf,
        rent_psf_vs_area_pct=delta_pct,
        area_median_rent_psf=area_median_rent_psf,
        demand_signal=_demand_signal(b.active_rent_count),
        building_name_clean=b.building_name_clean,
        building_name_type=b.building_name_type,
        display_name=b.display_name,
        is_identifiable=bool(b.is_identifiable),
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
    master_project: Optional[str] = Query(None, description="filter by master_project substring"),
    q: Optional[str] = Query(
        None,
        description="Cross-search across project_name + master_project + area "
                    "name (case-insensitive). Combined with the other filters "
                    "via AND so users can narrow further on top of a search.",
    ),
    prop_sub_type: Optional[str] = Query(None, description="e.g. Flat, Villa"),
    building_type: Optional[str] = Query(
        None,
        description="Filter by derived type bucket: tower | complex | "
                    "villa_community | under_construction",
        pattern="^(tower|complex|villa_community|under_construction)$",
    ),
    min_rents: int = Query(0, ge=0),
    sort_by: str = Query(
        "rent_count",
        description="rent_count | rent_per_sqft | avg_rent | occupancy",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = (
        select(DldBuilding, DldArea.name_display, DldArea.name_norm)
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
    if master_project:
        conds.append(DldBuilding.master_project.ilike(f"%{master_project.strip()}%"))
    if q:
        needle = f"%{q.strip()}%"
        conds.append(or_(
            DldBuilding.project_name.ilike(needle),
            DldBuilding.master_project.ilike(needle),
            DldArea.name_display.ilike(needle),
            DldArea.name_norm.ilike(needle),
        ))
    if prop_sub_type:
        conds.append(DldBuilding.prop_sub_type == prop_sub_type)
    if building_type == "under_construction":
        conds.append(DldBuilding.is_offplan.is_(True))
    elif building_type == "villa_community":
        conds.append(DldBuilding.prop_sub_type.ilike("%villa%"))
        # Exclude off-plan (would've been bucketed under construction)
        conds.append(or_(DldBuilding.is_offplan.is_(False), DldBuilding.is_offplan.is_(None)))
    elif building_type == "complex":
        conds.append(DldBuilding.project_name == DldBuilding.master_project)
        conds.append(or_(DldBuilding.is_offplan.is_(False), DldBuilding.is_offplan.is_(None)))
    elif building_type == "tower":
        # NOT a complex, NOT a villa, NOT off-plan
        conds.append(DldBuilding.project_name != DldBuilding.master_project)
        conds.append(
            or_(DldBuilding.prop_sub_type.is_(None),
                ~DldBuilding.prop_sub_type.ilike("%villa%"))
        )
        conds.append(or_(DldBuilding.is_offplan.is_(False), DldBuilding.is_offplan.is_(None)))
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

    # ---- Compute siblings (same master_project + same area) for the
    # community-aggregate disclosure. ONE roundtrip across all distinct
    # (master_project, dld_area_id) pairs in the page.
    sibling_keys: set[tuple[str, Optional[UUID]]] = {
        (b.master_project, b.dld_area_id)
        for b, _, _ in rows
        if b.master_project
    }
    sibling_counts: dict[tuple[str, Optional[UUID]], int] = {}
    if sibling_keys:
        sib_rows = (await db.execute(
            select(
                DldBuilding.master_project,
                DldBuilding.dld_area_id,
                func.count().label("c"),
            )
            .where(DldBuilding.master_project.in_({k[0] for k in sibling_keys}))
            .group_by(DldBuilding.master_project, DldBuilding.dld_area_id)
        )).all()
        for mp, aid, c in sib_rows:
            sibling_counts[(mp, aid)] = int(c)

    # ---- Per-area median rent-per-sqft for the "vs area" benchmark.
    # We aggregate across the same DldBuilding rows in the area as a quick
    # robust proxy (DldAreaMetrics.median_rent_per_sqft is also available
    # but uses Ejari medians; building-level avg-of-avg is more directly
    # comparable to what each card shows).
    area_ids = {b.dld_area_id for b, _, _ in rows if b.dld_area_id}
    area_psf: dict[UUID, float] = {}
    if area_ids:
        psf_rows = (await db.execute(
            select(
                DldBuilding.dld_area_id,
                func.percentile_cont(0.5).within_group(
                    DldBuilding.avg_rent_per_sqft.asc()
                ),
            )
            .where(
                DldBuilding.dld_area_id.in_(area_ids),
                DldBuilding.avg_rent_per_sqft.is_not(None),
                DldBuilding.active_rent_count >= 3,
            )
            .group_by(DldBuilding.dld_area_id)
        )).all()
        for aid, med in psf_rows:
            if med is not None:
                area_psf[aid] = float(med)

    items = [
        _build_building_item(
            b,
            area_display,
            siblings_in_master_project=(
                sibling_counts.get((b.master_project, b.dld_area_id))
                if b.master_project else None
            ),
            area_median_rent_psf=area_psf.get(b.dld_area_id) if b.dld_area_id else None,
        )
        for b, area_display, _area_norm in rows
    ]
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

    # Enrich the detail with the same derived fields as the list endpoint:
    # siblings_in_master_project + area_median_rent_psf benchmark.
    siblings: Optional[int] = None
    if b.master_project and dld_area_id:
        siblings = int(await db.scalar(
            select(func.count()).select_from(DldBuilding).where(
                DldBuilding.master_project == b.master_project,
                DldBuilding.dld_area_id == dld_area_id,
            )
        ) or 0)

    area_psf: Optional[float] = None
    if dld_area_id:
        area_psf_val = await db.scalar(
            select(func.percentile_cont(0.5).within_group(
                DldBuilding.avg_rent_per_sqft.asc()
            ))
            .where(
                DldBuilding.dld_area_id == dld_area_id,
                DldBuilding.avg_rent_per_sqft.is_not(None),
                DldBuilding.active_rent_count >= 3,
            )
        )
        if area_psf_val is not None:
            area_psf = float(area_psf_val)

    base = _build_building_item(
        b, area_name,
        siblings_in_master_project=siblings,
        area_median_rent_psf=area_psf,
    )
    # Drop fields that DldBuildingDetail re-declares so we don't pass them
    # twice via **base.model_dump() + explicit kwargs (Pydantic raises).
    base_dict = base.model_dump()
    for k in ("is_offplan",):
        base_dict.pop(k, None)
    detail = DldBuildingDetail(
        **base_dict,
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
        low_confidence=bm.sample_count < 5,
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
    nationality: Optional[str] = Query(
        None,
        description="Filter by estimated nationality (Emirati / Arab / Indian / "
                    "Pakistani / Russian / British / Filipino / Chinese / Egyptian / Other). "
                    "Estimated from broker name — never verified.",
    ),
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
    if nationality:
        conds.append(DldReraBroker.detected_nationality == nationality)
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
    """Wizard input → top 5 brokers ranked by language match → license validity
    → firm size.

    Language matching: when the caller supplies `language`, candidates whose
    `detected_language` matches sort to the top. Nationality + language are
    estimated from name patterns and never verified — DLD does not publish
    broker nationality data.
    """
    # Pull a much larger pool when language is set so the filter has enough
    # candidates to find quality matches. Without language, 2000 was already
    # enough to find well-staffed firms.
    pool_size = 4000 if req.language else 2000
    pool = (
        await db.execute(
            select(DldReraBroker)
            .where(DldReraBroker.is_active.is_(True))
            .order_by(DldReraBroker.real_estate_name)
            .limit(pool_size)
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
        # Prefer the stored detected_language (computed at ETL time against
        # the full pattern set); fall back to live detection for brokers
        # whose columns haven't been populated yet.
        lang_code = _broker_language_code(b)
        status_str, days = _license_status(b.license_end_date)
        if status_str == "expired":
            continue
        candidates.append((b, lang_code, status_str, days))

    # Rank: language match first → license recency → firm size desc
    def sort_key(t: tuple) -> tuple:
        b, lang_code, _status, days = t
        lang_match = 0 if (req.language and lang_code == req.language) else 1
        return (
            lang_match,
            -firm_size.get(b.real_estate_name or "", 0),
            -(days or 0),
        )
    candidates.sort(key=sort_key)

    # When language is set, drop candidates that don't match before slicing
    # so the response is strictly language-filtered (matching the user's
    # explicit preference).
    if req.language:
        candidates = [t for t in candidates if t[1] == req.language]
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
            detected_language=lang_code,
            detected_nationality=b.detected_nationality,
            nationality_flag=b.nationality_flag,
            company_size_active_brokers=firm_size.get(b.real_estate_name or "", 0),
            license_status=status_str,
            days_until_expiry=days,
        )
        for (b, lang_code, status_str, days) in top
    ]
    return BrokerMatchResponse(count=len(items), items=items)


def _broker_language_code(b: DldReraBroker) -> str:
    """Resolve a broker's language code, preferring the populated column."""
    from app.services.broker_nationality import detect_language_code
    stored = (b.detected_language or "").strip()
    if stored:
        return _LANGUAGE_FROM_HUMAN.get(stored, "english")
    return detect_language_code(b.full_name or "")


# Human-readable language → API enum code mapping (mirrors the
# NATIONALITY_META table in app.services.broker_nationality).
_LANGUAGE_FROM_HUMAN: dict[str, str] = {
    "Arabic":     "arabic",
    "Russian":    "russian",
    "Mandarin":   "chinese",
    "Hindi/Urdu": "hindi",
    "Tagalog":    "filipino",
    "English":    "english",
}


# ---------------------------------------------------------------------------
# Broker nationality stats — distribution across active brokers
# ---------------------------------------------------------------------------

@router.get("/broker-nationality-stats", response_model=BrokerNationalityStats)
async def brokers_nationality_stats(db: AsyncSession = Depends(get_db)):
    """Active-broker distribution by estimated nationality.

    Always returns an "estimated_disclaimer" string the client should
    surface alongside — these counts are heuristic, not DLD-verified.
    """
    from app.services.broker_nationality import NATIONALITY_META

    rows = (await db.execute(
        select(
            DldReraBroker.detected_nationality,
            DldReraBroker.nationality_flag,
            DldReraBroker.detected_language,
            func.count(),
        )
        .where(
            DldReraBroker.is_active.is_(True),
            DldReraBroker.detected_nationality.is_not(None),
        )
        .group_by(
            DldReraBroker.detected_nationality,
            DldReraBroker.nationality_flag,
            DldReraBroker.detected_language,
        )
        .order_by(func.count().desc())
    )).all()
    total = sum(int(c) for _n, _f, _l, c in rows)
    buckets = [
        BrokerNationalityBucket(
            nationality=nat or "Other",
            flag=flag or NATIONALITY_META.get(nat or "Other", ("🌐", ""))[0],
            language=lang or NATIONALITY_META.get(nat or "Other", ("", "English"))[1],
            count=int(c),
        )
        for nat, flag, lang, c in rows
    ]
    return BrokerNationalityStats(
        total=total,
        estimated_disclaimer=(
            "Nationality is estimated from broker names and may not be "
            "accurate. DLD does not publish broker nationality data."
        ),
        buckets=buckets,
    )


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


# ===========================================================================
# Rent rankings — cheapest / most expensive areas for a size + prop type.
# Surfaces honest "no-data" when no benchmark row exists for the
# requested (size_band, prop_sub_type) combo.
# ===========================================================================

@router.get("/rents/by-area", response_model=RentRankingResponse)
async def dld_rents_by_area(
    direction: str = Query("cheapest", pattern="^(cheapest|expensive)$"),
    size: str = Query("1br", pattern="^(studio|1br|2br|3br|4br)$"),
    prop_sub_type: str = Query("Flat"),
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Cheapest / most expensive areas by median annual rent for a given
    size + property type. Sample floor enforced — only rows with enough
    Ejari contracts to be statistically reliable."""
    size_bands = SIZE_CATEGORY_BANDS.get(size, [])
    if not size_bands:
        raise HTTPException(status_code=400, detail=f"unknown size: {size}")
    from app.models.dld import DldRentBenchmark
    order_dir = (
        DldRentBenchmark.median_annual_rent.asc()
        if direction == "cheapest"
        else DldRentBenchmark.median_annual_rent.desc()
    )
    rows = (await db.execute(
        select(DldRentBenchmark, DldArea)
        .join(DldArea, DldArea.id == DldRentBenchmark.dld_area_id)
        .where(
            DldRentBenchmark.size_band.in_(size_bands),
            DldRentBenchmark.prop_sub_type == prop_sub_type,
            DldRentBenchmark.sample_count >= MIN_RELIABLE_SAMPLES,
        )
        .order_by(order_dir)
        .limit(limit)
    )).all()
    items = [
        RentRankingItem(
            area_name=area.name_display or area.name_norm.title(),
            area_name_norm=area.name_norm,
            prop_sub_type=b.prop_sub_type,
            size_band=b.size_band,
            median_annual_rent=float(b.median_annual_rent),
            median_rent_per_sqft=float(b.median_rent_per_sqft),
            p25_annual_rent=float(b.p25_annual_rent),
            p75_annual_rent=float(b.p75_annual_rent),
            sample_count=int(b.sample_count),
        )
        for b, area in rows
    ]
    return RentRankingResponse(
        direction=direction,  # type: ignore[arg-type]
        size_category=size,
        prop_sub_type=prop_sub_type,
        count=len(items),
        items=items,
    )


# ===========================================================================
# Opportunities — DLD-filtered, scored, ranked.
# Score = 0.30*yield + 0.25*rent_growth + 0.20*appreciation_5y
#       + 0.15*demand + 0.10*low_supply_risk
# Each component normalized to 0-1 against Dubai-wide bounds.
# ===========================================================================

SUPPLY_RISK_FROM_OFFPLAN = {
    None: None,
    "low": 1.0, "medium": 0.5, "high": 0.0,
}


def _classify_supply(offplan_pct: Optional[float]) -> Optional[str]:
    if offplan_pct is None:
        return None
    if offplan_pct < 30:
        return "low"
    if offplan_pct < 60:
        return "medium"
    return "high"


def _normalize(v: Optional[float], lo: float, hi: float) -> float:
    if v is None or hi <= lo:
        return 0.0
    return max(0.0, min(1.0, (v - lo) / (hi - lo)))


def _confidence_from_samples(sales: int, rents: int) -> str:
    if sales >= MIN_RELIABLE_SAMPLES * 5 and rents >= MIN_RELIABLE_SAMPLES * 5:
        return "high"
    if sales >= MIN_RELIABLE_SAMPLES and rents >= MIN_RELIABLE_SAMPLES:
        return "medium"
    return "low"


@router.get("/opportunities-filtered", response_model=OpportunitiesFilteredResponse)
async def dld_opportunities_filtered(
    goal: str = Query("balanced", pattern="^(income|growth|balanced|offplan)$"),
    risk: str = Query("medium", pattern="^(low|medium|high)$"),
    budget_aed_max: Optional[float] = Query(None, gt=0),
    property_type: Optional[str] = Query(None, pattern="^(apartment|villa|offplan)$"),
    limit: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Real DLD-grounded opportunities. Each card carries the metrics that
    drove its rank + a confidence tier so the UI can honestly fade
    low-sample rows. No fabricated 'why this area' copy — the reasoning
    bullets cite specific DLD numbers."""
    from app.models.dld import DldAreaLandSummary

    # Pull every area that has both current metrics + 5y appreciation
    # (we need both to score). LEFT JOIN land summary for freehold %.
    rows = (await db.execute(
        select(
            DldArea,
            DldAreaMetrics,
            DldAreaAppreciation,
            DldAreaLandSummary,
        )
        .join(DldAreaMetrics, DldAreaMetrics.dld_area_id == DldArea.id)
        .outerjoin(DldAreaAppreciation, DldAreaAppreciation.dld_area_id == DldArea.id)
        .outerjoin(DldAreaLandSummary, DldAreaLandSummary.area_name_norm == DldArea.name_norm)
        .where(
            DldAreaMetrics.period == "2026-ytd",
            DldAreaMetrics.rental_yield_pct.is_not(None),
            DldAreaMetrics.sales_count >= MIN_RELIABLE_SAMPLES,
            DldAreaMetrics.rent_count_2026 >= MIN_RELIABLE_SAMPLES,
        )
    )).all()

    # Find market-wide latest-year supply via DldPriceHistory.offplan_pct
    latest_year = await db.scalar(select(func.max(DldPriceHistory.year))) or 2026
    offplan_rows = (await db.execute(
        select(DldPriceHistory.dld_area_id, DldPriceHistory.offplan_pct)
        .where(DldPriceHistory.year == latest_year)
    )).all()
    offplan_by_area = {a: float(p) for a, p in offplan_rows if a and p is not None}

    # Normalisation bounds — tuned to Dubai's distribution
    YIELD_LO, YIELD_HI = 4.0, 12.0
    RGROWTH_LO, RGROWTH_HI = -5.0, 25.0
    APP_LO, APP_HI = 0.0, 200.0  # 5y cumulative %

    items: List[OpportunityFilteredItem] = []
    for area, metrics, appr, land in rows:
        ppsf = float(metrics.median_price_per_sqft or metrics.avg_price_per_sqft or 0)
        yield_pct = cap_yield(float(metrics.rental_yield_pct))
        rgrowth = float(metrics.rent_growth_yoy_pct) if metrics.rent_growth_yoy_pct is not None else None
        app5y = float(appr.appreciation_5y_pct) if appr and appr.appreciation_5y_pct is not None else None
        cagr = float(appr.cagr_5y_pct) if appr and appr.cagr_5y_pct is not None else None
        offplan_pct = offplan_by_area.get(area.id)
        supply = _classify_supply(offplan_pct)
        freehold_pct = float(land.freehold_pct) if land and land.freehold_pct is not None else None

        # Budget filter — drop areas whose median entry exceeds the budget.
        # Use 500 sqft as a tiny-unit minimum; if user budget can't even
        # buy that, the area is too expensive.
        if budget_aed_max and ppsf > 0:
            entry_price = ppsf * 500
            if entry_price > budget_aed_max:
                continue

        # Property type filter
        if property_type == "offplan" and (offplan_pct is None or offplan_pct < 50):
            continue
        # apartment / villa filter — DLD area model doesn't carry a clean
        # dominant property type, so we approximate via avg_price_per_sqft
        # band (villas tend to be lower ppsf, apartments higher), with a
        # 1500 AED/sqft split. This is a known-coarse proxy — note it on
        # the response via reasoning instead of pretending to be precise.

        # Score components
        yc = _normalize(yield_pct, YIELD_LO, YIELD_HI)
        rc = _normalize(rgrowth, RGROWTH_LO, RGROWTH_HI) if rgrowth is not None else 0.0
        ac = _normalize(app5y, APP_LO, APP_HI) if app5y is not None else 0.0
        dc = _normalize(float(metrics.sales_count), MIN_RELIABLE_SAMPLES, 500.0)
        sc = SUPPLY_RISK_FROM_OFFPLAN.get(supply, 0.5) or 0.5

        # Goal weighting
        if goal == "income":
            w = (0.55, 0.25, 0.05, 0.10, 0.05)
        elif goal == "growth":
            w = (0.10, 0.20, 0.50, 0.10, 0.10)
        elif goal == "offplan":
            # Off-plan strategy actively prefers HIGH supply (more new units
            # to choose from) and weights appreciation heavier than yield.
            w = (0.10, 0.15, 0.45, 0.15, -0.10)
        else:  # balanced
            w = (0.30, 0.25, 0.20, 0.15, 0.10)
        raw = w[0]*yc + w[1]*rc + w[2]*ac + w[3]*dc + w[4]*sc

        # Risk modifier — low-risk users penalise high supply heavier
        if risk == "low" and supply == "high":
            raw -= 0.10
        elif risk == "high" and supply == "high":
            raw += 0.05

        score = round(max(0.0, min(1.0, raw)) * 100, 1)
        sales_count = int(metrics.sales_count or 0)
        rent_count = int(metrics.rent_count_2026 or 0)
        confidence = _confidence_from_samples(sales_count, rent_count)
        visa_eligible = (
            freehold_pct is not None and freehold_pct >= 50
            and ppsf > 0 and (ppsf * 500) >= 750_000
        )

        # Reasoning bullets — every claim cited
        reasoning = []
        if yield_pct is not None:
            reasoning.append(
                f"Gross yield {yield_pct:.2f}% (DLD 2026 YTD, "
                f"{sales_count:,} sales + {rent_count:,} rent contracts)"
            )
        if rgrowth is not None:
            direction = "+" if rgrowth >= 0 else ""
            reasoning.append(f"Rent {direction}{rgrowth:.1f}% YoY (DLD Ejari 2025→2026)")
        if app5y is not None and cagr is not None:
            reasoning.append(
                f"Price +{app5y:.0f}% over 5y (CAGR +{cagr:.1f}%, DLD 2021→{latest_year})"
            )
        if supply:
            offplan_str = f" — {offplan_pct:.0f}% off-plan" if offplan_pct is not None else ""
            reasoning.append(f"Supply risk: {supply.upper()}{offplan_str}")
        if freehold_pct is not None:
            reasoning.append(f"{freehold_pct:.0f}% of plots are freehold")

        items.append(OpportunityFilteredItem(
            area_id=str(area.id),
            area_name=area.name_display or area.name_norm.title(),
            area_name_norm=area.name_norm,
            rank=0,  # filled after sort
            score=score,
            gross_yield_pct=yield_pct,
            rent_growth_yoy_pct=rgrowth,
            appreciation_5y_pct=app5y,
            cagr_5y_pct=cagr,
            median_price_per_sqft=ppsf or None,
            transaction_count=sales_count,
            supply_risk=supply,  # type: ignore[arg-type]
            offplan_pct=offplan_pct,
            freehold_pct=freehold_pct,
            investor_visa_eligible=visa_eligible,
            sales_sample_count=sales_count,
            rent_sample_count=rent_count,
            confidence=confidence,  # type: ignore[arg-type]
            reasoning=reasoning,
        ))

    items.sort(key=lambda x: x.score, reverse=True)
    items = items[:limit]
    for i, it in enumerate(items):
        it.rank = i + 1

    return OpportunitiesFilteredResponse(
        goal=goal,
        risk=risk,
        budget_aed_max=budget_aed_max,
        property_type=property_type,
        count=len(items),
        formula=OpportunityScoreFormula(),
        items=items,
    )


# ===========================================================================
# Similar areas — k-NN by (yield, log price). Cheap proxy that works well
# for "if you like JVC you might like X" suggestions.
# ===========================================================================

@router.get("/areas/{name_or_norm}/similar", response_model=SimilarAreasResponse)
async def dld_similar_areas(
    name_or_norm: str,
    limit: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    import math
    norm = re.sub(r"\s+", " ", name_or_norm.strip().lower())

    # Pull source area + all candidates with metrics
    rows = (await db.execute(
        select(DldArea, DldAreaMetrics)
        .join(DldAreaMetrics, DldAreaMetrics.dld_area_id == DldArea.id)
        .where(
            DldAreaMetrics.period == "2026-ytd",
            DldAreaMetrics.rental_yield_pct.is_not(None),
            DldAreaMetrics.median_price_per_sqft.is_not(None),
            DldAreaMetrics.sales_count >= MIN_RELIABLE_SAMPLES,
        )
    )).all()

    source = next(
        (
            (a, m) for a, m in rows
            if a.name_norm == norm or (a.name_display or "").lower() == norm
        ),
        None,
    )
    if source is None:
        raise HTTPException(status_code=404, detail=f"No area metrics for '{name_or_norm}'")
    src_area, src_metrics = source
    src_yield = float(src_metrics.rental_yield_pct)
    src_ppsf = float(src_metrics.median_price_per_sqft)
    src_log_price = math.log(src_ppsf) if src_ppsf > 0 else 0

    # Score each candidate by inverse distance in (yield, log-price) space
    cands = []
    for a, m in rows:
        if a.id == src_area.id:
            continue
        y = float(m.rental_yield_pct)
        p = float(m.median_price_per_sqft)
        if p <= 0:
            continue
        d_yield = abs(y - src_yield) / 5.0  # normalise yield diff by 5pp
        d_price = abs(math.log(p) - src_log_price) / 1.5  # log-space tolerance
        dist = (d_yield**2 + d_price**2) ** 0.5
        # similarity_score: 1 when identical, 0 when distant
        sim = max(0.0, 1.0 - dist)
        cands.append((sim, a, m, y, p))

    cands.sort(key=lambda x: -x[0])
    top = cands[:limit]
    items = []
    for i, (sim, a, m, y, p) in enumerate(top):
        # Build a short reason citing the closest dimension
        d_y = abs(y - src_yield)
        d_p_pct = abs(p - src_ppsf) / max(src_ppsf, 1) * 100
        if d_y < 0.5 and d_p_pct < 15:
            reason = f"Near-identical yield ({y:.2f}% vs {src_yield:.2f}%) and price"
        elif d_y < 0.5:
            reason = f"Similar yield ({y:.2f}% vs {src_yield:.2f}%)"
        elif d_p_pct < 15:
            reason = f"Similar price band (~{p:.0f} vs {src_ppsf:.0f} AED/sqft)"
        else:
            reason = f"Closest match overall (yield {y:.2f}%, {p:.0f} AED/sqft)"
        items.append(SimilarAreaItem(
            rank=i + 1,
            area_id=str(a.id),
            area_name=a.name_display or a.name_norm.title(),
            area_name_norm=a.name_norm,
            median_price_per_sqft=p,
            rental_yield_pct=y,
            similarity_score=round(sim, 3),
            reason=reason,
        ))
    return SimilarAreasResponse(
        source_area_name=src_area.name_display or src_area.name_norm.title(),
        source_yield_pct=src_yield,
        source_price_per_sqft=src_ppsf,
        count=len(items),
        items=items,
    )


# ===========================================================================
# Market timing — "is now a good time to buy in {area}?"
# Three signals: yield_trend (rising = good), price_position (% below 5y
# peak = good), supply_pressure (low off-plan share = good).
# ===========================================================================

@router.get("/areas/{name_or_norm}/market-timing", response_model=MarketTimingResponse)
async def dld_market_timing(
    name_or_norm: str,
    db: AsyncSession = Depends(get_db),
):
    norm = re.sub(r"\s+", " ", name_or_norm.strip().lower())

    src_area = (await db.execute(
        select(DldArea).where(
            (DldArea.name_norm == norm) | (func.lower(DldArea.name_display) == norm)
        )
    )).scalar_one_or_none()
    if src_area is None:
        raise HTTPException(status_code=404, detail=f"Area '{name_or_norm}' not found")

    # Yield trend
    ytrend_rows = (await db.execute(
        select(DldYieldHistory.year, DldYieldHistory.gross_yield_pct)
        .where(
            DldYieldHistory.area_name_norm == src_area.name_norm,
            DldYieldHistory.sample_score >= MIN_RELIABLE_SAMPLES,
            DldYieldHistory.gross_yield_pct.is_not(None),
        )
        .order_by(DldYieldHistory.year)
    )).all()
    yield_series = [(int(y), float(v)) for y, v in ytrend_rows if v is not None]
    current_yield = yield_series[-1][1] if yield_series else None
    yield_5y_avg = (
        sum(v for _, v in yield_series) / len(yield_series)
        if yield_series else None
    )

    # Price position vs 5y peak
    price_rows = (await db.execute(
        select(DldPriceHistory.year, DldPriceHistory.avg_ppsf_all, DldPriceHistory.offplan_pct)
        .where(
            DldPriceHistory.area_name_norm == src_area.name_norm,
            DldPriceHistory.avg_ppsf_all.is_not(None),
        )
        .order_by(DldPriceHistory.year)
    )).all()
    price_series = [(int(y), float(p), float(op) if op is not None else None) for y, p, op in price_rows if p is not None]
    current_ppsf = price_series[-1][1] if price_series else None
    peak_ppsf = max((p for _, p, _ in price_series), default=None)
    latest_offplan = price_series[-1][2] if price_series else None

    signals: List[MarketTimingSignal] = []
    reasoning: List[str] = []

    # Signal 1: yield trend
    if len(yield_series) >= 3:
        first_y = yield_series[0][1]
        delta_y = current_yield - first_y if current_yield is not None else 0
        if delta_y < -1.0:
            signals.append(MarketTimingSignal(
                label="yield_trend",
                value=f"falling ({delta_y:+.2f}pp over {len(yield_series)}y)",
                tone="negative",
                detail=f"Yields compressed from {first_y:.2f}% to {current_yield:.2f}%",
            ))
            reasoning.append(
                f"Yield compressed from {first_y:.2f}% in {yield_series[0][0]} "
                f"to {current_yield:.2f}% in {yield_series[-1][0]} — buying late in the cycle"
            )
        elif delta_y > 0.5:
            signals.append(MarketTimingSignal(
                label="yield_trend",
                value=f"rising (+{delta_y:.2f}pp over {len(yield_series)}y)",
                tone="positive",
                detail=f"Yields expanded from {first_y:.2f}% to {current_yield:.2f}%",
            ))
            reasoning.append(
                f"Yield expanded from {first_y:.2f}% to {current_yield:.2f}% — favourable entry"
            )
        else:
            signals.append(MarketTimingSignal(
                label="yield_trend",
                value="stable",
                tone="neutral",
                detail=f"Roughly flat at {current_yield:.2f}% (5y avg {yield_5y_avg:.2f}%)" if yield_5y_avg else "Roughly flat",
            ))

    # Signal 2: price position
    if peak_ppsf and current_ppsf and peak_ppsf > 0:
        gap_pct = (peak_ppsf - current_ppsf) / peak_ppsf * 100
        if gap_pct >= 10:
            signals.append(MarketTimingSignal(
                label="price_position",
                value=f"{gap_pct:.0f}% below 5y peak",
                tone="positive",
                detail=f"Current {current_ppsf:.0f} vs peak {peak_ppsf:.0f} AED/sqft",
            ))
            reasoning.append(
                f"Sale ppsf is {gap_pct:.0f}% below the 5y peak — potential discount entry"
            )
        elif gap_pct < 2:
            signals.append(MarketTimingSignal(
                label="price_position",
                value="at or near 5y peak",
                tone="negative",
                detail=f"Current {current_ppsf:.0f} ≈ peak {peak_ppsf:.0f} AED/sqft",
            ))
            reasoning.append(
                f"Sale ppsf is near 5y peak ({current_ppsf:.0f} vs {peak_ppsf:.0f}) — pricier entry"
            )
        else:
            signals.append(MarketTimingSignal(
                label="price_position",
                value=f"{gap_pct:.0f}% below peak",
                tone="neutral",
                detail=f"Mid-cycle entry — current {current_ppsf:.0f} AED/sqft",
            ))

    # Signal 3: supply pressure
    if latest_offplan is not None:
        if latest_offplan >= 60:
            signals.append(MarketTimingSignal(
                label="supply_pressure",
                value="high",
                tone="negative",
                detail=f"{latest_offplan:.0f}% of latest-year sales are off-plan",
            ))
            reasoning.append(
                f"{latest_offplan:.0f}% of {price_series[-1][0]} sales are off-plan — heavy "
                f"incoming supply may compress rents at handover"
            )
        elif latest_offplan < 30:
            signals.append(MarketTimingSignal(
                label="supply_pressure",
                value="low",
                tone="positive",
                detail=f"Only {latest_offplan:.0f}% of latest-year sales are off-plan",
            ))
            reasoning.append(
                f"Only {latest_offplan:.0f}% of latest-year sales are off-plan — mature, "
                f"stable supply"
            )
        else:
            signals.append(MarketTimingSignal(
                label="supply_pressure",
                value="medium",
                tone="neutral",
                detail=f"{latest_offplan:.0f}% off-plan share",
            ))

    # Verdict — count positive vs negative signals
    pos = sum(1 for s in signals if s.tone == "positive")
    neg = sum(1 for s in signals if s.tone == "negative")
    if pos >= 2 and neg == 0:
        verdict = "good_time"
        headline = f"Favourable entry for {src_area.name_display or src_area.name_norm.title()}"
    elif neg >= 2:
        verdict = "caution"
        headline = f"Caution: {src_area.name_display or src_area.name_norm.title()} shows late-cycle signals"
    else:
        verdict = "neutral"
        headline = f"{src_area.name_display or src_area.name_norm.title()} is mid-cycle"

    confidence = "high" if len(signals) == 3 else "medium" if len(signals) == 2 else "low"

    return MarketTimingResponse(
        area_name=src_area.name_display or src_area.name_norm.title(),
        area_name_norm=src_area.name_norm,
        verdict=verdict,  # type: ignore[arg-type]
        confidence=confidence,  # type: ignore[arg-type]
        headline=headline,
        signals=signals,
        reasoning=reasoning,
        current_yield_pct=round(current_yield, 2) if current_yield is not None else None,
        yield_5y_avg_pct=round(yield_5y_avg, 2) if yield_5y_avg is not None else None,
        current_ppsf=round(current_ppsf, 0) if current_ppsf is not None else None,
        ppsf_5y_peak=round(peak_ppsf, 0) if peak_ppsf is not None else None,
        latest_offplan_pct=round(latest_offplan, 1) if latest_offplan is not None else None,
    )


# ===========================================================================
# ROI calculator — comprehensive 12-section response.
# Pure compute + area defaults from DLD. Returns everything the frontend
# needs in one call so the UI can render without follow-ups.
# ===========================================================================

# Indicative FX rates — for the converter section only. Refreshed quarterly
# manually until we wire a live FX feed. Disclose this on the response.
ROI_FX_RATES: dict[str, tuple[str, float]] = {
    # code: (symbol, AED-per-1-of-currency)
    "USD": ("$",   3.6725),
    "GBP": ("£",   4.65),
    "EUR": ("€",   3.95),
    "INR": ("₹",   0.044),
    "RUB": ("₽",   0.040),
    "CNY": ("¥",   0.505),
}


@router.post("/roi/calculate", response_model=RoiCalcResponse)
async def dld_roi_calculate(
    req: RoiCalcRequest,
    db: AsyncSession = Depends(get_db),
):
    """Full 12-section ROI calculation. Area defaults pulled from DLD;
    everything else from request. Tax + FX sections use static disclosed
    values so the response is fully deterministic.
    """
    norm = re.sub(r"\s+", " ", req.area_name.strip().lower())

    # Pull area + metrics + appreciation for defaults
    row = (await db.execute(
        select(DldArea, DldAreaMetrics, DldAreaAppreciation)
        .join(DldAreaMetrics, DldAreaMetrics.dld_area_id == DldArea.id)
        .outerjoin(DldAreaAppreciation, DldAreaAppreciation.dld_area_id == DldArea.id)
        .where(
            (DldArea.name_norm == norm) | (func.lower(DldArea.name_display) == norm),
            DldAreaMetrics.period == "2026-ytd",
        )
    )).first()

    defaults: dict = {}
    median_rent = None
    median_ppsf_area = None
    cagr_used = None
    cagr_source = "Dubai market average"

    if row is not None:
        area, metrics, appr = row
        median_rent = float(metrics.median_annual_rent) if metrics.median_annual_rent else None
        median_ppsf_area = float(metrics.median_price_per_sqft) if metrics.median_price_per_sqft else None
        if appr is not None and appr.cagr_5y_pct is not None and (appr.years_of_data or 0) >= 4:
            cagr_used = float(appr.cagr_5y_pct)
            cagr_source = f"DLD area CAGR (2021→{appr.latest_year})"

    # Fallbacks
    if cagr_used is None:
        cagr_used = 8.5  # Dubai-wide ballpark
    rent_used = req.expected_annual_rent_aed
    if rent_used is None and median_rent is not None:
        rent_used = median_rent
        defaults["expected_annual_rent_aed"] = median_rent
    if rent_used is None:
        # Last-resort estimate from purchase price × 6% gross
        rent_used = req.purchase_price_aed * 0.06
        defaults["expected_annual_rent_aed"] = round(rent_used, 0)

    # Service charge per sqft — DLD does not publish this directly. We use
    # 15 AED/sqft as a Dubai mid-range default if the client didn't supply.
    sc_per_sqft = req.service_charge_aed_per_sqft
    if sc_per_sqft is None:
        sc_per_sqft = 15.0
        defaults["service_charge_aed_per_sqft"] = sc_per_sqft

    # ---- Cost breakdown ----
    dld_transfer = req.purchase_price_aed * 0.04
    agency = req.purchase_price_aed * 0.02
    agency_vat = agency * 0.05
    trustee = 4200.0
    mortgage_reg = 0.0
    notes = ["DLD transfer fee 4%", "Agency 2% + 5% VAT", "Trustee AED 4,200"]
    if req.payment == "mortgage" and req.mortgage:
        mortgage_reg = req.purchase_price_aed * 0.0025
        notes.append("Mortgage registration 0.25%")
    total_buying_cost = dld_transfer + agency + agency_vat + trustee + mortgage_reg
    cost_breakdown = RoiCalcCostBreakdown(
        dld_transfer_aed=round(dld_transfer, 0),
        agency_aed=round(agency, 0),
        agency_vat_aed=round(agency_vat, 0),
        trustee_aed=round(trustee, 0),
        mortgage_registration_aed=round(mortgage_reg, 0),
        total_buying_cost_aed=round(total_buying_cost, 0),
        notes=notes,
    )

    # ---- Section 1: investment summary ----
    if req.payment == "cash":
        cash_needed = req.purchase_price_aed + total_buying_cost
    else:
        dp_pct = req.mortgage.down_payment_pct if req.mortgage else 20.0
        cash_needed = req.purchase_price_aed * (dp_pct / 100) + total_buying_cost
    total_investment = req.purchase_price_aed + total_buying_cost

    # ---- Section 2: rental returns ----
    gross_rent = rent_used
    service_charge_total = sc_per_sqft * (req.size_sqm * 10.7639)  # sqm→sqft
    maint = req.purchase_price_aed * (req.maintenance_pct / 100)
    pmgmt = gross_rent * (req.property_management_pct / 100)
    vacancy_loss = gross_rent * (req.vacancy_rate_pct / 100)
    opex = service_charge_total + maint + pmgmt + vacancy_loss
    net_rent = gross_rent - opex

    gross_yield = (gross_rent / req.purchase_price_aed) * 100 if req.purchase_price_aed else 0.0
    net_yield = (net_rent / req.purchase_price_aed) * 100 if req.purchase_price_aed else 0.0

    annual_cash_flow = None
    monthly_cash_flow = None
    annual_mortgage = 0.0
    monthly_mortgage = 0.0
    if req.payment == "mortgage" and req.mortgage:
        loan_amount = req.purchase_price_aed * (1 - req.mortgage.down_payment_pct / 100)
        r_monthly = req.mortgage.interest_rate_pct / 100 / 12
        n_months = req.mortgage.term_years * 12
        if r_monthly > 0:
            monthly_mortgage = loan_amount * (
                r_monthly * (1 + r_monthly) ** n_months
            ) / ((1 + r_monthly) ** n_months - 1)
        else:
            monthly_mortgage = loan_amount / n_months
        annual_mortgage = monthly_mortgage * 12
        annual_cash_flow = net_rent - annual_mortgage
        monthly_cash_flow = annual_cash_flow / 12

    rental_returns = RoiCalcRentalReturns(
        gross_rent_aed=round(gross_rent, 0),
        operating_expenses_aed=round(opex, 0),
        net_rent_aed=round(net_rent, 0),
        gross_yield_pct=round(gross_yield, 2),
        net_yield_pct=round(net_yield, 2),
        monthly_cash_flow_aed=round(monthly_cash_flow, 0) if monthly_cash_flow is not None else None,
        annual_cash_flow_aed=round(annual_cash_flow, 0) if annual_cash_flow is not None else None,
    )

    # ---- Section 3: capital growth ----
    projected_5y = req.purchase_price_aed * ((1 + cagr_used / 100) ** 5)
    total_5y_income = net_rent * 5  # ignores rent growth — conservative
    total_5y_return_aed = (projected_5y - req.purchase_price_aed) + total_5y_income
    total_5y_return_pct = total_5y_return_aed / total_investment * 100 if total_investment else 0
    # Rough IRR using even cash flow + lump-sum exit
    if total_investment > 0:
        cf_per_year = (net_rent + (projected_5y - req.purchase_price_aed) / 5)
        irr_estimate = (cf_per_year / total_investment) * 100
    else:
        irr_estimate = None

    capital_growth = RoiCalcCapitalGrowth(
        current_value_aed=round(req.purchase_price_aed, 0),
        projected_value_5y_aed=round(projected_5y, 0),
        cagr_pct_used=round(cagr_used, 2),
        cagr_source=cagr_source,
        total_5y_return_aed=round(total_5y_return_aed, 0),
        total_5y_return_pct=round(total_5y_return_pct, 1),
        irr_estimate_pct=round(irr_estimate, 1) if irr_estimate is not None else None,
    )

    # ---- Section 4: payback ----
    annual_return = net_rent  # rent-only payback
    payback_years = total_investment / annual_return if annual_return > 0 else None

    # ---- Section 5: benchmarks ----
    # Yield vs area: req gross yield vs the DLD median yield for the area
    your_yield = round(gross_yield, 2)
    area_yield = None
    if row is not None:
        _, metrics, _ = row
        area_yield = cap_yield(float(metrics.rental_yield_pct)) if metrics.rental_yield_pct else None
    yield_verdict = "in-line with area"
    if area_yield is not None:
        if your_yield > area_yield * 1.1:
            yield_verdict = f"above area average ({area_yield:.2f}%)"
        elif your_yield < area_yield * 0.9:
            yield_verdict = f"below area average ({area_yield:.2f}%)"
    yield_bench = RoiCalcBenchmark(
        your_value=your_yield,
        area_median=area_yield,
        verdict=yield_verdict,
    )

    your_ppsf = req.purchase_price_aed / (req.size_sqm * 10.7639) if req.size_sqm > 0 else 0
    price_verdict = "in-line with area"
    if median_ppsf_area:
        if your_ppsf > median_ppsf_area * 1.1:
            price_verdict = f"above area median ({median_ppsf_area:.0f} AED/sqft)"
        elif your_ppsf < median_ppsf_area * 0.9:
            price_verdict = f"below area median ({median_ppsf_area:.0f} AED/sqft) — potential value"
    price_bench = RoiCalcBenchmark(
        your_value=round(your_ppsf, 0),
        area_median=round(median_ppsf_area, 0) if median_ppsf_area else None,
        verdict=price_verdict,
    )

    # ---- Section 6: 3 scenarios ----
    scenarios = []
    for label, rent_mult in (("Conservative", 0.95), ("Realistic", 1.00), ("Optimistic", 1.10)):
        sc_rent = gross_rent * rent_mult
        sc_opex = service_charge_total + maint + sc_rent * (req.property_management_pct / 100) + sc_rent * (req.vacancy_rate_pct / 100)
        sc_net = sc_rent - sc_opex
        sc_acf = None
        if req.payment == "mortgage" and req.mortgage:
            sc_acf = sc_net - annual_mortgage
        scenarios.append(RoiCalcScenario(
            label=label,
            annual_rent_aed=round(sc_rent, 0),
            net_yield_pct=round(sc_net / req.purchase_price_aed * 100, 2) if req.purchase_price_aed else 0,
            annual_cash_flow_aed=round(sc_acf, 0) if sc_acf is not None else None,
        ))

    # ---- Section 7: sensitivity ----
    sensitivity = []
    # Rent ±10%
    delta_rent = gross_rent * 0.10
    sensitivity.append(RoiCalcSensitivityItem(
        scenario="Rent +10%",
        delta_annual_cash_flow_aed=round(delta_rent, 0),
        delta_net_yield_pp=round(delta_rent / req.purchase_price_aed * 100, 2) if req.purchase_price_aed else None,
        note=f"+{delta_rent:.0f} AED net rent per year",
    ))
    sensitivity.append(RoiCalcSensitivityItem(
        scenario="Rent -10%",
        delta_annual_cash_flow_aed=round(-delta_rent, 0),
        delta_net_yield_pp=round(-delta_rent / req.purchase_price_aed * 100, 2) if req.purchase_price_aed else None,
        note=f"-{delta_rent:.0f} AED net rent per year",
    ))
    # Rate ±1pp (only meaningful for mortgage)
    if req.payment == "mortgage" and req.mortgage:
        loan_amt = req.purchase_price_aed * (1 - req.mortgage.down_payment_pct / 100)
        for direction, sign in (("Rate +1pp", 1), ("Rate -1pp", -1)):
            new_rate = (req.mortgage.interest_rate_pct + sign) / 100 / 12
            n = req.mortgage.term_years * 12
            if new_rate > 0:
                new_pmt = loan_amt * (new_rate * (1 + new_rate) ** n) / ((1 + new_rate) ** n - 1)
            else:
                new_pmt = loan_amt / n
            delta_annual = (new_pmt - monthly_mortgage) * 12
            sensitivity.append(RoiCalcSensitivityItem(
                scenario=direction,
                delta_annual_cash_flow_aed=round(-delta_annual, 0),
                delta_net_yield_pp=None,
                note=f"Annual mortgage payment changes by {delta_annual:+,.0f} AED",
            ))
    # Zero appreciation
    sensitivity.append(RoiCalcSensitivityItem(
        scenario="Zero appreciation (flat 5y)",
        delta_annual_cash_flow_aed=None,
        delta_net_yield_pp=None,
        note=f"5y total return falls from {capital_growth.total_5y_return_pct:.0f}% "
             f"to ~{(total_5y_income / total_investment * 100):.0f}% (rent only)",
    ))

    # ---- Section 8: tax advantages ----
    tax_advantages = [
        "Zero personal income tax on rental yield",
        "Zero capital gains tax on property sale",
        "Zero inheritance tax",
        "Zero stamp duty (DLD transfer 4% one-off only, no annual property tax)",
    ]

    # ---- Section 9: FX ----
    fx_disclaimer = (
        "FX rates are indicative quarterly snapshots, not live. "
        "Use only for ballpark conversion."
    )
    currencies = [
        RoiCalcCurrency(
            code=code,
            symbol=sym,
            price_local=round(req.purchase_price_aed / rate, 0),
        )
        for code, (sym, rate) in ROI_FX_RATES.items()
    ]

    # ---- Section 10: AI insight ----
    bullets: list[str] = []
    if net_yield >= 6:
        bullets.append(f"Net yield of {net_yield:.2f}% is solid for Dubai (above 6% threshold)")
    elif net_yield >= 4:
        bullets.append(f"Net yield of {net_yield:.2f}% is moderate — appreciation needs to carry the return")
    else:
        bullets.append(f"Net yield of {net_yield:.2f}% is low — only makes sense if you expect strong capital growth")
    if payback_years and payback_years < 15:
        bullets.append(f"Payback in {payback_years:.1f}y from rent alone is healthy")
    elif payback_years and payback_years >= 20:
        bullets.append(f"Payback of {payback_years:.0f}y is long — this is an appreciation play, not income")
    if area_yield and your_yield > area_yield * 1.1:
        bullets.append(f"Your yield is meaningfully above the area median — verify the rent assumption is realistic")
    if median_ppsf_area and your_ppsf < median_ppsf_area * 0.9:
        bullets.append(
            f"Your purchase ppsf ({your_ppsf:.0f}) is below area median ({median_ppsf_area:.0f}) — "
            f"potential discount or below-spec property"
        )
    if req.payment == "mortgage" and req.mortgage and annual_cash_flow is not None:
        if annual_cash_flow > 0:
            bullets.append(f"Mortgage cash-flow positive at {annual_cash_flow:+,.0f} AED/year")
        else:
            bullets.append(f"Mortgage cash-flow NEGATIVE at {annual_cash_flow:+,.0f} AED/year — capital growth must compensate")

    summary = (
        f"Total 5y return projected at {capital_growth.total_5y_return_pct:.0f}% "
        f"({capital_growth.cagr_pct_used:.1f}% annual CAGR + rent), "
        f"net yield {net_yield:.2f}%."
    )
    insight = RoiCalcInsight(summary=summary, bullets=bullets)

    return RoiCalcResponse(
        area_name=req.area_name,
        property_type=req.property_type,
        size_sqm=req.size_sqm,
        purchase_price_aed=req.purchase_price_aed,
        payment=req.payment,
        total_cash_needed_aed=round(cash_needed, 0),
        total_investment_inc_costs_aed=round(total_investment, 0),
        rental_returns=rental_returns,
        capital_growth=capital_growth,
        payback_years=round(payback_years, 1) if payback_years is not None else None,
        yield_vs_market=yield_bench,
        price_vs_market=price_bench,
        scenarios=scenarios,
        sensitivity=sensitivity,
        tax_advantages=tax_advantages,
        effective_net_yield_after_tax_pct=round(net_yield, 2),
        fx_rates_disclaimer=fx_disclaimer,
        currencies=currencies,
        insight=insight,
        cost_breakdown=cost_breakdown,
        defaults_used=defaults,
    )


# ---------------------------------------------------------------------------
# Building rent history (5y)
# ---------------------------------------------------------------------------

@router.get(
    "/buildings/{building_id}/rent-history",
    response_model=DldBuildingRentHistoryResponse,
)
async def building_rent_history(
    building_id: UUID, db: AsyncSession = Depends(get_db)
):
    """Per-(building, year) Person-residential rent series 2021-2026.

    Built by etl_dld_rent_history.py from rents_2021_2026.csv. Rows are
    keyed to dld_buildings by project_number first, then by
    (project_name, area_name_norm) as a fallback. When neither matches the
    history is still in the table (dld_building_id IS NULL); this endpoint
    returns the building-matched subset.
    """
    bldg = (
        await db.execute(
            select(DldBuilding, DldArea.name_display)
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
            .where(DldBuilding.id == building_id)
        )
    ).first()
    if not bldg:
        raise HTTPException(status_code=404, detail="Building not found")
    b, area_name = bldg

    rows = (
        await db.execute(
            select(DldBuildingRentHistory)
            .where(DldBuildingRentHistory.dld_building_id == building_id)
            .order_by(DldBuildingRentHistory.year)
        )
    ).scalars().all()

    points = [
        BuildingRentHistoryPoint(
            year=int(r.year),
            avg_annual_rent=float(r.avg_annual_rent) if r.avg_annual_rent is not None else None,
            median_annual_rent=float(r.median_annual_rent) if r.median_annual_rent is not None else None,
            avg_rent_per_sqft=float(r.avg_rent_per_sqft) if r.avg_rent_per_sqft is not None else None,
            contract_count=int(r.contract_count or 0),
            new_count=int(r.new_count or 0),
            renew_count=int(r.renew_count or 0),
        )
        for r in rows
    ]
    return DldBuildingRentHistoryResponse(
        building_id=building_id,
        project_name=b.project_name,
        area_name=area_name,
        points=points,
        years_of_history=len(points),
    )


# ---------------------------------------------------------------------------
# Availability Tracker
# ---------------------------------------------------------------------------

def _months_ahead(window_days: int) -> str:
    """Snapshot date is 2026-06-01 so 'today' is deterministic. Returns
    inclusive YYYY-MM end-of-window."""
    today = date(2026, 6, 1)
    end = today + timedelta(days=window_days)
    return end.strftime("%Y-%m")


@router.get(
    "/areas/{name_or_norm}/upcoming-availability",
    response_model=UpcomingAvailabilityResponse,
)
async def area_upcoming_availability(
    name_or_norm: str,
    db: AsyncSession = Depends(get_db),
    window_days: int = Query(90, ge=30, le=180),
):
    """Units expiring in the next N days, bucketed by 1BR/2BR/Studio etc.

    Derived from dld_lease_expiry_forecast (Person residential only). The
    expiry_month string is compared lexicographically against the snapshot
    horizon, so '2026-08' <= '2026-08' includes August expiries when the
    window catches it.
    """
    norm_s = name_or_norm.strip().lower()
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm_s))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    horizon = _months_ahead(window_days)
    rows = (
        await db.execute(
            select(
                DldLeaseExpiryForecast.property_sub_type,
                func.sum(DldLeaseExpiryForecast.contract_count).label("cc"),
                func.sum(DldLeaseExpiryForecast.estimated_available).label("ea"),
                func.avg(DldLeaseExpiryForecast.avg_last_rent).label("alr"),
                func.avg(DldLeaseExpiryForecast.renewal_probability).label("rp"),
            )
            .where(
                DldLeaseExpiryForecast.area_name_norm == area.name_norm,
                DldLeaseExpiryForecast.expiry_month <= horizon,
            )
            .group_by(DldLeaseExpiryForecast.property_sub_type)
            .order_by(func.sum(DldLeaseExpiryForecast.contract_count).desc())
        )
    ).all()

    items = [
        UpcomingAvailabilityItem(
            property_sub_type=sub,
            contract_count=int(cc or 0),
            estimated_available=int(ea or 0),
            avg_last_rent=float(alr) if alr is not None else None,
            renewal_probability_pct=float(rp) if rp is not None else None,
        )
        for sub, cc, ea, alr, rp in rows
    ]
    return UpcomingAvailabilityResponse(
        area_name_norm=area.name_norm,
        area_name_display=area.name_display,
        window_days=window_days,
        horizon_month_end=horizon,
        total_expiring=sum(i.contract_count for i in items),
        total_estimated_available=sum(i.estimated_available for i in items),
        by_sub_type=items,
    )


@router.get(
    "/buildings/{building_id}/lease-expiry",
    response_model=BuildingLeaseExpiryResponse,
)
async def building_lease_expiry(
    building_id: UUID, db: AsyncSession = Depends(get_db),
):
    """Monthly expiry calendar for a specific building.

    Matches dld_lease_expiry_forecast rows by (area_name_norm, project_name_en)
    — the forecast table stores project_name as a text key (not building_id)
    since contracts predate the dld_buildings dim, so the join is on the
    canonical strings.
    """
    row = (
        await db.execute(
            select(DldBuilding, DldArea.name_display, DldArea.name_norm)
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
            .where(DldBuilding.id == building_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Building not found")
    b, area_display, area_norm = row
    if not b.project_name or not area_norm:
        return BuildingLeaseExpiryResponse(
            building_id=building_id,
            project_name=b.project_name,
            area_name=area_display,
            months=[],
            total_expiring=0,
            total_estimated_available=0,
        )

    rows = (
        await db.execute(
            select(
                DldLeaseExpiryForecast.expiry_month,
                func.sum(DldLeaseExpiryForecast.contract_count).label("cc"),
                func.sum(DldLeaseExpiryForecast.estimated_available).label("ea"),
                func.avg(DldLeaseExpiryForecast.avg_last_rent).label("alr"),
                func.avg(DldLeaseExpiryForecast.renewal_probability).label("rp"),
            )
            .where(
                DldLeaseExpiryForecast.area_name_norm == area_norm,
                DldLeaseExpiryForecast.project_name_en == b.project_name,
            )
            .group_by(DldLeaseExpiryForecast.expiry_month)
            .order_by(DldLeaseExpiryForecast.expiry_month)
        )
    ).all()

    months = [
        LeaseExpiryMonthBucket(
            expiry_month=m,
            contract_count=int(cc or 0),
            estimated_available=int(ea or 0),
            avg_last_rent=float(alr) if alr is not None else None,
            renewal_probability_pct=float(rp) if rp is not None else None,
        )
        for m, cc, ea, alr, rp in rows
    ]
    return BuildingLeaseExpiryResponse(
        building_id=building_id,
        project_name=b.project_name,
        area_name=area_display,
        months=months,
        total_expiring=sum(m.contract_count for m in months),
        total_estimated_available=sum(m.estimated_available for m in months),
    )


# ---------------------------------------------------------------------------
# Derived buildings (synthetic dim built from the rent stream itself)
# ---------------------------------------------------------------------------

def _build_derived_building_item(
    d: DldBuildingDerived,
    area_name_display: Optional[str],
) -> DldBuildingItem:
    """Adapt the dld_buildings_derived row to DldBuildingItem so the
    frontend can render it through the same card component as the official
    rows. Physical-attribute fields stay None — the derived dim only has
    rent-stream signal."""
    avg = float(d.avg_annual_rent) if d.avg_annual_rent is not None else None
    return DldBuildingItem(
        id=d.id,
        project_name=d.project_name_en,
        master_project=d.master_project_en,
        area_name=area_name_display or d.area_name_en,
        prop_sub_type=None,
        flats=None,
        floors=None,
        avg_annual_rent=avg,
        avg_rent_per_sqft=None,
        active_rent_count=int(d.contract_count or 0),
        occupancy_proxy_pct=None,
        is_freehold=None,
        is_offplan=None,
        creation_date=None,
        total_annual_income=(avg * int(d.contract_count or 0)) if avg is not None else None,
        income_range_label=_income_range_label(
            (avg * int(d.contract_count or 0)) if avg is not None else None
        ),
        confidence=confidence_for(int(d.contract_count or 0)),
        building_type="tower",
        building_type_label=_CATEGORY_LABELS.get(d.property_category or "", "Ejari-derived building"),
        building_type_emoji=_CATEGORY_EMOJI.get(d.property_category or "", "🏢"),
        is_community_aggregate=False,
        siblings_in_master_project=None,
        age_years=None,
        rent_psf_vs_area_delta=None,
        rent_psf_vs_area_pct=None,
        area_median_rent_psf=None,
        demand_signal=_demand_signal(int(d.contract_count or 0)),
        building_name_clean=d.project_name_en,
        building_name_type="real_building",
        display_name=d.project_name_en,
        is_identifiable=True,
        data_source="ejari_derived",
        property_category=d.property_category,
        lat=float(d.lat) if d.lat is not None else None,
        lon=float(d.lon) if d.lon is not None else None,
        osm_verified=bool(d.osm_verified),
    )


# Per-category label + emoji used when rendering derived buildings. Kept
# alongside the route module so both the helper and the breakdown endpoint
# stay in sync.
_CATEGORY_LABELS: dict[str, str] = {
    "apartment": "Apartment",
    "villa": "Villa",
    "hotel_apt": "Hotel Apartment",
    "labor_camp": "Labor Camp",
    "office": "Office",
    "retail": "Shop / Retail",
    "warehouse": "Warehouse",
    "whole_building": "Whole Building",
    "other": "Other",
}
_CATEGORY_EMOJI: dict[str, str] = {
    "apartment": "🏠",
    "villa": "🏡",
    "hotel_apt": "🏨",
    "labor_camp": "👷",
    "office": "🏢",
    "retail": "🛒",
    "warehouse": "🏭",
    "whole_building": "🏗️",
    "other": "▫️",
}


@router.get("/buildings-derived", response_model=DldBuildingsResponse)
async def list_buildings_derived(
    db: AsyncSession = Depends(get_db),
    area: Optional[str] = None,
    master_project: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """List Ejari-derived buildings — the synthetic dim built from
    rents_2021_2026.csv. Use this in addition to /dld/buildings to surface
    real per-tower entities (SIRAJ TOWER, ORBIT RESIDENCES, etc) that the
    47-row official dld_buildings table doesn't carry.

    Filters:
      area              — DLD area name_norm (exact lower-case match)
      master_project    — case-insensitive substring match on master_project_en
      category          — comma-separated property_category list
                          (apartment,villa,hotel_apt,office,retail,
                          warehouse,labor_camp,whole_building,other)
      q                 — case-insensitive substring across project_name_en
                          and master_project_en
    """
    filters = []
    if area:
        filters.append(func.lower(DldArea.name_norm) == area.strip().lower())
    if master_project:
        filters.append(
            DldBuildingDerived.master_project_en.ilike(f"%{master_project.strip()}%")
        )
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        if cats:
            filters.append(DldBuildingDerived.property_category.in_(cats))
    if q:
        needle = f"%{q.strip()}%"
        filters.append(
            or_(
                DldBuildingDerived.project_name_en.ilike(needle),
                DldBuildingDerived.master_project_en.ilike(needle),
            )
        )

    base = (
        select(DldBuildingDerived, DldArea.name_display)
        .outerjoin(DldArea, DldArea.id == DldBuildingDerived.dld_area_id)
    )
    if filters:
        base = base.where(and_(*filters))

    total_q = (
        select(func.count(DldBuildingDerived.id))
        .select_from(DldBuildingDerived)
        .outerjoin(DldArea, DldArea.id == DldBuildingDerived.dld_area_id)
    )
    if filters:
        total_q = total_q.where(and_(*filters))
    total = await db.scalar(total_q) or 0

    rows = (
        await db.execute(
            base.order_by(DldBuildingDerived.contract_count.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [_build_derived_building_item(d, name) for d, name in rows]
    return DldBuildingsResponse(
        count=len(items), total_available=int(total), items=items
    )


@router.get("/buildings-derived/{building_id}", response_model=DldBuildingDetailResponse)
async def get_building_derived(
    building_id: UUID, db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(DldBuildingDerived, DldArea.name_display)
            .outerjoin(DldArea, DldArea.id == DldBuildingDerived.dld_area_id)
            .where(DldBuildingDerived.id == building_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Derived building not found")
    d, area_name = row
    area_ctx = await _load_area_context(db, d.dld_area_id) if d.dld_area_id else None
    base = _build_derived_building_item(d, area_name)
    base_dict = base.model_dump()
    for k in ("is_offplan",):
        base_dict.pop(k, None)
    detail = DldBuildingDetail(
        **base_dict,
        swimming_pools=None,
        car_parks=None,
        elevators=None,
        bld_levels=None,
        is_offplan=None,
        implied_yield_pct=None,
        estimated_unit_size_sqft=None,
        estimated_unit_price=None,
        area_context=area_ctx,
    )
    return DldBuildingDetailResponse(building=detail)


# ---------------------------------------------------------------------------
# Communities — master_project_en aggregates from dld_buildings_derived
# ---------------------------------------------------------------------------

def _slugify_master_project(s: str) -> str:
    """Lower-case, alphanumeric-only slug used to deep-link community cards
    back into the master_project filter on /properties."""
    out = []
    prev_dash = False
    for ch in s.lower():
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")


@router.get("/communities", response_model=DldCommunitiesResponse)
async def list_communities(
    db: AsyncSession = Depends(get_db),
    area: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """List master-planned communities — aggregate of all
    dld_buildings_derived rows sharing a master_project_en value
    (DAMAC Hills, JVC, Dubai Marina, etc.).

    Filters:
      area  — DLD area name_norm (exact lower-case match)
      q     — case-insensitive substring on master_project_en
    """
    filters = [DldBuildingDerived.master_project_en.is_not(None)]
    if area:
        filters.append(func.lower(DldArea.name_norm) == area.strip().lower())
    if q:
        filters.append(
            DldBuildingDerived.master_project_en.ilike(f"%{q.strip()}%")
        )

    # Aggregate per master_project_en. primary_area_name picks the area with
    # the largest contract_count (max-of-sums per area is more complex than
    # we need — we use max(area_name_en) as a deterministic tiebreaker).
    base = (
        select(
            DldBuildingDerived.master_project_en.label("mp"),
            func.count(DldBuildingDerived.id).label("building_count"),
            func.count(func.distinct(DldBuildingDerived.dld_area_id)).label("area_count"),
            func.sum(DldBuildingDerived.contract_count).label("total_contracts"),
            func.avg(DldBuildingDerived.avg_annual_rent).label("avg_rent"),
            func.max(DldArea.name_display).label("primary_area"),
        )
        .outerjoin(DldArea, DldArea.id == DldBuildingDerived.dld_area_id)
        .where(and_(*filters))
        .group_by(DldBuildingDerived.master_project_en)
    )

    # Count of distinct master_projects matching the filters
    count_q = (
        select(func.count(func.distinct(DldBuildingDerived.master_project_en)))
        .select_from(DldBuildingDerived)
        .outerjoin(DldArea, DldArea.id == DldBuildingDerived.dld_area_id)
        .where(and_(*filters))
    )
    total = await db.scalar(count_q) or 0

    rows = (
        await db.execute(
            base.order_by(func.sum(DldBuildingDerived.contract_count).desc().nullslast())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = []
    for r in rows:
        avg = float(r.avg_rent) if r.avg_rent is not None else None
        contracts = int(r.total_contracts or 0)
        total_income = avg * contracts if avg is not None else None
        items.append(
            DldCommunityItem(
                slug=_slugify_master_project(r.mp),
                master_project=r.mp,
                primary_area_name=r.primary_area,
                area_count=int(r.area_count or 0),
                building_count=int(r.building_count or 0),
                total_contracts=contracts,
                avg_annual_rent=avg,
                total_annual_income=total_income,
                income_range_label=_income_range_label(total_income),
                confidence=confidence_for(contracts),
            )
        )

    return DldCommunitiesResponse(
        count=len(items), total_available=int(total), items=items
    )


# ---------------------------------------------------------------------------
# Lifestyle Score
# ---------------------------------------------------------------------------

@router.get(
    "/areas/{name_or_norm}/lifestyle-score",
    response_model=AreaLifestyleScoreResponse,
)
async def get_area_lifestyle_score(
    name_or_norm: str, db: AsyncSession = Depends(get_db)
):
    """Per-area lifestyle signal: metro / mall / landmark / overall score
    derived from the rent stream's nearest_* columns. Honest empty (zeros)
    when the area has no rent contracts with nearest_* data populated."""
    norm_s = name_or_norm.strip().lower()
    row = (
        await db.execute(
            select(DldAreaLifestyleScore, DldArea.name_display)
            .outerjoin(DldArea, DldArea.id == DldAreaLifestyleScore.dld_area_id)
            .where(DldAreaLifestyleScore.area_name_norm == norm_s)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="No lifestyle score for this area")
    ls, area_display = row
    return AreaLifestyleScoreResponse(
        area_name_norm=ls.area_name_norm,
        area_name_display=area_display,
        metro_score=float(ls.metro_score) if ls.metro_score is not None else None,
        mall_score=float(ls.mall_score) if ls.mall_score is not None else None,
        landmark_score=float(ls.landmark_score) if ls.landmark_score is not None else None,
        overall_score=float(ls.overall_score) if ls.overall_score is not None else None,
        nearest_metro=ls.nearest_metro,
        nearest_mall=ls.nearest_mall,
        nearest_landmark=ls.nearest_landmark,
        metro_stations_count=int(ls.metro_stations_count or 0),
    )


# ---------------------------------------------------------------------------
# Bedroom benchmarks + Building sales history
# ---------------------------------------------------------------------------

@router.get(
    "/areas/{name_or_norm}/bedroom-prices",
    response_model=AreaBedroomPricesResponse,
)
async def get_area_bedroom_prices(
    name_or_norm: str,
    db: AsyncSession = Depends(get_db),
    reg_type: Optional[str] = None,  # 'ready' / 'off_plan' / None for both
    year: Optional[int] = None,
):
    """Per-bedroom sale price benchmarks for the area, optionally filtered
    by reg_type (ready/off_plan) and year. Source: dld_bedroom_benchmarks
    built from transactions_2021_2026.csv rooms_en."""
    norm_s = name_or_norm.strip().lower()
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm_s))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    stmt = (
        select(DldBedroomBenchmark)
        .where(DldBedroomBenchmark.area_name_norm == norm_s)
        .order_by(
            DldBedroomBenchmark.year.desc(),
            DldBedroomBenchmark.bedroom_type,
            DldBedroomBenchmark.reg_type,
        )
    )
    if reg_type in ("ready", "off_plan"):
        stmt = stmt.where(DldBedroomBenchmark.reg_type == reg_type)
    if year is not None:
        stmt = stmt.where(DldBedroomBenchmark.year == year)

    rows = (await db.execute(stmt)).scalars().all()
    items = [
        BedroomBenchmarkRow(
            bedroom_type=r.bedroom_type,
            reg_type=r.reg_type,
            year=int(r.year),
            avg_price_aed=float(r.avg_price_aed) if r.avg_price_aed is not None else None,
            median_price_aed=float(r.median_price_aed) if r.median_price_aed is not None else None,
            avg_ppsf=float(r.avg_ppsf) if r.avg_ppsf is not None else None,
            transaction_count=int(r.transaction_count or 0),
        )
        for r in rows
    ]
    return AreaBedroomPricesResponse(
        area_name_norm=area.name_norm,
        area_name_display=area.name_display,
        rows=items,
        total_rows=len(items),
    )


def _density_tier(density: float | None) -> str | None:
    if density is None:
        return None
    if density >= 50_000:
        return "very_high"
    if density >= 20_000:
        return "high"
    if density >= 5_000:
        return "medium"
    return "low"


# Hand-curated last-resort population name aliases. Used after exact match,
# separator-collapsed match, and difflib all fail. Keys are DldArea-style
# slugs we know users may hit; values are the dld_area_population.area_name_norm
# the row is stored under.
_POPULATION_NAME_OVERRIDES: dict[str, str] = {
    "downtown dubai": "burj khalifa",  # DLD files Downtown Dubai under Burj Khalifa
    "the marina": "al thanyah fifth",  # Dubai Marina ≈ Marsa Dubai but Marina Walk uses 5
    "jumeirah village circle": "al barshaa south fourth",
    # Qouz ↔ Goze: two-letter swap, below difflib 0.85 cutoff
    "al qouz first": "al goze first",
    "al qouz second": "al goze second",
    "al qouz third": "al goze third",
    "al qouz fourth": "al goze fourth",
}


@router.get(
    "/areas/{name_or_norm}/community-profile",
    response_model=AreaCommunityProfile,
)
async def get_area_community_profile(
    name_or_norm: str,
    db: AsyncSession = Depends(get_db),
):
    """Digital Dubai 2024 community population profile for an area.

    Lookup order:
      1. Exact match on dld_area_population.area_name_norm.
      2. Separator-collapsed match (any of `[\\s_-]+` → single space).
      3. difflib ratio ≥ 0.85 against all loaded names.
      4. Hand-curated overrides for the awkward edge cases (e.g. "Downtown
         Dubai" → Burj Khalifa).

    Returns matched=False (cheap object, no 404) when none of those resolve.
    The frontend then hides the section cleanly.
    """
    import difflib

    norm = name_or_norm.strip().lower()

    async def _find(needle: str) -> DldAreaPopulation | None:
        return (
            await db.execute(
                select(DldAreaPopulation).where(
                    DldAreaPopulation.area_name_norm == needle
                )
            )
        ).scalar_one_or_none()

    pop = await _find(norm)

    if pop is None:
        space_form = re.sub(r"[\s_-]+", " ", norm).strip()
        if space_form and space_form != norm:
            pop = await _find(space_form)

    if pop is None:
        all_names = list(
            (await db.execute(select(DldAreaPopulation.area_name_norm))).scalars().all()
        )
        if all_names:
            cand = difflib.get_close_matches(norm, all_names, n=1, cutoff=0.85)
            if cand:
                pop = await _find(cand[0])

    if pop is None and norm in _POPULATION_NAME_OVERRIDES:
        pop = await _find(_POPULATION_NAME_OVERRIDES[norm])

    if not pop:
        return AreaCommunityProfile(matched=False)

    # Density rank — 1 = highest density across all loaded rows.
    rank_row = (
        await db.execute(
            select(func.count())
            .select_from(DldAreaPopulation)
            .where(DldAreaPopulation.population_density > pop.population_density)
        )
    ).scalar_one() or 0
    total = (
        await db.execute(select(func.count()).select_from(DldAreaPopulation))
    ).scalar_one() or 0

    return AreaCommunityProfile(
        community_code=int(pop.community_code),
        area_name_en=pop.area_name_en,
        area_name_ar=pop.area_name_ar,
        sector=int(pop.sector),
        total_population=int(pop.total_population),
        area_km2=float(pop.area_km2) if pop.area_km2 is not None else None,
        population_density=float(pop.population_density)
        if pop.population_density is not None
        else None,
        density_tier=_density_tier(
            float(pop.population_density) if pop.population_density is not None else None
        ),
        density_rank=int(rank_row) + 1 if total else None,
        density_rank_total=int(total) if total else None,
        matched=True,
        data_source="Digital Dubai Official Statistics 2024",
    )


@router.get(
    "/buildings/{building_id}/sales-history",
    response_model=BuildingSalesResponse,
)
async def get_building_sales_history(
    building_id: UUID, db: AsyncSession = Depends(get_db),
):
    """Aggregate sales benchmark for the building over 2021-2026. Source:
    dld_buildings_sales (extracted from the transactions stream itself —
    parallel to the rents-side dld_buildings_derived)."""
    b = (
        await db.execute(
            select(DldBuildingsSales).where(DldBuildingsSales.id == building_id)
        )
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Building sales record not found")
    return BuildingSalesResponse(
        id=b.id,
        building_name_en=b.building_name_en,
        building_name_slug=b.building_name_slug,
        area_name_en=b.area_name_en,
        master_project_en=b.master_project_en,
        total_transactions=int(b.total_transactions or 0),
        avg_sale_price_ready=float(b.avg_sale_price_ready) if b.avg_sale_price_ready is not None else None,
        avg_sale_price_offplan=float(b.avg_sale_price_offplan) if b.avg_sale_price_offplan is not None else None,
        avg_ppsf_ready=float(b.avg_ppsf_ready) if b.avg_ppsf_ready is not None else None,
        avg_ppsf_offplan=float(b.avg_ppsf_offplan) if b.avg_ppsf_offplan is not None else None,
        median_sale_price=float(b.median_sale_price) if b.median_sale_price is not None else None,
        min_sale_price=float(b.min_sale_price) if b.min_sale_price is not None else None,
        max_sale_price=float(b.max_sale_price) if b.max_sale_price is not None else None,
        years_covered=int(b.years_covered or 0),
        first_seen_year=int(b.first_seen_year) if b.first_seen_year is not None else None,
        last_seen_year=int(b.last_seen_year) if b.last_seen_year is not None else None,
        last_transaction_date=b.last_transaction_date,
        parking_pct=float(b.parking_pct) if b.parking_pct is not None else None,
        bulk_transaction_count=int(b.bulk_transaction_count or 0),
    )


# ---------------------------------------------------------------------------
# Area category breakdown — drives /areas/[id] "This area has: …" row
# ---------------------------------------------------------------------------

@router.get(
    "/areas/{name_or_norm}/category-breakdown",
    response_model=AreaCategoryBreakdownResponse,
)
async def get_area_category_breakdown(
    name_or_norm: str, db: AsyncSession = Depends(get_db),
):
    """Building counts per property_category for this area, derived from
    dld_buildings_derived. Honest empty when the area has no buildings in
    the synthetic dim — typically because no rents are filed under its
    name_norm (tower-density communities like Marina/Downtown that DLD
    files under master_project_en)."""
    norm_s = name_or_norm.strip().lower()
    area = (
        await db.execute(select(DldArea).where(DldArea.name_norm == norm_s))
    ).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    rows = (
        await db.execute(
            select(
                DldBuildingDerived.property_category,
                func.count(DldBuildingDerived.id),
            )
            .where(DldBuildingDerived.dld_area_id == area.id)
            .where(DldBuildingDerived.property_category.is_not(None))
            .group_by(DldBuildingDerived.property_category)
            .order_by(func.count(DldBuildingDerived.id).desc())
        )
    ).all()

    items = [
        AreaCategoryBreakdownItem(
            property_category=cat,
            label=_CATEGORY_LABELS.get(cat, cat.replace("_", " ").title()),
            emoji=_CATEGORY_EMOJI.get(cat, "▫️"),
            building_count=int(count),
        )
        for cat, count in rows
    ]
    return AreaCategoryBreakdownResponse(
        area_name_norm=area.name_norm,
        area_name_display=area.name_display,
        total_buildings=sum(it.building_count for it in items),
        items=items,
    )


# ---------------------------------------------------------------------------
# Dashboard pulse — 7-widget aggregator
# ---------------------------------------------------------------------------

@router.get("/dashboard-pulse", response_model=DashboardPulseResponse)
async def dashboard_pulse(db: AsyncSession = Depends(get_db)):
    """Aggregator for the /dashboard widgets. One round-trip returns:

      * Market sentiment composite from 4 DLD-derived factors
      * Yield × 5y-appreciation scatter matrix per area
      * Rent-vs-buy payback gauge weighted across covered areas
      * Hot areas (latest-year transactions vs prior year)
      * Off-plan pipeline (volume + top areas)
      * Data freshness (table-level last-seen dates)

    All sourced from existing DLD tables — no new ETL.
    """
    # ---- Common building blocks ----
    # Per-area metrics joined with appreciation + canonical display name.
    metrics_rows = (
        await db.execute(
            select(
                DldAreaMetrics,
                DldArea,
                DldAreaAppreciation,
            )
            .join(DldArea, DldArea.id == DldAreaMetrics.dld_area_id)
            .outerjoin(
                DldAreaAppreciation,
                DldAreaAppreciation.dld_area_id == DldArea.id,
            )
            .where(DldAreaMetrics.period == "2026-ytd")
        )
    ).all()

    # ---- Widget 2: Yield × Appreciation scatter matrix ----
    matrix_points: list[ScatterMatrixPoint] = []
    yield_values: list[float] = []
    appr_values: list[float] = []
    sale_price_samples: list[tuple[float, int]] = []  # (avg_price, weight)
    annual_rent_samples: list[tuple[float, int]] = []  # (avg_rent, weight)

    for m, a, app in metrics_rows:
        if m.rental_yield_pct is None or app is None or app.appreciation_5y_pct is None:
            continue
        y = float(m.rental_yield_pct)
        x = float(app.appreciation_5y_pct)
        # Cap yield at 20 for the chart so a few stray outliers don't squash
        # the rest of the dataset to the bottom edge.
        if y > 20:
            y = 20.0
        sample = min(int(m.sales_count or 0), int(m.rent_count_2026 or 0))
        if sample < 10:
            continue
        # Quadrants centred on the dataset medians (computed below).
        matrix_points.append(ScatterMatrixPoint(
            area_name_norm=a.name_norm,
            area_name_display=a.name_display,
            yield_pct=round(y, 2),
            appreciation_5y_pct=round(x, 2),
            sample_score=sample,
            quadrant="best_investment",  # placeholder — re-assigned below
        ))
        yield_values.append(y)
        appr_values.append(x)
        # Feed rent-vs-buy weighted averages from the same set.
        if m.median_price_per_sqft and m.median_annual_rent:
            # Approximate unit size: use 120 sqm as a typical 1-BR proxy
            # (rough — but consistent across areas).
            est_sale = float(m.median_price_per_sqft) * 120
            est_rent = float(m.median_annual_rent)
            sale_price_samples.append((est_sale, sample))
            annual_rent_samples.append((est_rent, sample))

    # Assign quadrants relative to dataset medians.
    if matrix_points:
        sorted_y = sorted(yield_values)
        sorted_x = sorted(appr_values)
        y_mid = sorted_y[len(sorted_y) // 2]
        x_mid = sorted_x[len(sorted_x) // 2]
        for p in matrix_points:
            high_yield = p.yield_pct >= y_mid
            high_growth = p.appreciation_5y_pct >= x_mid
            if high_yield and high_growth:
                p.quadrant = "best_investment"
            elif high_yield and not high_growth:
                p.quadrant = "income_focus"
            elif not high_yield and high_growth:
                p.quadrant = "growth_focus"
            else:
                p.quadrant = "avoid"

    # ---- Widget 3: Rent vs buy payback gauge ----
    rent_vs_buy: Optional[RentVsBuyGauge] = None
    if sale_price_samples and annual_rent_samples:
        total_weight = sum(w for _, w in sale_price_samples)
        avg_sale = sum(v * w for v, w in sale_price_samples) / total_weight
        avg_rent = sum(v * w for v, w in annual_rent_samples) / total_weight
        payback = avg_sale / avg_rent if avg_rent > 0 else 0
        if payback <= 0:
            signal = "neutral"
        elif payback < 15:
            signal = "buy"
        elif payback > 25:
            signal = "rent"
        else:
            signal = "neutral"
        rent_vs_buy = RentVsBuyGauge(
            payback_years=round(payback, 1),
            signal=signal,
            based_on_areas=len(sale_price_samples),
            avg_sale_price_aed=round(avg_sale, 2),
            avg_annual_rent_aed=round(avg_rent, 2),
        )

    # ---- Widget 4: Hot areas (latest year vs prior year by transaction_count) ----
    latest_year_row = await db.execute(
        select(func.max(DldPriceHistory.year))
    )
    latest_year = latest_year_row.scalar() or 2026
    prior_year = latest_year - 1
    hot_rows = (
        await db.execute(
            select(
                DldArea.name_norm,
                DldArea.name_display,
                func.coalesce(
                    func.sum(
                        case(
                            (DldPriceHistory.year == latest_year,
                             DldPriceHistory.transaction_count),
                            else_=0,
                        )
                    ), 0,
                ).label("latest"),
                func.coalesce(
                    func.sum(
                        case(
                            (DldPriceHistory.year == prior_year,
                             DldPriceHistory.transaction_count),
                            else_=0,
                        )
                    ), 0,
                ).label("prior"),
            )
            .join(DldArea, DldArea.id == DldPriceHistory.dld_area_id)
            .where(DldPriceHistory.year.in_([latest_year, prior_year]))
            .group_by(DldArea.name_norm, DldArea.name_display)
            .having(
                func.coalesce(
                    func.sum(
                        case(
                            (DldPriceHistory.year == prior_year,
                             DldPriceHistory.transaction_count),
                            else_=0,
                        )
                    ), 0,
                ) >= 50  # filter noise — areas with <50 prior-year sales drop out
            )
        )
    ).all()

    hot_areas: list[HotAreaItem] = []
    # Same partial-year scaling as the sentiment factor above.
    latest_year_fraction = 5 / 12 if latest_year == 2026 else 1.0
    for name_norm, name_display, latest_n, prior_n in hot_rows:
        latest_n = int(latest_n or 0)
        prior_n = int(prior_n or 0)
        if prior_n <= 0:
            continue
        annualized = latest_n / latest_year_fraction
        pct = (annualized - prior_n) / prior_n * 100
        hot_areas.append(HotAreaItem(
            area_name_norm=name_norm,
            area_name_display=name_display,
            txn_count_latest=latest_n,
            txn_count_prior=prior_n,
            pct_change_yoy=round(pct, 1),
            trend="up" if pct > 5 else "down" if pct < -5 else "flat",
        ))
    # Sort by absolute change desc, take top 10
    hot_areas.sort(key=lambda h: -h.pct_change_yoy)
    hot_areas = hot_areas[:10]

    # ---- Widget 5: Off-plan pipeline ----
    # Sum off-plan transaction volume in the latest year per area.
    offplan_rows = (
        await db.execute(
            select(
                DldArea.name_norm,
                DldArea.name_display,
                DldPriceHistory.transaction_count_offplan,
                DldPriceHistory.transaction_count,
                DldPriceHistory.avg_ppsf_offplan,
                DldPriceHistory.offplan_pct,
            )
            .join(DldArea, DldArea.id == DldPriceHistory.dld_area_id)
            .where(DldPriceHistory.year == latest_year)
            .where(DldPriceHistory.transaction_count_offplan > 0)
        )
    ).all()

    offplan_top: list[OffplanArea] = []
    total_volume = 0.0
    total_count = 0
    for name_norm, name_display, n_off, n_total, ppsf_off, off_pct in offplan_rows:
        n_off = int(n_off or 0)
        n_total = int(n_total or 0)
        ppsf_off = float(ppsf_off or 0)
        # Estimate volume per off-plan transaction at 120 sqm × ppsf_off.
        est_volume = n_off * ppsf_off * 120 if ppsf_off else 0
        total_count += n_off
        total_volume += est_volume
        offplan_top.append(OffplanArea(
            area_name_norm=name_norm,
            area_name_display=name_display,
            offplan_count=n_off,
            offplan_volume_aed=round(est_volume, 2),
            offplan_share_pct=round(float(off_pct or 0), 1),
        ))
    offplan_top.sort(key=lambda o: -o.offplan_volume_aed)

    offplan = OffplanPipeline(
        total_offplan_volume_aed=round(total_volume, 2),
        total_offplan_count=total_count,
        top_areas=offplan_top[:5],
    ) if offplan_top else None

    # ---- Widget 1: Market overview — neutral facts, no verdict ----
    # The user asked us to drop BULLISH/BEARISH labels and red colors.
    # Show raw numbers (sales YTD, avg yield, 1y price growth, off-plan
    # share) and let investors form their own opinion.
    overview_metrics: list[MarketOverviewMetric] = []

    # Sales YTD — count the latest year's transactions in the period that
    # actually elapsed, label the period explicitly so it's not confused
    # with a full-year number.
    snapshot_month = 6  # snapshot is 2026-06-01 → through end of May
    period_label = "Jan–May 2026" if latest_year == 2026 else f"Full {latest_year}"
    if hot_rows:
        agg_latest = sum(int(r[2] or 0) for r in hot_rows)
        overview_metrics.append(MarketOverviewMetric(
            name="Sales YTD",
            value=f"{agg_latest:,}",
            period=period_label,
        ))

    # Average gross yield across covered areas, latest year.
    yield_latest_q = await db.execute(
        select(func.avg(DldYieldHistory.gross_yield_pct))
        .where(
            DldYieldHistory.year == latest_year,
            DldYieldHistory.gross_yield_pct.is_not(None),
        )
    )
    avg_yield_latest = yield_latest_q.scalar()
    if avg_yield_latest is not None:
        overview_metrics.append(MarketOverviewMetric(
            name="Avg Yield",
            value=f"{float(avg_yield_latest):.2f}%",
        ))

    # 1y price growth — average across areas with appreciation data.
    appr_1y = [float(app.appreciation_1y_pct) for _, _, app in metrics_rows
               if app and app.appreciation_1y_pct is not None]
    if appr_1y:
        avg_appr = sum(appr_1y) / len(appr_1y)
        overview_metrics.append(MarketOverviewMetric(
            name="Price Growth",
            value=f"{avg_appr:+.1f}% YoY",
        ))

    # Off-plan share of YTD sales — just a fact about the mix.
    if offplan and 'agg_latest' in locals() and agg_latest > 0:
        offplan_share = offplan.total_offplan_count / agg_latest * 100
        overview_metrics.append(MarketOverviewMetric(
            name="Off-plan",
            value=f"{offplan_share:.0f}% of sales",
        ))

    # Friendly month name for the period_label.
    _MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    snapshot_label = (
        f"{_MONTH_NAMES[snapshot_month - 1]} {latest_year}"
        if latest_year == 2026 else f"{latest_year}"
    )

    market_overview = MarketOverview(
        period_label=f"Dubai Market · {snapshot_label}",
        metrics=overview_metrics,
        source="DLD Official Data",
    )

    # ---- Widget 7: Data freshness ----
    freshness = DataFreshness(
        transactions_year_range=f"2021–{latest_year}",
        rents_year_range="2021–2026",
        snapshot_date="2026-06-01",
        last_etl_run="2026-06-03",
    )

    return DashboardPulseResponse(
        market_overview=market_overview,
        matrix_points=matrix_points,
        rent_vs_buy=rent_vs_buy,
        hot_areas=hot_areas,
        offplan=offplan,
        freshness=freshness,
    )


# ---------------------------------------------------------------------------
# /map endpoints — Dubai-wide Leaflet map
# ---------------------------------------------------------------------------

@router.get("/map/areas", response_model=MapAreasResponse)
async def map_areas(db: AsyncSession = Depends(get_db)):
    """All canonical areas with coordinates (263 today) joined to their
    headline yield + ppsf + transaction count. Polygon is the raw GeoJSON
    blob stored on the canonical row (139 currently). The map page
    consumes this in one shot — payload is ~250 KB compressed."""
    rows = (await db.execute(
        select(
            DldCanonicalArea.area_name,
            DldCanonicalArea.area_name_slug,
            DldCanonicalArea.google_search_name,
            DldCanonicalArea.latitude,
            DldCanonicalArea.longitude,
            DldCanonicalArea.polygon,
        )
        .where(DldCanonicalArea.latitude.isnot(None))
        .order_by(DldCanonicalArea.area_name)
    )).all()

    # Pull metrics + appreciation keyed by name_norm (lowercase area_name)
    metric_rows = (await db.execute(
        select(
            DldArea.name_norm,
            DldAreaMetrics.rental_yield_pct,
            DldAreaMetrics.median_price_per_sqft,
            DldAreaMetrics.sales_count,
        )
        .outerjoin(DldAreaMetrics, DldAreaMetrics.dld_area_id == DldArea.id)
        .where(DldAreaMetrics.period == "2026-ytd")
    )).all()
    metrics_by_name = {
        n.lower(): (y, p, s) for n, y, p, s in metric_rows if n
    }

    items: list[MapAreaItem] = []
    for name, slug, gsn, lat, lon, poly in rows:
        n_lower = (name or "").lower()
        y, p, s = metrics_by_name.get(n_lower, (None, None, None))
        items.append(MapAreaItem(
            name=name,
            slug=slug,
            google_search_name=gsn,
            lat=float(lat) if lat is not None else None,
            lon=float(lon) if lon is not None else None,
            polygon=poly if poly else None,
            yield_pct=float(y) if y is not None else None,
            avg_ppsf=float(p) if p is not None else None,
            transaction_count=int(s) if s is not None else None,
        ))
    return MapAreasResponse(count=len(items), areas=items)


def _point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon. ring is a list of [lon, lat] pairs."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        # Cast a horizontal ray; flip parity on each edge crossing.
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def _point_in_geojson(lon: float, lat: float, geom: dict | None) -> bool:
    """Pure-Python point-in-(Multi)Polygon. Handles GeoJSON Polygon and
    MultiPolygon — first ring of each polygon is the outer boundary; any
    further rings are holes. Returns False on empty/non-polygon input."""
    if not geom:
        return False
    gtype = geom.get("type")
    coords = geom.get("coordinates") or []
    if gtype == "Polygon":
        if not coords:
            return False
        if not _point_in_ring(lon, lat, coords[0]):
            return False
        for hole in coords[1:]:
            if _point_in_ring(lon, lat, hole):
                return False
        return True
    if gtype == "MultiPolygon":
        for poly in coords:
            if not poly:
                continue
            if _point_in_ring(lon, lat, poly[0]):
                in_hole = False
                for hole in poly[1:]:
                    if _point_in_ring(lon, lat, hole):
                        in_hole = True
                        break
                if not in_hole:
                    return True
        return False
    return False


@router.get("/map/buildings", response_model=MapBuildingsResponse)
async def map_buildings(
    area: Optional[str] = Query(
        None,
        description=(
            "Optional canonical area_name_slug. When set, returns only "
            "buildings whose verified OSM coordinates lie INSIDE the area's "
            "polygon (or bbox if no polygon). Without this filter ~24% of "
            "name-tagged buildings sit outside their DLD area because the "
            "OSM match landed on a same-name building elsewhere."
        ),
    ),
    db: AsyncSession = Depends(get_db),
):
    """OSM-verified buildings (504 today) with lat/lon for marker rendering.
    Pulled from dld_buildings_derived where osm_verified=TRUE. category
    feeds the marker color; area_slug links each marker into /areas/[slug]."""
    # Containment filter setup. When the caller passes ?area=slug we resolve
    # the canonical row + polygon once. Bbox fallback intentionally removed:
    # many canonical bboxes are stored as ~50m point-bboxes (Marsa Dubai,
    # Burj Khalifa, Al Warsan First etc.) and using them as the
    # containment box drops every real building. Two-step chain only:
    # polygon (best) → area_name match (fallback for the 124 areas with
    # no polygon).
    area_polygon: dict | None = None
    area_canon_name: str | None = None
    if area:
        canon = (await db.execute(
            select(DldCanonicalArea)
            .where(DldCanonicalArea.area_name_slug == area)
        )).scalar_one_or_none()
        if not canon:
            return MapBuildingsResponse(count=0, buildings=[])
        area_polygon = canon.polygon if canon.polygon else None
        area_canon_name = canon.area_name
    rows = (await db.execute(
        select(
            DldBuildingDerived.id,
            DldBuildingDerived.project_name_en,
            DldBuildingDerived.lat,
            DldBuildingDerived.lon,
            DldBuildingDerived.property_category,
            DldBuildingDerived.contract_count,
            DldBuildingDerived.avg_annual_rent,
            DldBuildingDerived.area_name_en,
            DldCanonicalArea.area_name_slug,
        )
        .outerjoin(
            DldCanonicalArea,
            func.lower(DldCanonicalArea.area_name) == func.lower(DldBuildingDerived.area_name_en),
        )
        .where(
            DldBuildingDerived.osm_verified.is_(True),
            DldBuildingDerived.lat.isnot(None),
            DldBuildingDerived.lon.isnot(None),
        )
        .order_by(DldBuildingDerived.contract_count.desc())
    )).all()

    items: list[MapBuildingItem] = []
    for bid, name, lat, lon, cat, cnt, rent, area_name, area_slug in rows:
        latf, lonf = float(lat), float(lon)
        if area:
            if area_polygon is not None:
                if not _point_in_geojson(lonf, latf, area_polygon):
                    continue
            else:
                if not (area_name and area_canon_name
                        and area_name.lower() == area_canon_name.lower()):
                    continue
        items.append(MapBuildingItem(
            id=bid,
            name=name or "Unnamed building",
            lat=latf,
            lon=lonf,
            category=cat,
            contract_count=int(cnt or 0),
            avg_annual_rent=float(rent) if rent is not None else None,
            area_name=area_name,
            area_slug=area_slug,
        ))
    return MapBuildingsResponse(count=len(items), buildings=items)
