"""Area comparison endpoint — real DLD only (World B retired, Phase 1).

Every metric and the multi-year history come from the DLD tables; the legacy
seeded `market_snapshots` path is gone. Per-area scoring reuses the Opportunity
Engine's `build_report_dld` so the comparison grid, radar and AED-1M simulator
show the SAME numbers an investor sees on /opportunities. Marketing-named areas
(JVC, Dubai Marina, Dubai Hills) resolve to their cadastral twin for the
multi-year history, exactly like the area detail page (Phase 2).
"""
from uuid import UUID
from datetime import date
from statistics import median
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.data.dld_area_aliases import cadastral_data_norm
from app.models.area import Area
from app.models.dld import DldArea, DldAreaMetrics, DldCanonicalArea
from app.schemas.compare import (
    CompareAreaData,
    CompareDldBlock,
    CompareResponse,
    CompareSnapshotPoint,
)
from app.schemas.dld import MIN_RELIABLE_SAMPLES, cap_yield, confidence_for
from app.services.opportunity_engine import DldAreaInput, build_report_dld

router = APIRouter(prefix="/api/v1/areas", tags=["compare"])


# One row of real DLD inputs per area (mirrors the opportunities universe row).
_AREA_DLD_SQL = text(
    """
    WITH latest_offplan AS (
        SELECT DISTINCT ON (area_name_norm) area_name_norm, offplan_pct
        FROM dld_price_history WHERE offplan_pct IS NOT NULL
        ORDER BY area_name_norm, year DESC
    )
    SELECT a.id::text AS dld_area_id, a.name_display, a.name_norm,
           m.median_price_per_sqft, m.median_annual_rent, m.median_rent_per_sqft,
           m.rental_yield_pct, m.rent_growth_yoy_pct,
           COALESCE(m.sales_count,0) AS sales_count,
           COALESCE(m.rent_count_2026,0) AS rent_count,
           ap.appreciation_1y_pct, ap.appreciation_3y_pct,
           lo.offplan_pct
    FROM dld_areas a
    JOIN dld_area_metrics m ON m.dld_area_id = a.id AND m.period = '2026-ytd'
    LEFT JOIN dld_area_appreciation ap ON ap.area_name_norm = :hist_norm
    LEFT JOIN latest_offplan lo ON lo.area_name_norm = :hist_norm
    WHERE a.name_norm = :own_norm
    LIMIT 1
    """
)

# Real multi-year history for the comparison chart (yearly DLD series, not the
# old monthly seeded snapshots). Joined price⋈yield by year on the cadastral norm.
_HISTORY_SQL = text(
    """
    SELECT p.year,
           p.avg_ppsf_all,
           p.median_deal_size,
           y.gross_yield_pct
    FROM dld_price_history p
    LEFT JOIN dld_yield_history y
           ON y.area_name_norm = p.area_name_norm AND y.year = p.year
    WHERE p.area_name_norm = :hist_norm
    ORDER BY p.year
    """
)


async def _global_cohort_median(db: AsyncSession) -> float:
    """Dubai-wide median of area median-ppsf (real), for the value component."""
    rows = (
        await db.execute(
            select(DldAreaMetrics.median_price_per_sqft).where(
                DldAreaMetrics.period == "2026-ytd",
                DldAreaMetrics.median_price_per_sqft.isnot(None),
            )
        )
    ).scalars().all()
    prices = [float(p) for p in rows if p is not None]
    return float(median(prices)) if prices else 1500.0


async def _dld_for_curated(db: AsyncSession, cur: Area) -> Optional[DldArea]:
    """Resolve a curated Area to a DLD row: its linked snapshot row, or — for
    curated marketing areas with no link (Downtown, Dubai Hills Estate, Damac
    Hills 2) — its cadastral twin (Phase 2 resolution)."""
    da = (await db.execute(
        select(DldArea).where(DldArea.curated_area_id == cur.id)
    )).scalar_one_or_none()
    if da:
        return da
    cad = cadastral_data_norm((cur.name or "").lower())
    return (await db.execute(
        select(DldArea).where(DldArea.name_norm == cad)
    )).scalar_one_or_none()


