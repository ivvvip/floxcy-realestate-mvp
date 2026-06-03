"""Areas API endpoints."""
import re
from uuid import UUID
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.dld import DldArea, DldAreaLandSummary, DldAreaMetrics, DldCanonicalArea
from app.models.market_snapshot import MarketSnapshot
from app.schemas.area import (
    AreaResponse,
    AreaCoverageItem,
    AreaCoverageResponse,
    AreaCoverageStats,
    AreaLimitedDetail,
    AreaStatsResponse,
    AreaDetailResponse,
    AreaDldBlock,
    AreaLatestSnapshot,
    AreaSnapshotPoint,
    AreaListItem,
)
from app.schemas.dld import MIN_RELIABLE_SAMPLES, cap_yield, confidence_for
from app.services.confidence import build_confidence_report, confidence_to_dict


def _coverage_tier(
    is_curated: bool,
    has_snapshot: bool,
    sales: int,
    rents: int,
) -> str:
    """Classify each area for the coverage screener and limited-data badges."""
    if is_curated and has_snapshot:
        return "full"
    total = sales + rents
    if total >= 100:
        return "partial"
    if total > 0:
        return "limited"
    return "none"


def _parse_uuid(s: str) -> Optional[UUID]:
    try:
        return UUID(s)
    except (ValueError, AttributeError):
        return None

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


