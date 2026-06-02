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
    ids: str = Query(..., description="Comma-separated area slugs (UUIDs or name_norm) 2-4"),
    db: AsyncSession = Depends(get_db),
):
    """Side-by-side comparison of 2-4 areas with 12-month history + DLD overlay.

    Slugs can be:
      - a curated Area UUID → full comparison with snapshot history
      - a DLD area name_norm or DLD UUID → resolves to its curated link
        if any, otherwise returns a DLD-only row with `coverage_tier=limited`
    """
    raw_slugs = [s.strip() for s in ids.split(",") if s.strip()]
    if not 2 <= len(raw_slugs) <= 4:
        raise HTTPException(400, "Provide 2 to 4 area IDs/slugs")

    # Resolve each slug to either a curated Area or a DLD-only area
    curated_ids: list[UUID] = []
    dld_only_ids: list[UUID] = []  # DldArea.id values that have no curated link
    # Preserve input order so the response reflects what the user asked for
    resolution: list[tuple[str, Optional[UUID], Optional[UUID]]] = []  # (slug, curated_id, dld_id)

    for raw in raw_slugs:
        # Try UUID parse
        try:
            as_uuid = UUID(raw)
        except ValueError:
            as_uuid = None

        if as_uuid:
            # Could be a curated UUID
            row = (await db.execute(select(Area).where(Area.id == as_uuid))).scalar_one_or_none()
            if row:
                curated_ids.append(as_uuid)
                resolution.append((raw, as_uuid, None))
                continue
            # Or a DldArea UUID
            dld_row = (await db.execute(select(DldArea).where(DldArea.id == as_uuid))).scalar_one_or_none()
            if dld_row:
                if dld_row.curated_area_id:
                    curated_ids.append(dld_row.curated_area_id)
                    resolution.append((raw, dld_row.curated_area_id, None))
                else:
                    dld_only_ids.append(dld_row.id)
                    resolution.append((raw, None, dld_row.id))
                continue
            raise HTTPException(404, f"Area '{raw}' not found")

        # Otherwise treat as DLD name_norm
        dld_row = (await db.execute(
            select(DldArea).where(DldArea.name_norm == raw.lower())
        )).scalar_one_or_none()
        if not dld_row:
            raise HTTPException(404, f"Area '{raw}' not found")
        if dld_row.curated_area_id:
            curated_ids.append(dld_row.curated_area_id)
            resolution.append((raw, dld_row.curated_area_id, None))
        else:
            dld_only_ids.append(dld_row.id)
            resolution.append((raw, None, dld_row.id))

    areas: list[Area] = []
    if curated_ids:
        areas = (await db.execute(
            select(Area).where(Area.id.in_(curated_ids))
        )).scalars().all()
    areas_by_id = {a.id: a for a in areas}

    # Pull the DLD-only rows we'll need for partial comparison
    dld_only_rows = {}
    if dld_only_ids:
        rows = (await db.execute(
            select(DldArea, DldAreaMetrics)
            .outerjoin(
                DldAreaMetrics,
                (DldAreaMetrics.dld_area_id == DldArea.id)
                & (DldAreaMetrics.period == "2026-ytd"),
            )
            .where(DldArea.id.in_(dld_only_ids))
        )).all()
        for da, dm in rows:
            dld_only_rows[da.id] = (da, dm)

    snaps_q = (
        select(MarketSnapshot)
        .where(MarketSnapshot.area_id.in_(curated_ids))
        .order_by(MarketSnapshot.snapshot_date)
    ) if curated_ids else None
    by_area: dict = {}
    if snaps_q is not None:
        all_snaps = (await db.execute(snaps_q)).scalars().all()
        for s in all_snaps:
            by_area.setdefault(s.area_id, []).append(s)

    # DLD overlay for curated areas (matched by curated_area_id)
    dld_by_curated: dict = {}
    if curated_ids:
        dld_rows = (
            await db.execute(
                select(DldArea, DldAreaMetrics)
                .outerjoin(
                    DldAreaMetrics,
                    (DldAreaMetrics.dld_area_id == DldArea.id)
                    & (DldAreaMetrics.period == "2026-ytd"),
                )
                .where(DldArea.curated_area_id.in_(curated_ids))
            )
        ).all()
        for da, dm in dld_rows:
            dld_by_curated[da.curated_area_id] = (da, dm)

    def _dld_block_for(da, dm) -> Optional[CompareDldBlock]:
        sales = int(dm.sales_count or 0) if dm else 0
        rents = int(dm.rent_count_2026 or 0) if dm else 0
        show_yield = None
        if (dm and dm.rental_yield_pct is not None
                and sales >= MIN_RELIABLE_SAMPLES
                and rents >= MIN_RELIABLE_SAMPLES):
            show_yield = cap_yield(float(dm.rental_yield_pct))
        return CompareDldBlock(
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

    result: List[CompareAreaData] = []
    # Iterate in input order so the response matches the caller's slug list
    for slug, curated_id, dld_only_id in resolution:
        if curated_id is not None:
            area = areas_by_id.get(curated_id)
            if area is None:
                continue
            snaps = by_area.get(area.id, [])
            latest = snaps[-1] if snaps else None
            history = [
                CompareSnapshotPoint(
                    snapshot_date=s.snapshot_date,
                    avg_price_per_sqft=float(s.avg_price_per_sqft),
                    rental_yield=float(s.rental_yield),
                    avg_sale_price=float(s.avg_sale_price),
                )
                for s in snaps
            ]
            dld_block = (
                _dld_block_for(*dld_by_curated[area.id])
                if area.id in dld_by_curated else None
            )

            result.append(CompareAreaData(
                id=str(area.id),
                name=area.name,
                name_arabic=area.name_arabic,
                area_type=area.area_type,
                latest_price_per_sqft=float(latest.avg_price_per_sqft) if latest else None,
                latest_yield=float(latest.rental_yield) if latest else None,
                latest_sale_price=float(latest.avg_sale_price) if latest else None,
                appreciation_1y=float(latest.appreciation_1y) if latest and latest.appreciation_1y else None,
                appreciation_3y=float(latest.appreciation_3y) if latest and latest.appreciation_3y else None,
                occupancy_rate=float(latest.occupancy_rate) if latest and latest.occupancy_rate else None,
                demand_score=float(latest.demand_score) if latest and latest.demand_score else None,
                risk_score=float(latest.risk_score) if latest and latest.risk_score else None,
                investment_score=float(latest.investment_score) if latest and latest.investment_score else None,
                history=history,
                dld=dld_block,
                coverage_tier="full" if latest else "partial",
            ))
        elif dld_only_id is not None:
            # DLD-only: build a partial-comparison row from DLD metrics only
            tup = dld_only_rows.get(dld_only_id)
            if not tup:
                continue
            da, dm = tup
            dld_block = _dld_block_for(da, dm) if dm else None
            # Surface median PPSF as latest_price_per_sqft so the comparison
            # table can show a number for this area instead of all dashes.
            latest_ppsf = (
                float(dm.median_price_per_sqft)
                if dm and dm.median_price_per_sqft is not None
                else None
            )
            sales = int(dm.sales_count or 0) if dm else 0
            rents = int(dm.rent_count_2026 or 0) if dm else 0
            tier = "limited" if (sales + rents) > 0 else "none"
            result.append(CompareAreaData(
                id=str(da.id),
                name=da.name_display,
                name_arabic=None,
                area_type="residential",
                latest_price_per_sqft=latest_ppsf,
                latest_yield=dld_block.rental_yield_pct if dld_block else None,
                latest_sale_price=None,
                history=[],
                dld=dld_block,
                coverage_tier=tier,
            ))

    return CompareResponse(areas=result)