async def _resolve_to_dld(db: AsyncSession, raw: str) -> Optional[tuple[DldArea, Optional[Area]]]:
    """Resolve a slug (curated UUID, DLD UUID, name_norm, or canonical slug) to
    a (DldArea, optional curated Area) pair. Curated areas resolve to their
    linked DLD row (or cadastral twin) so everything is scored from DLD."""
    try:
        as_uuid: Optional[UUID] = UUID(raw)
    except ValueError:
        as_uuid = None

    if as_uuid:
        cur = (await db.execute(select(Area).where(Area.id == as_uuid))).scalar_one_or_none()
        if cur:
            da = await _dld_for_curated(db, cur)
            return (da, cur) if da else None
        da = (await db.execute(select(DldArea).where(DldArea.id == as_uuid))).scalar_one_or_none()
        if da:
            cur = (
                await db.execute(select(Area).where(Area.id == da.curated_area_id))
            ).scalar_one_or_none() if da.curated_area_id else None
            return da, cur
        return None

    # string slug → DldArea by name_norm, then canonical slug, then dash→space
    low = raw.lower().strip()
    da = (await db.execute(select(DldArea).where(DldArea.name_norm == low))).scalar_one_or_none()
    if da is None:
        canon = (await db.execute(
            select(DldCanonicalArea).where(DldCanonicalArea.area_name_slug == low)
        )).scalar_one_or_none()
        if canon is not None:
            da = (await db.execute(
                select(DldArea).where(DldArea.name_norm == canon.area_name.strip().lower())
            )).scalar_one_or_none()
    if da is None:
        spaced = low.replace("-", " ").strip()
        if spaced and spaced != low:
            da = (await db.execute(
                select(DldArea).where(DldArea.name_norm == spaced)
            )).scalar_one_or_none()
    if da is None:
        # Curated Area by name-slug (e.g. "dubai-hills-estate") → cadastral twin.
        import re as _re
        slug_form = _re.sub(r"[\s_-]+", "-", low).strip("-")
        cur = (await db.execute(
            select(Area).where(
                func.regexp_replace(func.lower(Area.name), r"[\s_-]+", "-", "g") == slug_form
            )
        )).scalar_one_or_none() if slug_form else None
        if cur:
            da = await _dld_for_curated(db, cur)
            return (da, cur) if da else None
        return None
    cur = (
        await db.execute(select(Area).where(Area.id == da.curated_area_id))
    ).scalar_one_or_none() if da.curated_area_id else None
    return da, cur


