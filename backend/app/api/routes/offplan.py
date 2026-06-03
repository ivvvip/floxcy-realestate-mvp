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
    data_source: str = "Derived from dld_buildings_sales — projects with off-plan transactions on record."


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
    data_source: str = "dld_buildings_sales (project-level) + area-level offplan vs ready aggregates."


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
        avg_ppsf_off, avg_price_off, first_year, last_year, bld_name,
    ) in rows:
        if not mp:
            continue
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
            "sub_projects": set(),
        })
        bucket["buildings_count"] += 1
        bucket["total_units"] += int(total_txn or 0)
        is_offplan = avg_ppsf_off is not None or avg_price_off is not None
        if is_offplan:
            bucket["offplan_buildings"] += 1
        else:
            bucket["ready_buildings"] += 1
        if first_year:
            bucket["years"].append(int(first_year))
        if last_year:
            bucket["years"].append(int(last_year))
        if bld_name and bld_name.strip().upper() != mp.strip().upper():
            bucket["sub_projects"].add(bld_name.strip())
    return list(by_project.values())


@router.get("/projects", response_model=OffplanListResponse)
async def list_offplan_projects(
    db: AsyncSession = Depends(get_db),
    developer: Optional[str] = Query(None, description="Developer slug"),
    area_slug: Optional[str] = Query(None, description="DLD area name_norm or slug"),
    min_units: int = Query(0, ge=0),
    sort: Literal["units", "newest", "oldest", "name"] = Query("units"),
    limit: int = Query(60, ge=1, le=200),
) -> OffplanListResponse:
    where = []
    if area_slug:
        where.append(DldArea.name_norm == area_slug.replace("-", " ").lower())
    projects = await _load_project_rows(db, where)

    items: list[OffplanProjectCard] = []
    for p in projects:
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
    else:
        items.sort(key=lambda x: x.master_project.lower())

    return OffplanListResponse(total=len(items), items=items[:limit])


@router.get("/coming-soon", response_model=OffplanListResponse)
async def list_coming_soon(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(40, ge=1, le=100),
) -> OffplanListResponse:
    full = await list_offplan_projects(db=db, sort="newest", limit=200)
    fresh = sorted(
        full.items,
        key=lambda p: (p.latest_year or 0, p.earliest_year or 0),
        reverse=True,
    )[:limit]
    return OffplanListResponse(
        total=len(fresh),
        items=fresh,
        data_source="Projects with the most recent transaction year — surrogate for 'launching soon'.",
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

    return OffplanProjectDetail(
        slug=slug.lower(),
        master_project=match["master_project"],
        area_name=match["area_name"],
        area_slug=match["area_slug"],
        developer_slug=match["developer_slug"],
        developer_name=match["developer_name"],
        buildings_count=match["buildings_count"],
        total_units=match["total_units"],
        offplan_buildings=match["offplan_buildings"],
        ready_buildings=match["ready_buildings"],
        earliest_year=min(match["years"]) if match["years"] else None,
        latest_year=max(match["years"]) if match["years"] else None,
        sub_projects=sorted(match["sub_projects"])[:25],
        price_context=price_ctx,
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

    project_name = payload.project_slug
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
