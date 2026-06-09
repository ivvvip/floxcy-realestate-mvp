"""Off-plan project explorer + register-interest lead capture.

A "project" here is a `master_project_en` value from
`dld_buildings_sales`. A project is considered off-plan when at least
one building under it has a non-null `avg_ppsf_offplan` or
`avg_sale_price_offplan` — i.e. the transactions stream contains
off-plan sales for it.

The off-plan vs ready delta is computed from per-area aggregates of
`avg_ppsf_offplan` vs `avg_ppsf_ready` because the per-building offplan
price is sparse and area-wide is a more reliable proxy.

Register-interest writes into the existing `investor_leads` table.
"""
from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld import DldArea, DldBuildingsSales
from app.models.investor_lead import InvestorLead

from app.api.routes.developers import _detect_brand_multi, _slugify


router = APIRouter(
    prefix="/api/v1/offplan",
    tags=["offplan"],
    dependencies=[Depends(rate_limit_dependency)],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class OffplanProjectCard(BaseModel):
    slug: str
    master_project: str
    area_name: Optional[str]
    area_slug: Optional[str]
    developer_slug: str
    developer_name: str
    buildings_count: int
    total_units: int
    earliest_year: Optional[int]
    latest_year: Optional[int]
    offplan_buildings: int
    ready_buildings: int
    # Derived completion-state. DLD's open dataset does not publish
    # percent_completed / completion_date / project_status, so we infer
    # status from year-of-transaction signals — see _derive_status.
    status_key: str = "active"            # active | completed | coming_soon
    status_label: str = "Active off-plan"
    latest_offplan_year: Optional[int] = None
    latest_ready_year: Optional[int] = None
    # Off-plan vs ready price gain at the project level (ppsf). Populated
    # only when both sides have transaction data — drives the "bought at
    # X, now Y = +Z%" insight on completed-project cards.
    offplan_ppsf: Optional[float] = None
    ready_ppsf: Optional[float] = None
    price_gain_pct: Optional[float] = None


class OffplanListResponse(BaseModel):
    total: int
    items: list[OffplanProjectCard]
    data_source: str = (
        "Derived from dld_buildings_sales — offplan vs ready price + year "
        "signals. DLD does not publish percent_completed or completion_date "
        "fields, so 'completed' means: most recent transactions are ready, "
        "not off-plan."
    )
    counts: dict[str, int] = Field(default_factory=dict)  # active/completed/coming_soon


class OffplanPriceContext(BaseModel):
    avg_ppsf_offplan: Optional[float] = None
    avg_ppsf_ready: Optional[float] = None
    delta_pct: Optional[float] = None
    sample_offplan_sales: int = 0
    sample_ready_sales: int = 0


class OffplanProjectDetail(BaseModel):
    slug: str
    master_project: str
    area_name: Optional[str]
    area_slug: Optional[str]
    developer_slug: str
    developer_name: str
    buildings_count: int
    total_units: int
    earliest_year: Optional[int]
    latest_year: Optional[int]
    offplan_buildings: int
    ready_buildings: int
    sub_projects: list[str]
    price_context: OffplanPriceContext
    # Derived status + project-level price-gain insight (the "bought at
    # X, now Y = +Z%" line on completed projects).
    status_key: str = "active"
    status_label: str = "Active off-plan"
    latest_offplan_year: Optional[int] = None
    latest_ready_year: Optional[int] = None
    offplan_ppsf: Optional[float] = None
    ready_ppsf: Optional[float] = None
    price_gain_pct: Optional[float] = None
    data_source: str = "dld_buildings_sales (project-level) + area-level offplan vs ready aggregates."


class RegisterInterestRequest(BaseModel):
    project_slug: str
    # Optional human-readable name. Official off-plan projects key on a numeric
    # project_number (not a master-project slug), so the page passes the name
    # through directly rather than relying on slug→master_project resolution.
    project_name: Optional[str] = Field(default=None, max_length=300)
    full_name: str = Field(..., min_length=2, max_length=200)
    whatsapp: Optional[str] = Field(default=None, max_length=64)
    email: Optional[EmailStr] = None
    budget_aed: Optional[float] = Field(default=None, ge=0)
    timeline: Optional[str] = Field(default=None, max_length=64)
    message: Optional[str] = Field(default=None, max_length=2000)


class RegisterInterestResponse(BaseModel):
    lead_id: UUID
    status: str = "received"
    message: str = "Interest registered. A specialist will reach out within 24h."


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

# Current data-snapshot year for "active" detection. Updated yearly.
SNAPSHOT_YEAR = 2026


def _derive_status(bucket: dict) -> tuple[str, str]:
    """Classify a project as active / completed / coming_soon from year
    + side-of-sale signals.

      - completed: ready sales exist AND
                   (no recent offplan sales OR latest offplan < latest ready)
      - active:    latest offplan sale is in the snapshot year (still being
                   sold as off-plan right now)
      - coming_soon: no transactions yet (only registered, no sales)
    """
    has_ready = bucket["ready_buildings"] > 0
    has_offplan = bucket["offplan_buildings"] > 0
    latest_offplan = bucket["latest_offplan_year"]
    latest_ready = bucket["latest_ready_year"]

    if not has_ready and not has_offplan:
        return ("coming_soon", "Coming Soon · No sales yet")

    if has_offplan and latest_offplan and latest_offplan >= SNAPSHOT_YEAR - 1:
        return ("active", f"Active off-plan · sold through {latest_offplan}")

    if has_ready:
        if has_offplan and latest_offplan and latest_ready and latest_offplan < latest_ready:
            return ("completed", f"Completed · last off-plan {latest_offplan}, now ready")
        if not has_offplan:
            return ("completed", "Completed · trades as ready")
        if has_offplan:
            return ("completed", f"Completed · last off-plan {latest_offplan}")

    if has_offplan:
        return ("active", f"Active off-plan · sold through {latest_offplan or '—'}")
    return ("coming_soon", "Coming Soon")


async def _load_project_rows(
    db: AsyncSession,
    where: list,
) -> list[dict]:
    """Pull every dld_buildings_sales row + join area, group in Python so
    we can compute offplan/ready splits and apply brand filters cleanly."""
    rows = (
        await db.execute(
            select(
                DldBuildingsSales.master_project_en,
                DldBuildingsSales.area_name_en,
                DldArea.name_norm,
                DldBuildingsSales.total_transactions,
                DldBuildingsSales.avg_ppsf_offplan,
                DldBuildingsSales.avg_ppsf_ready,
                DldBuildingsSales.avg_sale_price_offplan,
                DldBuildingsSales.first_seen_year,
                DldBuildingsSales.last_seen_year,
                DldBuildingsSales.building_name_en,
            )
            .outerjoin(DldArea, DldArea.id == DldBuildingsSales.dld_area_id)
            .where(and_(*where))
        )
    ).all()

    by_project: dict[str, dict] = {}
    for (
        mp, area_name, area_norm, total_txn,
        avg_ppsf_off, avg_ppsf_ready, avg_price_off,
        first_year, last_year, bld_name,
    ) in rows:
        if not mp:
            continue
        slug = _slugify(mp)
        # Try master_project first, then fall back to building name —
        # AZIZI / BINGHATTI / etc don't appear in master_project_en but
        # do appear in building_name_en.
        dev_slug, dev_name = _detect_brand_multi(mp, bld_name)
        bucket = by_project.setdefault(slug, {
            "slug": slug,
            "master_project": mp,
            "area_name": area_name,
            "area_slug": area_norm,
            "developer_slug": dev_slug,
            "developer_name": dev_name,
            "buildings_count": 0,
            "total_units": 0,
            "offplan_buildings": 0,
            "ready_buildings": 0,
            "years": [],
            "sub_projects": set(),
            "offplan_ppsf_sum": 0.0,
            "offplan_ppsf_n": 0,
            "ready_ppsf_sum": 0.0,
            "ready_ppsf_n": 0,
            "latest_offplan_year": None,
            "latest_ready_year": None,
        })
        bucket["buildings_count"] += 1
        bucket["total_units"] += int(total_txn or 0)
        is_offplan = avg_ppsf_off is not None or avg_price_off is not None
        is_ready = avg_ppsf_ready is not None
        if is_offplan:
            bucket["offplan_buildings"] += 1
            if avg_ppsf_off is not None:
                bucket["offplan_ppsf_sum"] += float(avg_ppsf_off)
                bucket["offplan_ppsf_n"] += 1
            if last_year:
                y = int(last_year)
                if bucket["latest_offplan_year"] is None or y > bucket["latest_offplan_year"]:
                    bucket["latest_offplan_year"] = y
        if is_ready:
            bucket["ready_buildings"] += 1
            bucket["ready_ppsf_sum"] += float(avg_ppsf_ready)
            bucket["ready_ppsf_n"] += 1
            if last_year:
                y = int(last_year)
                if bucket["latest_ready_year"] is None or y > bucket["latest_ready_year"]:
                    bucket["latest_ready_year"] = y
        if not is_offplan and not is_ready:
            # Row exists but no side-tagged price — count as ready-ish (a
            # transaction occurred so it's not "coming soon").
            bucket["ready_buildings"] += 1
            if last_year:
                y = int(last_year)
                if bucket["latest_ready_year"] is None or y > bucket["latest_ready_year"]:
                    bucket["latest_ready_year"] = y
        if first_year:
            bucket["years"].append(int(first_year))
        if last_year:
            bucket["years"].append(int(last_year))
        if bld_name and bld_name.strip().upper() != mp.strip().upper():
            bucket["sub_projects"].add(bld_name.strip())
    return list(by_project.values())


def _build_card(p: dict) -> OffplanProjectCard:
    """Materialise a single project bucket into the response shape with
    derived status + per-side ppsf + gain."""
    status_key, status_label = _derive_status(p)
    offplan_ppsf = (
        p["offplan_ppsf_sum"] / p["offplan_ppsf_n"]
        if p["offplan_ppsf_n"] else None
    )
    ready_ppsf = (
        p["ready_ppsf_sum"] / p["ready_ppsf_n"]
        if p["ready_ppsf_n"] else None
    )
    gain_pct = None
    if offplan_ppsf and ready_ppsf and offplan_ppsf > 0:
        gain_pct = round((ready_ppsf - offplan_ppsf) / offplan_ppsf * 100, 1)
    return OffplanProjectCard(
        slug=p["slug"],
        master_project=p["master_project"],
        area_name=p["area_name"],
        area_slug=p["area_slug"],
        developer_slug=p["developer_slug"],
        developer_name=p["developer_name"],
        buildings_count=p["buildings_count"],
        total_units=p["total_units"],
        offplan_buildings=p["offplan_buildings"],
        ready_buildings=p["ready_buildings"],
        earliest_year=min(p["years"]) if p["years"] else None,
        latest_year=max(p["years"]) if p["years"] else None,
        status_key=status_key,
        status_label=status_label,
        latest_offplan_year=p["latest_offplan_year"],
        latest_ready_year=p["latest_ready_year"],
        offplan_ppsf=offplan_ppsf,
        ready_ppsf=ready_ppsf,
        price_gain_pct=gain_pct,
    )


async def _build_offplan_items(
    db: AsyncSession,
    *,
    developer: Optional[str] = None,
    area_slug: Optional[str] = None,
    min_units: int = 0,
    sort: str = "units",
    status: str = "active",
) -> tuple[list[OffplanProjectCard], dict[str, int]]:
    """Core offplan aggregation. Returns (items, counts-by-status)."""
    where = []
    if area_slug:
        where.append(DldArea.name_norm == area_slug.replace("-", " ").lower())
    projects = await _load_project_rows(db, where)

    cards: list[OffplanProjectCard] = []
    counts: dict[str, int] = {"active": 0, "completed": 0, "coming_soon": 0, "all": 0}
    for p in projects:
        # A "project" must have at least one off-plan transaction in the
        # historical record — otherwise it's just a ready-only building set.
        if p["offplan_buildings"] == 0:
            continue
        if developer and p["developer_slug"] != developer.lower():
            continue
        if min_units and p["total_units"] < min_units:
            continue
        card = _build_card(p)
        counts[card.status_key] = counts.get(card.status_key, 0) + 1
        counts["all"] += 1
        if status != "all" and card.status_key != status:
            continue
        cards.append(card)

    if sort == "units":
        cards.sort(key=lambda x: x.total_units, reverse=True)
    elif sort == "newest":
        cards.sort(key=lambda x: (x.latest_year or 0), reverse=True)
    elif sort == "oldest":
        cards.sort(key=lambda x: (x.earliest_year or 9999))
    else:
        cards.sort(key=lambda x: x.master_project.lower())
    return cards, counts


@router.get("/projects", response_model=OffplanListResponse)
async def list_offplan_projects(
    db: AsyncSession = Depends(get_db),
    developer: Optional[str] = Query(None, description="Developer slug"),
    area_slug: Optional[str] = Query(None, description="DLD area name_norm or slug"),
    min_units: int = Query(0, ge=0),
    sort: Literal["units", "newest", "oldest", "name"] = Query("units"),
    status: Literal["active", "completed", "coming_soon", "all"] = Query(
        "active", description="Status filter. Default 'active' excludes completed."
    ),
    include_completed: bool = Query(
        False, description="Shortcut: when true, behaves like status='all'."
    ),
    limit: int = Query(60, ge=1, le=200),
) -> OffplanListResponse:
    effective_status = "all" if include_completed else status
    items, counts = await _build_offplan_items(
        db,
        developer=developer,
        area_slug=area_slug,
        min_units=min_units,
        sort=sort,
        status=effective_status,
    )
    return OffplanListResponse(
        total=len(items),
        items=items[:limit],
        counts=counts,
    )


@router.get("/coming-soon", response_model=OffplanListResponse)
async def list_coming_soon(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(40, ge=1, le=100),
) -> OffplanListResponse:
    items, counts = await _build_offplan_items(db, sort="newest", status="all")
    # Prefer truly-coming-soon (no transactions), then most recent active.
    items.sort(
        key=lambda x: (
            0 if x.status_key == "coming_soon" else 1,
            -(x.latest_year or 0),
        )
    )
    return OffplanListResponse(
        total=len(items),
        items=items[:limit],
        counts=counts,
        data_source=(
            "'Coming Soon' = projects with no recorded sales yet, registered "
            "on the DLD buildings dataset. Active off-plan with the most "
            "recent transaction year follows."
        ),
    )


@router.get("/projects/{slug}", response_model=OffplanProjectDetail)
async def get_offplan_project(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> OffplanProjectDetail:
    projects = await _load_project_rows(db, where=[])
    match = next((p for p in projects if p["slug"] == slug.lower()), None)
    if not match:
        raise HTTPException(404, f"Off-plan project '{slug}' not found")

    # Area-level price context from dld_buildings_sales itself
    price_ctx = OffplanPriceContext()
    if match["area_slug"]:
        area = (
            await db.execute(
                select(DldArea.id).where(DldArea.name_norm == match["area_slug"])
            )
        ).scalar_one_or_none()
        if area:
            sales = (
                await db.execute(
                    select(
                        func.avg(DldBuildingsSales.avg_ppsf_offplan),
                        func.avg(DldBuildingsSales.avg_ppsf_ready),
                        func.count(DldBuildingsSales.id).filter(
                            DldBuildingsSales.avg_ppsf_offplan.is_not(None)
                        ),
                        func.count(DldBuildingsSales.id).filter(
                            DldBuildingsSales.avg_ppsf_ready.is_not(None)
                        ),
                    ).where(DldBuildingsSales.dld_area_id == area)
                )
            ).first()
            if sales:
                avg_off, avg_ready, n_off, n_ready = sales
                price_ctx.avg_ppsf_offplan = float(avg_off) if avg_off else None
                price_ctx.avg_ppsf_ready = float(avg_ready) if avg_ready else None
                price_ctx.sample_offplan_sales = int(n_off or 0)
                price_ctx.sample_ready_sales = int(n_ready or 0)
                if (
                    price_ctx.avg_ppsf_offplan
                    and price_ctx.avg_ppsf_ready
                    and price_ctx.avg_ppsf_offplan > 0
                ):
                    price_ctx.delta_pct = round(
                        (price_ctx.avg_ppsf_ready - price_ctx.avg_ppsf_offplan)
                        / price_ctx.avg_ppsf_offplan * 100,
                        1,
                    )

    # Reuse the card builder so detail + list share derived fields.
    card = _build_card(match)
    return OffplanProjectDetail(
        slug=slug.lower(),
        master_project=card.master_project,
        area_name=card.area_name,
        area_slug=card.area_slug,
        developer_slug=card.developer_slug,
        developer_name=card.developer_name,
        buildings_count=card.buildings_count,
        total_units=card.total_units,
        offplan_buildings=card.offplan_buildings,
        ready_buildings=card.ready_buildings,
        earliest_year=card.earliest_year,
        latest_year=card.latest_year,
        sub_projects=sorted(match["sub_projects"])[:25],
        price_context=price_ctx,
        status_key=card.status_key,
        status_label=card.status_label,
        latest_offplan_year=card.latest_offplan_year,
        latest_ready_year=card.latest_ready_year,
        offplan_ppsf=card.offplan_ppsf,
        ready_ppsf=card.ready_ppsf,
        price_gain_pct=card.price_gain_pct,
    )


@router.post(
    "/register-interest",
    response_model=RegisterInterestResponse,
    status_code=201,
)
async def register_interest(
    payload: RegisterInterestRequest,
    db: AsyncSession = Depends(get_db),
) -> RegisterInterestResponse:
    if not payload.whatsapp and not payload.email:
        raise HTTPException(
            422, "At least one contact channel (whatsapp or email) is required"
        )

    # Prefer the explicit name (official projects pass it through); otherwise
    # resolve the transaction-derived slug back to its master_project name.
    project_name = (payload.project_name or "").strip() or payload.project_slug
    if not (payload.project_name or "").strip():
        mps = (
            await db.execute(
                select(DldBuildingsSales.master_project_en)
                .where(DldBuildingsSales.master_project_en.is_not(None))
                .distinct()
            )
        ).scalars().all()
        for mp in mps:
            if _slugify(mp) == payload.project_slug.lower():
                project_name = mp
                break

    lead = InvestorLead(
        full_name=payload.full_name.strip(),
        email=payload.email,
        whatsapp=payload.whatsapp,
        budget=payload.budget_aed,
        timeline=payload.timeline,
        message=(
            f"Off-plan interest: {project_name}\n"
            + (payload.message or "").strip()
        ).strip(),
        status="new",
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return RegisterInterestResponse(lead_id=lead.id)
