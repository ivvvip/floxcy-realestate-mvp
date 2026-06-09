"""Official DLD off-plan registry API (Phase 3, TIER 1).

Surfaces dld_projects / dld_developers verbatim from the DLD registry, always
tagged `"source": "DLD Official"`. The TIER 2 project_enrichment block (payment
plans, indicative prices) is returned SEPARATELY and only when present, tagged
`"label": "ℹ️ Market data (indicative)"` so investors never confuse the two.

Developer endpoints are PROJECT-DRIVEN: the developers CSV (dld_developers, 133
rows) only matches ~3 of the 255 project developers by number, so the directory
and developer pages aggregate from dld_projects (developer_name + number are on
all 255 rows) and LEFT JOIN dld_developers for license/contact where it exists.

Project detail also layers the transaction-derived off-plan-vs-ready price
context (area-level, from dld_buildings_sales) on top of the official fields.
"""
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld import DldArea, DldBuildingsSales
from app.models.dld_project import DldDeveloper, DldProject, ProjectEnrichment

router = APIRouter(
    prefix="/api/v1/dld/official",
    tags=["dld-official"],
    dependencies=[Depends(rate_limit_dependency)],
)

OFFICIAL = "✅ Official DLD Data"
INDICATIVE = "ℹ️ Market data (indicative)"


def _f(v) -> Optional[float]:
    return float(v) if v is not None else None


def _project_card(p: DldProject) -> dict:
    """Lean card for lists. Display name is project_name (master_project is
    only populated on 2/255 rows). expected_handover is END_DATE (planned,
    255/255) — completion_date is the ACTUAL handover and is nearly always
    absent for these freshly-registered projects."""
    return {
        "project_number": p.project_number,
        "project_name": p.project_name,
        "developer_number": p.developer_number,
        "developer_name": p.developer_name,
        "project_status": p.project_status,
        "percent_completed": _f(p.percent_completed),
        "has_escrow": p.escrow_account_number is not None,
        "expected_handover": p.end_date.date().isoformat() if p.end_date else None,
        "handover_date": p.completion_date.date().isoformat() if p.completion_date else None,
        "area": p.area_en,
        "area_name_norm": p.area_name_norm,
        "unit_count": p.cnt_unit,
        "project_value_aed": _f(p.project_value),
        "source": OFFICIAL,
    }


@router.get("/projects")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None, description="ACTIVE | PENDING | PENDING_COMING_SOON"),
    area: Optional[str] = Query(None, description="area_name_norm (lowercased AREA_EN)"),
    developer_number: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="search project / developer / master-project name"),
    limit: int = Query(40, ge=1, le=300),
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


async def _area_price_context(db: AsyncSession, area_name_norm: Optional[str]) -> Optional[dict]:
    """Best-effort transaction-derived off-plan-vs-ready ppsf for the project's
    area, matched on dld_areas.name_norm. Returns None when the area can't be
    matched or has no comparable sales — honest absence, never a fabricated
    number."""
    if not area_name_norm:
        return None
    area_id = (
        await db.execute(select(DldArea.id).where(DldArea.name_norm == area_name_norm))
    ).scalar_one_or_none()
    if not area_id:
        return None
    row = (
        await db.execute(
            select(
                func.avg(DldBuildingsSales.avg_ppsf_offplan),
                func.avg(DldBuildingsSales.avg_ppsf_ready),
                func.count(DldBuildingsSales.id).filter(DldBuildingsSales.avg_ppsf_offplan.is_not(None)),
                func.count(DldBuildingsSales.id).filter(DldBuildingsSales.avg_ppsf_ready.is_not(None)),
            ).where(DldBuildingsSales.dld_area_id == area_id)
        )
    ).first()
    if not row:
        return None
    avg_off, avg_ready, n_off, n_ready = row
    if not (avg_off or avg_ready):
        return None
    delta = None
    if avg_off and avg_ready and float(avg_off) > 0:
        delta = round((float(avg_ready) - float(avg_off)) / float(avg_off) * 100, 1)
    return {
        "avg_ppsf_offplan": _f(avg_off),
        "avg_ppsf_ready": _f(avg_ready),
        "delta_pct": delta,
        "sample_offplan_sales": int(n_off or 0),
        "sample_ready_sales": int(n_ready or 0),
        "source": "Derived from DLD transactions (area-level off-plan vs ready ppsf)",
    }


@router.get("/projects/{project_number}")
async def get_project(project_number: str, db: AsyncSession = Depends(get_db)):
    """Official project detail + matched developer profile + area-level off-plan
    vs ready price context + (if any) TIER 2 enrichment as a clearly-labelled,
    separate block."""
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

    maps_q = ", ".join(x for x in [p.project_name, p.area_en, "Dubai"] if x)
    official = {
        **_project_card(p),
        "escrow_account_number": p.escrow_account_number,
        "project_type": p.project_type,
        "zone": p.zone_en,
        "master_project": p.master_project,
        "description": p.description,
        "counts": {"land": p.cnt_land, "building": p.cnt_building, "villa": p.cnt_villa, "unit": p.cnt_unit},
        "timeline": {
            "start": p.start_date.date().isoformat() if p.start_date else None,
            "end": p.end_date.date().isoformat() if p.end_date else None,
            "handover": p.completion_date.date().isoformat() if p.completion_date else None,
            "inspection": p.inspection_date.date().isoformat() if p.inspection_date else None,
        },
        "google_maps_url": f"https://www.google.com/maps/search/?api=1&query={maps_q.replace(' ', '+')}" if maps_q else None,
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
            "starting_price_aed": _f(enr.starting_price_aed),
            "price_per_sqft_range": [_f(enr.price_per_sqft_min), _f(enr.price_per_sqft_max)],
            "bedroom_types": enr.bedroom_types,
        }

    price_context = await _area_price_context(db, p.area_name_norm)

    return {
        "official": official,
        "developer": developer,
        "price_context": price_context,
        "enrichment": enrichment,
    }