@router.get("/all", response_model=AreaCoverageResponse)
async def list_all_areas(
    db: AsyncSession = Depends(get_db),
    area_type: Optional[str] = Query(None, description="residential | commercial | mixed"),
    sort_by: str = Query(
        "rent_count",
        description="rent_count | investment_score | yield | name",
    ),
    min_samples: int = Query(0, ge=0, description="Filter areas with sales+rents below this"),
    coverage_tier: Optional[str] = Query(None, description="full | partial | limited | none"),
    canonical_only: bool = Query(
        True,
        description="Filter to areas present in the dld_canonical_areas "
                    "registry (default true; cuts 362 → 284 and hides "
                    "orphan single-snapshot areas).",
    ),
):
    """Universal 362-area screener — every DLD area plus curated extras.

    Returns rows tagged with `coverage_tier` so the frontend can render
    'Limited data' / 'Data coming soon' badges without faking metrics.
    Sort + filter happen in Python because the dataset is small (≤500 rows)
    and the curated-vs-DLD merge would otherwise need a UNION ALL.
    """
    # 1. Pull all DLD areas + their 2026-ytd metrics + their curated link
    dld_rows = (
        await db.execute(
            select(DldArea, DldAreaMetrics, Area)
            .outerjoin(
                DldAreaMetrics,
                and_(
                    DldAreaMetrics.dld_area_id == DldArea.id,
                    DldAreaMetrics.period == "2026-ytd",
                ),
            )
            .outerjoin(Area, Area.id == DldArea.curated_area_id)
        )
    ).all()

    # 2. Pull the latest MarketSnapshot per curated area (so we know which
    #    curated areas have snapshot history — drives the 'full' tier)
    latest_date_subq = (
        select(
            MarketSnapshot.area_id,
            func.max(MarketSnapshot.snapshot_date).label("latest_date"),
        )
        .group_by(MarketSnapshot.area_id)
        .subquery()
    )
    snap_rows = (
        await db.execute(
            select(Area, MarketSnapshot)
            .join(MarketSnapshot, MarketSnapshot.area_id == Area.id)
            .join(
                latest_date_subq,
                (latest_date_subq.c.area_id == MarketSnapshot.area_id)
                & (latest_date_subq.c.latest_date == MarketSnapshot.snapshot_date),
            )
        )
    ).all()
    snaps_by_area = {a.id: s for a, s in snap_rows}
    seen_curated_ids: set[UUID] = set()

    items: List[AreaCoverageItem] = []

    # 3. Build a row per DLD area (one row per area; merge curated when linked)
    for dld, metrics, area in dld_rows:
        sales = int(metrics.sales_count or 0) if metrics else 0
        rents = int(metrics.rent_count_2026 or 0) if metrics else 0
        snap = snaps_by_area.get(area.id) if area else None
        if area:
            seen_curated_ids.add(area.id)
        tier = _coverage_tier(
            is_curated=area is not None,
            has_snapshot=snap is not None,
            sales=sales,
            rents=rents,
        )
        median_ppsf = (
            float(metrics.median_price_per_sqft)
            if metrics and metrics.median_price_per_sqft is not None
            else (float(snap.avg_price_per_sqft) if snap else None)
        )
        show_yield = None
        if (metrics and metrics.rental_yield_pct is not None
                and sales >= MIN_RELIABLE_SAMPLES
                and rents >= MIN_RELIABLE_SAMPLES):
            show_yield = cap_yield(float(metrics.rental_yield_pct))
        elif snap and snap.rental_yield is not None:
            show_yield = float(snap.rental_yield)
        items.append(AreaCoverageItem(
            id=area.id if area else dld.id,
            slug=str(area.id) if area else dld.name_norm,
            name=area.name if area else dld.name_display,
            name_arabic=area.name_arabic if area else None,
            area_type=area.area_type if area else "residential",
            coverage_tier=tier,
            is_curated=area is not None,
            median_price_per_sqft=median_ppsf,
            rental_yield_pct=show_yield,
            rent_growth_yoy_pct=(
                float(metrics.rent_growth_yoy_pct)
                if metrics and metrics.rent_growth_yoy_pct is not None
                else None
            ),
            sales_count=sales,
            rent_count_2026=rents,
            investment_score=float(snap.investment_score) if snap and snap.investment_score else None,
            appreciation_1y=float(snap.appreciation_1y) if snap and snap.appreciation_1y else None,
        ))

    # 4. Catch any curated areas that have no DLD link (rare but possible)
    curated_orphans = (
        await db.execute(
            select(Area).where(~Area.id.in_(seen_curated_ids))
        )
    ).scalars().all() if seen_curated_ids else (
        await db.execute(select(Area))
    ).scalars().all()
    for area in curated_orphans:
        snap = snaps_by_area.get(area.id)
        tier = _coverage_tier(
            is_curated=True, has_snapshot=snap is not None, sales=0, rents=0
        )
        items.append(AreaCoverageItem(
            id=area.id,
            slug=str(area.id),
            name=area.name,
            name_arabic=area.name_arabic,
            area_type=area.area_type,
            coverage_tier=tier,
            is_curated=True,
            median_price_per_sqft=float(snap.avg_price_per_sqft) if snap else None,
            rental_yield_pct=float(snap.rental_yield) if snap and snap.rental_yield is not None else None,
            investment_score=float(snap.investment_score) if snap and snap.investment_score else None,
            appreciation_1y=float(snap.appreciation_1y) if snap and snap.appreciation_1y else None,
        ))

    # 5. Filter + sort in Python
    if area_type:
        items = [i for i in items if i.area_type == area_type]
    if coverage_tier:
        items = [i for i in items if i.coverage_tier == coverage_tier]
    if min_samples > 0:
        items = [i for i in items if (i.sales_count + i.rent_count_2026) >= min_samples]
    if canonical_only:
        # Pull the canonical universe once and intersect by name
        canon_names = {
            n.upper()
            for (n,) in (
                await db.execute(select(DldCanonicalArea.area_name_upper))
            ).all()
        }
        items = [i for i in items if i.name.upper() in canon_names]

    def _sort_key(it: AreaCoverageItem):
        # Always push 'none' tier to the bottom; sort within by the chosen key
        tier_rank = {"full": 0, "partial": 1, "limited": 2, "none": 3}.get(it.coverage_tier, 4)
        if sort_by == "investment_score":
            return (tier_rank, -(it.investment_score or 0))
        if sort_by == "yield":
            return (tier_rank, -(it.rental_yield_pct or 0))
        if sort_by == "name":
            return (tier_rank, it.name.lower())
        # default: rent_count desc (proxy for volume)
        return (tier_rank, -(it.rent_count_2026 + it.sales_count))

    items.sort(key=_sort_key)

    counts: dict[str, int] = {}
    for it in items:
        counts[it.coverage_tier] = counts.get(it.coverage_tier, 0) + 1

    return AreaCoverageResponse(total=len(items), counts=counts, items=items)