@router.get("/compare", response_model=CompareResponse)
async def compare_areas(
    ids: str = Query(..., description="Comma-separated area slugs (UUIDs or name_norm) 2-4"),
    db: AsyncSession = Depends(get_db),
):
    """Side-by-side comparison of 2-4 areas — all numbers from real DLD."""
    raw_slugs = [s.strip() for s in ids.split(",") if s.strip()]
    if not 2 <= len(raw_slugs) <= 4:
        raise HTTPException(400, "Provide 2 to 4 area IDs/slugs")

    cohort_median = await _global_cohort_median(db)
    result: List[CompareAreaData] = []

    for raw in raw_slugs:
        resolved = await _resolve_to_dld(db, raw)
        if resolved is None:
            raise HTTPException(404, f"Area '{raw}' not found")
        da, cur = resolved
        own_norm = da.name_norm
        hist_norm = cadastral_data_norm(own_norm)  # cadastral twin for history

        row = (
            await db.execute(_AREA_DLD_SQL, {"own_norm": own_norm, "hist_norm": hist_norm})
        ).mappings().first()
        if row is None:
            # No 2026 metrics → minimal row so the column still renders
            result.append(CompareAreaData(
                id=str(cur.id if cur else da.id),
                name=cur.name if cur else da.name_display,
                name_arabic=cur.name_arabic if cur else None,
                area_type=cur.area_type if cur else "residential",
                coverage_tier="none",
            ))
            continue

        sales = int(row["sales_count"] or 0)
        rents = int(row["rent_count"] or 0)
        gated_yield = (
            cap_yield(float(row["rental_yield_pct"]))
            if (row["rental_yield_pct"] is not None and sales >= MIN_RELIABLE_SAMPLES and rents >= MIN_RELIABLE_SAMPLES)
            else None
        )

        # Score with the same engine as /opportunities → consistent numbers.
        inp = DldAreaInput(
            area_id=str(da.id),
            area_name=cur.name if cur else da.name_display,
            area_name_arabic=cur.name_arabic if cur else None,
            area_type=cur.area_type if cur else "residential",
            latitude=None,
            longitude=None,
            rental_yield=gated_yield,
            price_per_sqft=float(row["median_price_per_sqft"]) if row["median_price_per_sqft"] is not None else None,
            appreciation_1y=float(row["appreciation_1y_pct"]) if row["appreciation_1y_pct"] is not None else None,
            appreciation_3y=float(row["appreciation_3y_pct"]) if row["appreciation_3y_pct"] is not None else None,
            sales_count=sales,
            rent_count=rents,
            offplan_pct=float(row["offplan_pct"]) if row["offplan_pct"] is not None else None,
        )
        rep = build_report_dld(inp, cohort_median)
        km = rep.key_metrics

        # Real yearly history (cadastral twin) for the chart.
        hist_rows = (
            await db.execute(_HISTORY_SQL, {"hist_norm": hist_norm})
        ).mappings().all()
        history = [
            CompareSnapshotPoint(
                snapshot_date=date(int(h["year"]), 7, 1),
                avg_price_per_sqft=float(h["avg_ppsf_all"]) if h["avg_ppsf_all"] is not None else 0.0,
                rental_yield=float(h["gross_yield_pct"]) if h["gross_yield_pct"] is not None else 0.0,
                avg_sale_price=float(h["median_deal_size"]) if h["median_deal_size"] is not None else 0.0,
            )
            for h in hist_rows
            if h["avg_ppsf_all"] is not None
        ]

        dld_block = CompareDldBlock(
            dld_area_id=da.id,
            dld_name=da.name_display,
            median_price_per_sqft=float(row["median_price_per_sqft"]) if row["median_price_per_sqft"] is not None else None,
            median_annual_rent=float(row["median_annual_rent"]) if row["median_annual_rent"] is not None else None,
            median_rent_per_sqft=float(row["median_rent_per_sqft"]) if row["median_rent_per_sqft"] is not None else None,
            rental_yield_pct=gated_yield,
            rent_growth_yoy_pct=float(row["rent_growth_yoy_pct"]) if row["rent_growth_yoy_pct"] is not None else None,
            sales_count=sales,
            rent_count_2026=rents,
            confidence=confidence_for(max(sales, rents)),
        )

        result.append(CompareAreaData(
            id=str(cur.id if cur else da.id),
            name=cur.name if cur else da.name_display,
            name_arabic=cur.name_arabic if cur else None,
            area_type=cur.area_type if cur else "residential",
            latest_price_per_sqft=km.price_per_sqft,
            latest_yield=km.rental_yield,
            latest_sale_price=None,
            appreciation_1y=km.appreciation_1y,
            appreciation_3y=km.appreciation_3y,
            occupancy_rate=None,
            demand_score=km.demand_score,
            risk_score=km.risk_score,
            investment_score=km.investment_score,
            history=history,
            dld=dld_block,
            coverage_tier="full" if history else ("partial" if (sales + rents) > 0 else "limited"),
        ))

    return CompareResponse(areas=result)
