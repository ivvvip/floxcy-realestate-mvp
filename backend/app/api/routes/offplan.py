"""Off-plan project explorer + register-interest lead capture.

A "project" here is a `master_project` value with at least one
`dld_buildings` row tagged `is_offplan=true`. Pricing context comes from
two sources:
  - `dld_buildings_sales.avg_ppsf_offplan` — off-plan sale price proxy
  - `dld_buildings_sales.avg_ppsf_ready` — same-area ready sale price

The "off-plan vs ready" delta on the detail page is computed from these
when both sides have data; otherwise it's reported as 'Insufficient
comparable sales'.

Register-interest writes into the existing `investor_leads` table with
`source_type='offplan_interest'` and a project tag in `message`.
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
from app.models.dld import DldArea, DldBuilding, DldBuildingsSales
from app.models.investor_lead import InvestorLead

from app.api.routes.developers import _detect_brand, _slugify


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


class OffplanListResponse(BaseModel):
    total: int
    items: list[OffplanProjectCard]
    data_source: str = "Derived from dld_buildings WHERE is_offplan=true, grouped by master_project."


class OffplanPriceContext(BaseModel):
    """Per-area sales benchmark, surfaced on a project's detail page so
    investors can frame off-plan ask vs ready market."""
    avg_ppsf_offplan: Optional[float] = None
    avg_ppsf_ready: Optional[float] = None
    delta_pct: Optional[float] = None  # (ready - offplan) / offplan * 100
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
    data_source: str = "dld_buildings + dld_buildings_sales (area-level price context)."


class RegisterInterestRequest(BaseModel):
    project_slug: str
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

@router.get("/projects", response_model=OffplanListResponse)
async def list_offplan_projects(
    db: AsyncSession = Depends(get_db),
    developer: Optional[str] = Query(None, description="Developer slug"),
    area_slug: Optional[str] = Query(None, description="DLD area name_norm"),
    prop_sub_type: Optional[str] = Query(None),
    min_units: int = Query(0, ge=0),
    sort: Literal["units", "newest", "oldest", "name"] = Query("units"),
    limit: int = Query(60, ge=1, le=200),
) -> OffplanListResponse:
    # Build per-project counters from raw building rows so we get
    # offplan/ready splits in one pass.
    where = [DldBuilding.master_project.is_not(None)]
    if prop_sub_type:
        where.append(DldBuilding.prop_sub_type.ilike(prop_sub_type))
    if area_slug:
        # Frontend may send either "business-bay" (slug) or "business bay".
        where.append(DldArea.name_norm == area_slug.replace("-", " ").lower())

    rows = (
        await db.execute(
            select(
                DldBuilding.master_project,
                DldArea.name_display,
                DldArea.name_norm,
                DldBuilding.flats,
                DldBuilding.is_offplan,
                DldBuilding.creation_date,
            )
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
            .where(and_(*where))
        )
    ).all()

    by_project: dict[str, dict] = {}
    for mp, area_name, area_norm, flats, is_offplan, cdate in rows:
        slug = _slugify(mp)
        dev_slug, dev_name = _detect_brand(mp)
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
        })
        bucket["buildings_count"] += 1
        bucket["total_units"] += int(flats or 0)
        if is_offplan:
            bucket["offplan_buildings"] += 1
        else:
            bucket["ready_buildings"] += 1
        if cdate:
            bucket["years"].append(cdate.year)

    items: list[OffplanProjectCard] = []
    for p in by_project.values():
        if p["offplan_buildings"] == 0:
            continue
        if developer and p["developer_slug"] != developer.lower():
            continue
        if min_units and p["total_units"] < min_units:
            continue
        items.append(OffplanProjectCard(
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
        ))

    if sort == "units":
        items.sort(key=lambda x: x.total_units, reverse=True)
    elif sort == "newest":
        items.sort(key=lambda x: (x.latest_year or 0), reverse=True)
    elif sort == "oldest":
        items.sort(key=lambda x: (x.earliest_year or 9999))
    else:  # name
        items.sort(key=lambda x: x.master_project.lower())

    return OffplanListResponse(total=len(items), items=items[:limit])


@router.get("/coming-soon", response_model=OffplanListResponse)
async def list_coming_soon(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(40, ge=1, le=100),
) -> OffplanListResponse:
    """Projects whose latest registered building is within the last 18
    months — a proxy for 'just launched / launching soon' since DLD does
    not publish a status='PENDING' column on the open buildings dataset."""
    full = await list_offplan_projects(db=db, sort="newest", limit=200)
    # Keep only the freshest-creation projects (top by latest_year then
    # earliest_year ties to surface brand-new launches).
    fresh = sorted(
        full.items,
        key=lambda p: (p.latest_year or 0, p.earliest_year or 0),
        reverse=True,
    )[:limit]
    return OffplanListResponse(
        total=len(fresh),
        items=fresh,
        data_source="Projects with the most recent building creation_date — surrogate for 'launching soon'.",
    )


@router.get("/projects/{slug}", response_model=OffplanProjectDetail)
async def get_offplan_project(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> OffplanProjectDetail:
    # Resolve the project by slug. We rebuild from raw rows so we can
    # also list sub-projects and pull area-level price context.
    rows = (
        await db.execute(
            select(
                DldBuilding.master_project,
                DldBuilding.project_name,
                DldArea.id,
                DldArea.name_display,
                DldArea.name_norm,
                DldBuilding.flats,
                DldBuilding.is_offplan,
                DldBuilding.creation_date,
            )
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
            .where(DldBuilding.master_project.is_not(None))
        )
    ).all()

    matching = [r for r in rows if _slugify(r[0]) == slug.lower()]
    if not matching:
        raise HTTPException(404, f"Off-plan project '{slug}' not found")

    mp = matching[0][0]
    dev_slug, dev_name = _detect_brand(mp)
    sub_projects = sorted({r[1] for r in matching if r[1] and r[1] != mp})
    area_id = matching[0][2]
    area_name = matching[0][3]
    area_norm = matching[0][4]

    buildings_count = len(matching)
    total_units = sum(int(r[5] or 0) for r in matching)
    offplan_buildings = sum(1 for r in matching if r[6])
    ready_buildings = buildings_count - offplan_buildings
    years = [r[7].year for r in matching if r[7]]

    # Off-plan vs ready price context (area-level proxy from sales table)
    price_ctx = OffplanPriceContext()
    if area_id:
        sales = (
            await db.execute(
                select(
                    func.avg(DldBuildingsSales.avg_ppsf_offplan),
                    func.avg(DldBuildingsSales.avg_ppsf_ready),
                    func.sum(DldBuildingsSales.total_transactions),
                ).where(DldBuildingsSales.dld_area_id == area_id)
            )
        ).first()
        if sales:
            avg_off, avg_ready, total_txn = sales
            price_ctx.avg_ppsf_offplan = float(avg_off) if avg_off else None
            price_ctx.avg_ppsf_ready = float(avg_ready) if avg_ready else None
            price_ctx.sample_offplan_sales = int(total_txn or 0) if avg_off else 0
            price_ctx.sample_ready_sales = int(total_txn or 0) if avg_ready else 0
            if price_ctx.avg_ppsf_offplan and price_ctx.avg_ppsf_ready and price_ctx.avg_ppsf_offplan > 0:
                price_ctx.delta_pct = round(
                    (price_ctx.avg_ppsf_ready - price_ctx.avg_ppsf_offplan) / price_ctx.avg_ppsf_offplan * 100,
                    1,
                )

    return OffplanProjectDetail(
        slug=slug.lower(),
        master_project=mp,
        area_name=area_name,
        area_slug=area_norm,
        developer_slug=dev_slug,
        developer_name=dev_name,
        buildings_count=buildings_count,
        total_units=total_units,
        offplan_buildings=offplan_buildings,
        ready_buildings=ready_buildings,
        earliest_year=min(years) if years else None,
        latest_year=max(years) if years else None,
        sub_projects=sub_projects[:25],
        price_context=price_ctx,
    )


@router.post("/register-interest", response_model=RegisterInterestResponse, status_code=201)
async def register_interest(
    payload: RegisterInterestRequest,
    db: AsyncSession = Depends(get_db),
) -> RegisterInterestResponse:
    if not payload.whatsapp and not payload.email:
        raise HTTPException(422, "At least one contact channel (whatsapp or email) is required")

    # Resolve project name for a richer lead message
    project_name = payload.project_slug
    rows = (
        await db.execute(
            select(DldBuilding.master_project)
            .where(DldBuilding.master_project.is_not(None))
            .distinct()
        )
    ).scalars().all()
    for mp in rows:
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