@router.get("/coverage-stats", response_model=AreaCoverageStats)
async def coverage_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate coverage health — used by the admin coverage panel.

    Counts are reported against the canonical universe (default 284) — the
    visible 'Dubai areas' figure across the product. The Admin panel can
    cross-reference with dld_areas (362) via the difference if needed.
    """
    # Quick counts that don't need to load every row
    total_curated = await db.scalar(select(func.count()).select_from(Area)) or 0
    total_dld = await db.scalar(select(func.count()).select_from(DldArea)) or 0
    samples = await db.execute(
        select(
            func.coalesce(func.sum(DldAreaMetrics.sales_count), 0),
            func.coalesce(func.sum(DldAreaMetrics.rent_count_2026), 0),
        ).where(DldAreaMetrics.period == "2026-ytd")
    )
    total_sales, total_rents = samples.one()

    # Reuse the universal lister with canonical_only=true so the tier
    # counts match what the frontend renders by default.
    coverage = await list_all_areas(
        db=db,
        area_type=None,
        sort_by="rent_count",
        min_samples=0,
        coverage_tier=None,
        canonical_only=True,
    )

    gaps = [
        it.name for it in coverage.items
        if it.coverage_tier == "none" and not it.is_curated
    ]
    gaps.sort()
    # Distinct DLD-only areas
    dld_only = sum(1 for it in coverage.items if not it.is_curated)

    return AreaCoverageStats(
        total_areas=coverage.total,
        curated_count=int(total_curated),
        dld_only_count=dld_only,
        by_tier=coverage.counts,
        samples_total_sales=int(total_sales),
        samples_total_rents=int(total_rents),
        area_gaps=gaps[:200],  # cap at 200 — admin panel doesn't need a full dump
    )


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


@router.get("/{slug}", response_model=Union[AreaDetailResponse, AreaLimitedDetail])
async def get_area(slug: str, db: AsyncSession = Depends(get_db)):
    """Get area detail, accepting either a curated UUID or a DLD name_norm.

    Resolution order:
      1. Slug parses as UUID and matches `areas.id` → full detail with
         MarketSnapshot history + DLD overlay (unchanged behaviour).
      2. Slug parses as UUID and matches `dld_areas.id` → limited detail
         from DLD only.
      3. Slug is a string → look up DLD by name_norm → limited detail.
      4. None of the above → 404.
    """
    maybe_uuid = _parse_uuid(slug)
    area: Optional[Area] = None
    if maybe_uuid:
        area = (await db.execute(select(Area).where(Area.id == maybe_uuid))).scalar_one_or_none()

    if not area:
        # Try DLD area lookup (by UUID first, then by name_norm)
        dld_area = None
        if maybe_uuid:
            dld_area = (await db.execute(
                select(DldArea).where(DldArea.id == maybe_uuid)
            )).scalar_one_or_none()
        if not dld_area:
            # name_norm is stored with spaces (e.g. "business bay"). Accept
            # any reasonable URL slug form: hyphens, underscores, %20-decoded
            # spaces, mixed separators, double-hyphens. Resolution order:
            #   1. Exact name_norm match
            #   2. Canonical hyphen-slug → name_norm
            #   3. Space-normalised name_norm (any separator → space)
            norm_raw = slug.strip().lower()
            dld_area = (await db.execute(
                select(DldArea).where(DldArea.name_norm == norm_raw)
            )).scalar_one_or_none()

            if not dld_area:
                # Canonical hyphen slug (e.g. "wadi-al-safa-5")
                slug_form = re.sub(r"[\s_]+", "-", norm_raw)
                slug_form = re.sub(r"-+", "-", slug_form).strip("-")
                if slug_form and slug_form != norm_raw:
                    canon = (await db.execute(
                        select(DldCanonicalArea)
                        .where(DldCanonicalArea.area_name_slug == slug_form)
                    )).scalar_one_or_none()
                    if canon:
                        dld_area = (await db.execute(
                            select(DldArea).where(
                                DldArea.name_norm == canon.area_name.lower()
                            )
                        )).scalar_one_or_none()

            if not dld_area:
                # Final fallback: any separator → single space
                space_form = re.sub(r"[-_\s]+", " ", norm_raw).strip()
                if space_form and space_form != norm_raw:
                    dld_area = (await db.execute(
                        select(DldArea).where(DldArea.name_norm == space_form)
                    )).scalar_one_or_none()
        if not dld_area:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Area '{slug}' not found",
            )

        # If this DLD area IS linked to a curated area, recurse into the curated branch
        if dld_area.curated_area_id:
            area = (await db.execute(
                select(Area).where(Area.id == dld_area.curated_area_id)
            )).scalar_one_or_none()

        if not area:
            # Return the limited-data payload — DLD metrics only
            metrics = (await db.execute(
                select(DldAreaMetrics).where(
                    DldAreaMetrics.dld_area_id == dld_area.id,
                    DldAreaMetrics.period == "2026-ytd",
                )
            )).scalar_one_or_none()
            sales = int(metrics.sales_count or 0) if metrics else 0
            rents = int(metrics.rent_count_2026 or 0) if metrics else 0
            show_yield = None
            if (metrics and metrics.rental_yield_pct is not None
                    and sales >= MIN_RELIABLE_SAMPLES
                    and rents >= MIN_RELIABLE_SAMPLES):
                show_yield = cap_yield(float(metrics.rental_yield_pct))
            dld_block = AreaDldBlock(
                dld_area_id=dld_area.id,
                dld_name=dld_area.name_display,
                median_price_per_sqft=float(metrics.median_price_per_sqft) if metrics and metrics.median_price_per_sqft is not None else None,
                median_annual_rent=float(metrics.median_annual_rent) if metrics and metrics.median_annual_rent is not None else None,
                median_rent_per_sqft=float(metrics.median_rent_per_sqft) if metrics and metrics.median_rent_per_sqft is not None else None,
                avg_price_per_sqft=float(metrics.avg_price_per_sqft) if metrics and metrics.avg_price_per_sqft is not None else None,
                avg_annual_rent=float(metrics.avg_annual_rent) if metrics and metrics.avg_annual_rent is not None else None,
                avg_rent_per_sqft=float(metrics.avg_rent_per_sqft) if metrics and metrics.avg_rent_per_sqft is not None else None,
                rental_yield_pct=show_yield,
                rent_growth_yoy_pct=float(metrics.rent_growth_yoy_pct) if metrics and metrics.rent_growth_yoy_pct is not None else None,
                sales_count=sales,
                rent_count_2026=rents,
                building_count=dld_area.building_count,
                confidence=confidence_for(max(sales, rents)),
            )
            tier = _coverage_tier(False, False, sales, rents)
            return AreaLimitedDetail(
                id=dld_area.id,
                slug=dld_area.name_norm,
                name=dld_area.name_display,
                coverage_tier=tier,
                dld=dld_block,
            )

    area_id = area.id

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

    # DLD overlay (matched by dld_areas.curated_area_id, 2026-ytd period)
    dld_row = (
        await db.execute(
            select(DldArea, DldAreaMetrics)
            .outerjoin(
                DldAreaMetrics,
                (DldAreaMetrics.dld_area_id == DldArea.id)
                & (DldAreaMetrics.period == "2026-ytd"),
            )
            .where(DldArea.curated_area_id == area_id)
        )
    ).first()

    dld_block = None
    if dld_row:
        dld_area, dm = dld_row
        sales = dm.sales_count if dm else 0
        rents = dm.rent_count_2026 if dm else 0
        show_yield = None
        if (dm and dm.rental_yield_pct is not None
                and sales >= MIN_RELIABLE_SAMPLES
                and rents >= MIN_RELIABLE_SAMPLES):
            show_yield = cap_yield(float(dm.rental_yield_pct))
        # Land-summary overlay (freehold_pct, land_type_mix, etc) — from
        # dld_area_land_summary keyed by name_norm.
        land = (
            await db.execute(
                select(DldAreaLandSummary).where(
                    DldAreaLandSummary.area_name_norm == dld_area.name_norm
                )
            )
        ).scalar_one_or_none()
        dld_block = AreaDldBlock(
            dld_area_id=dld_area.id,
            dld_name=dld_area.name_display,
            median_price_per_sqft=float(dm.median_price_per_sqft) if dm and dm.median_price_per_sqft is not None else None,
            median_annual_rent=float(dm.median_annual_rent) if dm and dm.median_annual_rent is not None else None,
            median_rent_per_sqft=float(dm.median_rent_per_sqft) if dm and dm.median_rent_per_sqft is not None else None,
            avg_price_per_sqft=float(dm.avg_price_per_sqft) if dm and dm.avg_price_per_sqft is not None else None,
            avg_annual_rent=float(dm.avg_annual_rent) if dm and dm.avg_annual_rent is not None else None,
            avg_rent_per_sqft=float(dm.avg_rent_per_sqft) if dm and dm.avg_rent_per_sqft is not None else None,
            rental_yield_pct=show_yield,
            rent_growth_yoy_pct=float(dm.rent_growth_yoy_pct) if dm and dm.rent_growth_yoy_pct is not None else None,
            sales_count=sales,
            rent_count_2026=rents,
            building_count=dld_area.building_count,
            confidence=confidence_for(max(sales, rents)),
            freehold_pct=float(land.freehold_pct) if land and land.freehold_pct is not None else None,
            registered_pct=float(land.registered_pct) if land and land.registered_pct is not None else None,
            total_parcels=int(land.total_parcels) if land else None,
            land_type_mix=dict(land.land_type_mix) if land and land.land_type_mix else None,
        )

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
        dld=dld_block,
    )