def _developer_track_record(projects: list[DldProject]) -> dict:
    """Aggregate a developer's project portfolio into a real track record —
    counts, total declared value, completion mix, areas. No fabricated score."""
    areas = [p.area_en for p in projects if p.area_en]
    top_areas = [a for a, _ in Counter(areas).most_common(5)]
    pcts = [float(p.percent_completed) for p in projects if p.percent_completed is not None]
    total_value = sum(float(p.project_value) for p in projects if p.project_value is not None)
    return {
        "project_count": len(projects),
        "active_count": sum(1 for p in projects if p.project_status == "ACTIVE"),
        "pending_count": sum(1 for p in projects if (p.project_status or "").startswith("PENDING")),
        "total_units": sum(int(p.cnt_unit) for p in projects if p.cnt_unit is not None),
        "total_value_aed": total_value or None,
        "avg_percent_completed": round(sum(pcts) / len(pcts), 1) if pcts else None,
        "areas_served": len(set(areas)),
        "top_areas": top_areas,
    }


@router.get("/developers")
async def list_developers(
    db: AsyncSession = Depends(get_db),
    q: Optional[str] = Query(None, description="search developer name"),
    sort: str = Query("projects", description="projects | value | units | name"),
    limit: int = Query(60, ge=1, le=300),
    offset: int = Query(0, ge=0),
):
    """Official developer directory, aggregated from dld_projects (authoritative
    developer attribution on all 255 projects) and enriched with dld_developers
    license/legal status where the developer_number matches."""
    projects = (await db.execute(select(DldProject))).scalars().all()
    licensed = {
        d.developer_number: d
        for d in (await db.execute(select(DldDeveloper))).scalars().all()
    }

    by_dev: dict[str, list[DldProject]] = {}
    names: dict[str, str] = {}
    for p in projects:
        key = p.developer_number or (p.developer_name or "").lower()
        if not key:
            continue
        by_dev.setdefault(key, []).append(p)
        if p.developer_name:
            names[key] = p.developer_name

    cards = []
    for key, devs in by_dev.items():
        tr = _developer_track_record(devs)
        lic = licensed.get(key)
        cards.append({
            "developer_number": key,
            "developer_name": names.get(key, key),
            **tr,
            "has_license_record": lic is not None,
            "legal_status": lic.legal_status if lic else None,
            "license_type": lic.license_type if lic else None,
            "source": OFFICIAL,
        })

    if q:
        ql = q.strip().lower()
        cards = [c for c in cards if ql in c["developer_name"].lower()]

    keyfn = {
        "value": lambda c: c["total_value_aed"] or 0,
        "units": lambda c: c["total_units"],
        "name": lambda c: c["developer_name"].lower(),
    }.get(sort, lambda c: c["project_count"])
    cards.sort(key=keyfn, reverse=(sort != "name"))

    total = len(cards)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "source": OFFICIAL,
        "items": cards[offset:offset + limit],
    }


@router.get("/developers/{developer_number}")
async def get_developer(developer_number: str, db: AsyncSession = Depends(get_db)):
    """Official developer profile + their projects + track record. Project-driven:
    works for every developer that has projects, whether or not a dld_developers
    license row exists for them."""
    projects = (
        await db.execute(
            select(DldProject).where(DldProject.developer_number == developer_number)
            .order_by(DldProject.percent_completed.desc().nullslast(), DldProject.project_name)
        )
    ).scalars().all()
    if not projects:
        raise HTTPException(status_code=404, detail="Developer not found")

    dev = (
        await db.execute(select(DldDeveloper).where(DldDeveloper.developer_number == developer_number))
    ).scalar_one_or_none()

    name = (dev.developer_name if dev else None) or projects[0].developer_name or developer_number
    profile = {
        "developer_number": developer_number,
        "developer_name": name,
        "has_license_record": dev is not None,
        "legal_status": dev.legal_status if dev else None,
        "license_type": dev.license_type if dev else None,
        "license_number": dev.license_number if dev else None,
        "license_expiry": dev.license_expiry_date.date().isoformat() if dev and dev.license_expiry_date else None,
        "registration_date": dev.registration_date.date().isoformat() if dev and dev.registration_date else None,
        "webpage": dev.webpage if dev else None,
        "phone": dev.phone if dev else None,
        "source": OFFICIAL,
    }
    return {
        "developer": profile,
        "track_record": _developer_track_record(projects),
        "projects": [_project_card(p) for p in projects],
    }
