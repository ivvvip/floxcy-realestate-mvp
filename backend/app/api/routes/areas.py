"""Areas API endpoints."""
import re
from datetime import date
from statistics import median
from uuid import UUID
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.dld import (
    DldArea,
    DldAreaAppreciation,
    DldAreaLandSummary,
    DldAreaMetrics,
    DldCanonicalArea,
    DldPriceHistory,
    DldYieldHistory,
)
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
from app.data.dld_area_aliases import cadastral_data_norm


def _history_norm(*names: Optional[str]) -> Optional[str]:
    """Resolve the cadastral name_norm that holds an area's multi-year history.

    Tries each candidate name in order (display/community name first, then the
    DLD snapshot name); returns the cadastral twin for the first one that has a
    marketing→cadastral alias. Returns None when no alias applies — i.e. the
    area already carries its own history under its own name, so behaviour is
    unchanged. See FLOXCY-REPLAN-2026.md Phase 2.
    """
    for raw in names:
        if not raw:
            continue
        n = raw.strip().lower()
        cad = cadastral_data_norm(n)
        if cad != n:
            return cad
    return None


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
    payload now scores from the real DLD universe (Phase 1, World B retired).
    """
    from app.api.routes.opportunities import (
        _load_universe_dld,
        _score_all_dld,
        _resolve_dld_area_id,
    )
    from app.services.opportunity_engine import attach_nearby, report_to_dict

    inputs = await _load_universe_dld(db)
    target_id = await _resolve_dld_area_id(db, area_id)
    if target_id is None:
        raise HTTPException(status_code=404, detail="Area not found")
    reports = _score_all_dld(inputs)
    attach_nearby(reports, {i.area_id: i for i in inputs}, k=3)
    target = next((r for r in reports if r.area_id == target_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="No DLD data for area")
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

    # String slug → curated Area by name (e.g. "downtown-dubai" → "Downtown
    # Dubai", "dubai-hills-estate" → "Dubai Hills Estate"). These marketing
    # areas have no DldArea/canonical row under that exact name, so without this
    # they 404; resolving here routes them into the curated branch, which
    # attaches the cadastral DLD twin via _history_norm. FLOXCY-REPLAN-2026 P2.
    if not area and not maybe_uuid:
        slug_form = re.sub(r"[\s_-]+", "-", slug.strip().lower()).strip("-")
        if slug_form:
            area = (await db.execute(
                select(Area).where(
                    func.regexp_replace(
                        func.lower(Area.name), r"[\s_-]+", "-", "g"
                    ) == slug_form
                )
            )).scalar_one_or_none()

    if not area:
        # Try DLD area lookup (by UUID first, then by name_norm)
        dld_area = None
        if maybe_uuid:
            dld_area = (await db.execute(
                select(DldArea).where(DldArea.id == maybe_uuid)
            )).scalar_one_or_none()
        # Try every reasonable spelling of the slug against DldArea (the
        # current snapshot table). When that fully misses, we fall back to
        # DldCanonicalArea (the historical union of all 3 CSVs) so legitimate
        # area names from 2021–2024 history still render instead of 404'ing.
        canon: Optional[DldCanonicalArea] = None
        if not dld_area:
            norm_raw = slug.strip().lower()
            slug_form = re.sub(r"[\s_-]+", "-", norm_raw).strip("-")
            space_form = re.sub(r"[\s_-]+", " ", norm_raw).strip()

            # 1) Exact name_norm match
            dld_area = (await db.execute(
                select(DldArea).where(DldArea.name_norm == norm_raw)
            )).scalar_one_or_none()

            # 2) Canonical hyphen slug → look up canonical, then try to map
            #    its area_name back to a DldArea row via regex-normalised
            #    comparison on BOTH sides (handles "Al-Bastakiyah" → DldArea
            #    "al bastakiyah" if a snapshot row exists).
            if not dld_area and slug_form:
                canon = (await db.execute(
                    select(DldCanonicalArea)
                    .where(DldCanonicalArea.area_name_slug == slug_form)
                )).scalar_one_or_none()
                if canon:
                    canon_norm = canon.area_name.lower()
                    dld_area = (await db.execute(
                        select(DldArea).where(
                            DldArea.name_norm == canon_norm
                        )
                    )).scalar_one_or_none()
                    if not dld_area:
                        canon_slug_form = re.sub(r"[\s_-]+", "-", canon_norm).strip("-")
                        dld_area = (await db.execute(
                            select(DldArea).where(
                                func.regexp_replace(
                                    func.lower(DldArea.name_norm),
                                    r"[\s_-]+", "-", "g",
                                ) == canon_slug_form
                            )
                        )).scalar_one_or_none()

            # 3) Any-separator-to-space DldArea match
            if not dld_area and space_form and space_form != norm_raw:
                dld_area = (await db.execute(
                    select(DldArea).where(DldArea.name_norm == space_form)
                )).scalar_one_or_none()

            # 4) Regex-normalised DldArea match (handles embedded hyphens)
            if not dld_area and slug_form:
                dld_area = (await db.execute(
                    select(DldArea).where(
                        func.regexp_replace(
                            func.lower(DldArea.name_norm),
                            r"[\s_-]+", "-", "g",
                        ) == slug_form
                    )
                )).scalar_one_or_none()

        # Canonical-only fallback: the area is in the historical canonical
        # roster but has no current snapshot row. Render a deeply-limited
        # detail page rather than a 404.
        if not dld_area:
            if canon is None:
                norm_raw = slug.strip().lower()
                slug_form = re.sub(r"[\s_-]+", "-", norm_raw).strip("-")
                if slug_form:
                    canon = (await db.execute(
                        select(DldCanonicalArea)
                        .where(DldCanonicalArea.area_name_slug == slug_form)
                    )).scalar_one_or_none()
            if canon:
                return AreaLimitedDetail(
                    id=canon.id,
                    slug=canon.area_name_slug,
                    name=canon.area_name,
                    coverage_tier="none",
                    dld=AreaDldBlock(
                        dld_area_id=None,
                        dld_name=canon.area_name,
                        sales_count=0,
                        rent_count_2026=0,
                        building_count=0,
                        confidence="low",
                    ),
                )

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
                history_name_norm=_history_norm(dld_area.name_norm),
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
    # `latest` (KPI strip) + `history` (chart) are built from real DLD after
    # the DLD block is resolved below (World B / market_snapshots retired).
    latest: Optional[AreaLatestSnapshot] = None
    history: List[AreaSnapshotPoint] = []

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
            history_name_norm=_history_norm(area.name, dld_area.name_norm),
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

    # Fallback: curated area with NO linked DLD snapshot row (e.g. Downtown
    # Dubai, Dubai Hills Estate, Damac Hills 2). Resolve the cadastral twin
    # that actually holds the data so the page shows the DLD overlay + history
    # instead of an empty section. Display name stays the curated area.name.
    if dld_block is None:
        cad = _history_norm(area.name)
        cad_area = (
            await db.execute(select(DldArea).where(DldArea.name_norm == cad))
        ).scalar_one_or_none() if cad else None
        if cad_area:
            cdm = (
                await db.execute(
                    select(DldAreaMetrics).where(
                        DldAreaMetrics.dld_area_id == cad_area.id,
                        DldAreaMetrics.period == "2026-ytd",
                    )
                )
            ).scalar_one_or_none()
            c_sales = int(cdm.sales_count or 0) if cdm else 0
            c_rents = int(cdm.rent_count_2026 or 0) if cdm else 0
            c_show_yield = None
            if (cdm and cdm.rental_yield_pct is not None
                    and c_sales >= MIN_RELIABLE_SAMPLES
                    and c_rents >= MIN_RELIABLE_SAMPLES):
                c_show_yield = cap_yield(float(cdm.rental_yield_pct))
            c_land = (
                await db.execute(
                    select(DldAreaLandSummary).where(
                        DldAreaLandSummary.area_name_norm == cad_area.name_norm
                    )
                )
            ).scalar_one_or_none()
            dld_block = AreaDldBlock(
                dld_area_id=cad_area.id,
                dld_name=cad_area.name_display,
                history_name_norm=cad_area.name_norm,
                median_price_per_sqft=float(cdm.median_price_per_sqft) if cdm and cdm.median_price_per_sqft is not None else None,
                median_annual_rent=float(cdm.median_annual_rent) if cdm and cdm.median_annual_rent is not None else None,
                median_rent_per_sqft=float(cdm.median_rent_per_sqft) if cdm and cdm.median_rent_per_sqft is not None else None,
                avg_price_per_sqft=float(cdm.avg_price_per_sqft) if cdm and cdm.avg_price_per_sqft is not None else None,
                avg_annual_rent=float(cdm.avg_annual_rent) if cdm and cdm.avg_annual_rent is not None else None,
                avg_rent_per_sqft=float(cdm.avg_rent_per_sqft) if cdm and cdm.avg_rent_per_sqft is not None else None,
                rental_yield_pct=c_show_yield,
                rent_growth_yoy_pct=float(cdm.rent_growth_yoy_pct) if cdm and cdm.rent_growth_yoy_pct is not None else None,
                sales_count=c_sales,
                rent_count_2026=c_rents,
                building_count=cad_area.building_count,
                confidence=confidence_for(max(c_sales, c_rents)),
                freehold_pct=float(c_land.freehold_pct) if c_land and c_land.freehold_pct is not None else None,
                registered_pct=float(c_land.registered_pct) if c_land and c_land.registered_pct is not None else None,
                total_parcels=int(c_land.total_parcels) if c_land else None,
                land_type_mix=dict(c_land.land_type_mix) if c_land and c_land.land_type_mix else None,
            )

    # KPI strip `latest` + chart `history` from real DLD (cadastral twin via
    # history_name_norm). demand/risk/investment reuse the Opportunity Engine
    # so the area page agrees with /opportunities. No seeded snapshots.
    if dld_block is not None:
        from app.services.opportunity_engine import DldAreaInput, build_report_dld

        hn = dld_block.history_name_norm or (dld_block.dld_name or "").strip().lower()
        hist_rows = (
            await db.execute(
                select(
                    DldPriceHistory.year,
                    DldPriceHistory.avg_ppsf_all,
                    DldPriceHistory.median_deal_size,
                    DldYieldHistory.gross_yield_pct,
                )
                .outerjoin(
                    DldYieldHistory,
                    (DldYieldHistory.area_name_norm == DldPriceHistory.area_name_norm)
                    & (DldYieldHistory.year == DldPriceHistory.year),
                )
                .where(DldPriceHistory.area_name_norm == hn)
                .order_by(DldPriceHistory.year)
            )
        ).all()
        history = [
            AreaSnapshotPoint(
                snapshot_date=date(int(yr), 7, 1).isoformat(),
                avg_price_per_sqft=float(ppsf) if ppsf is not None else None,
                avg_sale_price=float(deal) if deal is not None else None,
                rental_yield=float(gy) if gy is not None else None,
            )
            for yr, ppsf, deal, gy in hist_rows
            if ppsf is not None
        ]
        latest_deal = next(
            (float(deal) for yr, ppsf, deal, gy in reversed(hist_rows) if deal is not None),
            None,
        )
        appr = (
            await db.execute(
                select(DldAreaAppreciation).where(DldAreaAppreciation.area_name_norm == hn)
            )
        ).scalar_one_or_none()
        off = (
            await db.execute(
                select(DldPriceHistory.offplan_pct)
                .where(DldPriceHistory.area_name_norm == hn, DldPriceHistory.offplan_pct.isnot(None))
                .order_by(DldPriceHistory.year.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        cohort_prices = (
            await db.execute(
                select(DldAreaMetrics.median_price_per_sqft).where(
                    DldAreaMetrics.period == "2026-ytd",
                    DldAreaMetrics.median_price_per_sqft.isnot(None),
                )
            )
        ).scalars().all()
        cohort = float(median([float(p) for p in cohort_prices])) if cohort_prices else 1500.0
        rep = build_report_dld(
            DldAreaInput(
                area_id=str(area.id),
                area_name=area.name,
                area_name_arabic=area.name_arabic,
                area_type=area.area_type,
                latitude=area.latitude,
                longitude=area.longitude,
                rental_yield=dld_block.rental_yield_pct,
                price_per_sqft=dld_block.median_price_per_sqft,
                appreciation_1y=float(appr.appreciation_1y_pct) if appr and appr.appreciation_1y_pct is not None else None,
                appreciation_3y=float(appr.appreciation_3y_pct) if appr and appr.appreciation_3y_pct is not None else None,
                sales_count=dld_block.sales_count,
                rent_count=dld_block.rent_count_2026,
                offplan_pct=float(off) if off is not None else None,
            ),
            cohort,
        )
        km = rep.key_metrics
        latest = AreaLatestSnapshot(
            snapshot_date="2026-06-01",
            avg_sale_price=latest_deal,
            avg_price_per_sqft=dld_block.median_price_per_sqft,
            avg_annual_rent=dld_block.median_annual_rent,
            rental_yield=dld_block.rental_yield_pct,
            occupancy_rate=None,
            appreciation_1y=km.appreciation_1y,
            appreciation_3y=km.appreciation_3y,
            transaction_volume=dld_block.sales_count,
            demand_score=km.demand_score,
            risk_score=km.risk_score,
            investment_score=km.investment_score,
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
