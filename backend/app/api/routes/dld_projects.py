"""Official DLD off-plan registry API (Phase 3, TIER 1).

Surfaces dld_projects / dld_developers verbatim from the DLD registry, always
tagged `"source": "DLD Official"`. The TIER 2 project_enrichment block (payment
plans, indicative prices) is returned SEPARATELY and only when present, tagged
`"label": "ℹ️ Market data (indicative)"` so investors never confuse the two.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld_project import DldDeveloper, DldProject, ProjectEnrichment

router = APIRouter(
    prefix="/api/v1/dld/official",
    tags=["dld-official"],
    dependencies=[Depends(rate_limit_dependency)],
)

OFFICIAL = "✅ Official DLD Data"
INDICATIVE = "ℹ️ Market data (indicative)"


def _project_card(p: DldProject) -> dict:
    return {
        "project_number": p.project_number,
        "project_name": p.project_name,
        "developer_name": p.developer_name,
        "project_status": p.project_status,
        "percent_completed": float(p.percent_completed) if p.percent_completed is not None else None,
        "has_escrow": p.escrow_account_number is not None,
        "handover_date": p.completion_date.date().isoformat() if p.completion_date else None,
        "area": p.area_en,
        "master_project": p.master_project,
        "unit_count": p.cnt_unit,
        "source": OFFICIAL,
    }


@router.get("/projects")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None, description="ACTIVE | PENDING | PENDING_COMING_SOON"),
    area: Optional[str] = Query(None, description="area_name_norm (lowercased AREA_EN)"),
    developer_number: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="search project / developer / master-project name"),
    limit: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List official DLD off-plan projects. Every row is authoritative DLD data."""
    stmt = select(DldProject)
    if status:
        stmt = stmt.where(DldProject.project_status == status)
    if area:
        stmt = stmt.where(DldProject.area_name_norm == area.strip().lower())
    if developer_number:
        stmt = stmt.where(DldProject.developer_number == developer_number)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(
            func.lower(DldProject.project_name).like(like),
            func.lower(DldProject.developer_name).like(like),
            func.lower(DldProject.master_project).like(like),
        ))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.execute(
            stmt.order_by(DldProject.percent_completed.desc().nullslast(),
                          DldProject.project_name)
            .limit(limit).offset(offset)
        )
    ).scalars().all()
    return {
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "source": OFFICIAL,
        "items": [_project_card(p) for p in rows],
    }


@router.get("/projects/{project_number}")
async def get_project(project_number: str, db: AsyncSession = Depends(get_db)):
    """Official project detail + matched developer profile + (if any) TIER 2
    enrichment returned as a clearly-labelled, separate block."""
    p = (
        await db.execute(select(DldProject).where(DldProject.project_number == project_number))
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    dev = (
        await db.execute(
            select(DldDeveloper).where(DldDeveloper.developer_number == p.developer_number)
        )
    ).scalar_one_or_none() if p.developer_number else None

    enr = (
        await db.execute(
            select(ProjectEnrichment).where(ProjectEnrichment.project_number == project_number)
        )
    ).scalar_one_or_none()

    official = {
        **_project_card(p),
        "project_value_aed": float(p.project_value) if p.project_value is not None else None,
        "escrow_account_number": p.escrow_account_number,
        "project_type": p.project_type,
        "zone": p.zone_en,
        "counts": {"land": p.cnt_land, "building": p.cnt_building, "villa": p.cnt_villa, "unit": p.cnt_unit},
        "timeline": {
            "start": p.start_date.date().isoformat() if p.start_date else None,
            "end": p.end_date.date().isoformat() if p.end_date else None,
            "handover": p.completion_date.date().isoformat() if p.completion_date else None,
            "inspection": p.inspection_date.date().isoformat() if p.inspection_date else None,
        },
        "description": p.description,
    }

    developer = None
    if dev:
        developer = {
            "developer_number": dev.developer_number,
            "developer_name": dev.developer_name,
            "legal_status": dev.legal_status,
            "license_type": dev.license_type,
            "license_number": dev.license_number,
            "webpage": dev.webpage,
            "phone": dev.phone,
            "source": OFFICIAL,
        }

    enrichment = None
    if enr:
        enrichment = {
            "label": INDICATIVE,
            "is_official_source": enr.is_official,
            "enrichment_source": enr.enrichment_source,
            "enrichment_date": enr.enrichment_date.isoformat() if enr.enrichment_date else None,
            "payment_plan": enr.payment_plan,
            "starting_price_aed": float(enr.starting_price_aed) if enr.starting_price_aed is not None else None,
            "price_per_sqft_range": (
                [float(enr.price_per_sqft_min) if enr.price_per_sqft_min is not None else None,
                 float(enr.price_per_sqft_max) if enr.price_per_sqft_max is not None else None]
            ),
            "bedroom_types": enr.bedroom_types,
        }

    return {"official": official, "developer": developer, "enrichment": enrichment}


@router.get("/developers/{developer_number}")
async def get_developer(developer_number: str, db: AsyncSession = Depends(get_db)):
    """Official DLD developer profile + their projects."""
    dev = (
        await db.execute(select(DldDeveloper).where(DldDeveloper.developer_number == developer_number))
    ).scalar_one_or_none()
    if not dev:
        raise HTTPException(status_code=404, detail="Developer not found")
    projects = (
        await db.execute(
            select(DldProject).where(DldProject.developer_number == developer_number)
            .order_by(DldProject.project_name)
        )
    ).scalars().all()
    return {
        "developer": {
            "developer_number": dev.developer_number,
            "developer_name": dev.developer_name,
            "legal_status": dev.legal_status,
            "license_type": dev.license_type,
            "license_number": dev.license_number,
            "license_expiry": dev.license_expiry_date.date().isoformat() if dev.license_expiry_date else None,
            "webpage": dev.webpage,
            "phone": dev.phone,
            "source": OFFICIAL,
        },
        "projects": [_project_card(p) for p in projects],
    }
