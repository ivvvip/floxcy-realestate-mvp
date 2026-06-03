"""Developer directory + detail.

There is no published `dld_developers` table in the DLD open dataset, so
this route derives developer entities from `dld_buildings.master_project`
prefixes against a curated brand list (Emaar, Sobha, Damac, Nakheel,
Meraas, Aldar, etc.). Only verifiable fields are exposed — there is no
attempt to fabricate completion %, escrow status, or RERA approval,
because that data is not in any table we own.

Track-record score weights real signals only: project count, total
units, areas served, and (where available) total AED value from
`dld_buildings_sales`.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld import DldArea, DldBuilding


router = APIRouter(
    prefix="/api/v1/developers",
    tags=["developers"],
    dependencies=[Depends(rate_limit_dependency)],
)


# Curated brand list. Order matters: longer/more-specific prefixes first
# so "DUBAI PROPERTIES" beats "DUBAI" and "DAMAC HILLS" beats "DAMAC".
# Each entry is (brand_slug, display_name, prefix_matches).
DEVELOPER_BRANDS: list[tuple[str, str, tuple[str, ...]]] = [
    ("emaar", "Emaar Properties", ("EMAAR",)),
    ("nakheel", "Nakheel", ("NAKHEEL",)),
    ("sobha", "Sobha Realty", ("SOBHA",)),
    ("damac", "Damac Properties", ("DAMAC",)),
    ("meraas", "Meraas", ("MERAAS",)),
    ("aldar", "Aldar Properties", ("ALDAR",)),
    ("dubai-properties", "Dubai Properties", ("DUBAI PROPERTIES",)),
    ("dubai-holding", "Dubai Holding", ("DUBAI HOLDING",)),
    ("azizi", "Azizi Developments", ("AZIZI",)),
    ("omniyat", "Omniyat", ("OMNIYAT",)),
    ("ellington", "Ellington Properties", ("ELLINGTON",)),
    ("binghatti", "Binghatti Developers", ("BINGHATTI",)),
    ("deyaar", "Deyaar Development", ("DEYAAR",)),
    ("danube", "Danube Properties", ("DANUBE",)),
    ("union-properties", "Union Properties", ("UNION PROPERTIES",)),
    ("samana", "Samana Developers", ("SAMANA",)),
    ("select-group", "Select Group", ("SELECT GROUP",)),
    ("tiger-group", "Tiger Group", ("TIGER GROUP", "TIGER ")),
    ("reportage", "Reportage Properties", ("REPORTAGE",)),
    ("g-and-co", "G&Co Properties", ("G&CO", "G & CO")),
    ("imkan", "Imkan Properties", ("IMKAN",)),
    ("mag", "MAG Property Development", ("MAG ",)),
    ("nshama", "Nshama", ("NSHAMA",)),
    ("dar-al-arkan", "Dar Al Arkan", ("DAR AL ARKAN",)),
    ("arada", "Arada", ("ARADA",)),
    ("seven-tides", "Seven Tides", ("SEVEN TIDES",)),
    ("the-first-group", "The First Group", ("FIRST GROUP",)),
    ("burj-khalifa", "Emaar Properties", ("BURJ KHALIFA", "DOWNTOWN")),  # downtown is Emaar's master
]


def _detect_brand(master_project: Optional[str]) -> tuple[str, str]:
    """Return (slug, display_name). Falls back to 'other' for anything
    that doesn't match a known brand prefix."""
    if not master_project:
        return ("other", "Independent / Unbranded")
    mp = master_project.strip().upper()
    for slug, name, prefixes in DEVELOPER_BRANDS:
        for p in prefixes:
            if mp.startswith(p):
                return (slug, name)
    return ("other", "Independent / Unbranded")


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class DeveloperCard(BaseModel):
    slug: str
    name: str
    total_projects: int
    offplan_projects: int
    total_units: int
    areas_served: int
    total_value_aed: Optional[float] = None
    earliest_year: Optional[int] = None
    track_record_score: float
    track_record_label: str
    top_areas: list[str]


class DevelopersListResponse(BaseModel):
    total: int
    items: list[DeveloperCard]
    data_source: str = "Derived from DLD buildings master_project clustering. Brand detection is heuristic — Floxcy never claims developer identity verification."
    coverage_note: str = (
        "DLD does not publish a developer master list. Brand attribution is "
        "inferred from master_project prefixes against a curated brand list. "
        "Buildings whose master_project does not match are bucketed as 'Independent / Unbranded'."
    )


class DeveloperProjectRow(BaseModel):
    project_slug: str
    master_project: str
    area_name: Optional[str]
    buildings_count: int
    total_units: int
    is_offplan: bool
    earliest_year: Optional[int]
    latest_year: Optional[int]
    avg_ppsf: Optional[float]


class DeveloperDetail(BaseModel):
    slug: str
    name: str
    summary: DeveloperCard
    projects: list[DeveloperProjectRow]
    data_source: str = "Derived from dld_buildings + dld_buildings_sales."


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

async def _aggregate_developers(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """Walk dld_buildings, group by detected brand, return raw stats per
    developer (no scoring yet)."""
    rows = (
        await db.execute(
            select(
                DldBuilding.master_project,
                DldBuilding.project_number,
                DldBuilding.project_name,
                DldBuilding.flats,
                DldBuilding.is_offplan,
                DldBuilding.creation_date,
                DldBuilding.dld_area_id,
                DldArea.name_display,
            )
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
        )
    ).all()

    agg: dict[str, dict[str, Any]] = {}
    for mp, pnum, pname, flats, is_offplan, cdate, area_id, area_name in rows:
        slug, name = _detect_brand(mp)
        bucket = agg.setdefault(slug, {
            "slug": slug, "name": name,
            "master_projects": set(),
            "offplan_master_projects": set(),
            "areas": set(),
            "area_names": [],
            "units": 0,
            "years": [],
            "buildings": 0,
        })
        bucket["buildings"] += 1
        if mp:
            bucket["master_projects"].add(mp.strip())
            if is_offplan:
                bucket["offplan_master_projects"].add(mp.strip())
        if flats:
            bucket["units"] += int(flats)
        if area_id:
            bucket["areas"].add(area_id)
        if area_name:
            bucket["area_names"].append(area_name)
        if cdate:
            bucket["years"].append(cdate.year)
    return agg


def _score(stats: dict[str, Any], max_units: int, max_projects: int) -> float:
    """0-100 track-record score from real signals only.

    Weights: 40 % project count, 30 % unit volume, 20 % area diversity,
    10 % longevity (years of activity).
    """
    if max_projects <= 0 or max_units <= 0:
        return 0.0
    projects = len(stats["master_projects"])
    units = stats["units"]
    areas = len(stats["areas"])
    years = stats["years"]
    longevity = 0.0
    if years:
        span = max(years) - min(years)
        longevity = min(1.0, span / 25.0)
    # log-scale for fairness — a few mega-developers shouldn't crush the rest.
    proj_norm = math.log1p(projects) / math.log1p(max_projects)
    units_norm = math.log1p(units) / math.log1p(max_units)
    areas_norm = min(1.0, areas / 20.0)
    raw = 0.40 * proj_norm + 0.30 * units_norm + 0.20 * areas_norm + 0.10 * longevity
    return round(min(100.0, max(0.0, raw * 100)), 1)


def _score_label(score: float) -> str:
    if score >= 90:
        return "Exceptional"
    if score >= 75:
        return "Excellent"
    if score >= 60:
        return "Good"
    if score >= 40:
        return "Average"
    return "Limited track record"


def _top_areas(area_names: list[str], n: int = 3) -> list[str]:
    counts = Counter([a for a in area_names if a])
    return [a for a, _ in counts.most_common(n)]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=DevelopersListResponse)
async def list_developers(
    db: AsyncSession = Depends(get_db),
    sort: Literal["projects", "units", "score", "name"] = Query("score"),
    limit: int = Query(50, ge=1, le=100),
) -> DevelopersListResponse:
    agg = await _aggregate_developers(db)
    if not agg:
        return DevelopersListResponse(total=0, items=[])

    max_units = max((b["units"] for b in agg.values()), default=1)
    max_projects = max((len(b["master_projects"]) for b in agg.values()), default=1)

    cards: list[DeveloperCard] = []
    for stats in agg.values():
        proj_count = len(stats["master_projects"])
        if proj_count == 0:
            continue
        score = _score(stats, max_units, max_projects)
        cards.append(DeveloperCard(
            slug=stats["slug"],
            name=stats["name"],
            total_projects=proj_count,
            offplan_projects=len(stats["offplan_master_projects"]),
            total_units=int(stats["units"]),
            areas_served=len(stats["areas"]),
            total_value_aed=None,
            earliest_year=min(stats["years"]) if stats["years"] else None,
            track_record_score=score,
            track_record_label=_score_label(score),
            top_areas=_top_areas(stats["area_names"]),
        ))

    if sort == "projects":
        cards.sort(key=lambda c: c.total_projects, reverse=True)
    elif sort == "units":
        cards.sort(key=lambda c: c.total_units, reverse=True)
    elif sort == "name":
        cards.sort(key=lambda c: c.name.lower())
    else:  # score
        cards.sort(key=lambda c: c.track_record_score, reverse=True)

    return DevelopersListResponse(total=len(cards), items=cards[:limit])


@router.get("/{slug}", response_model=DeveloperDetail)
async def get_developer(
    slug: str,
    db: AsyncSession = Depends(get_db),
    projects_limit: int = Query(50, ge=1, le=200),
) -> DeveloperDetail:
    agg = await _aggregate_developers(db)
    stats = agg.get(slug.lower())
    if not stats:
        raise HTTPException(404, f"Developer '{slug}' not found")

    max_units = max((b["units"] for b in agg.values()), default=1)
    max_projects = max((len(b["master_projects"]) for b in agg.values()), default=1)
    score = _score(stats, max_units, max_projects)

    summary = DeveloperCard(
        slug=stats["slug"],
        name=stats["name"],
        total_projects=len(stats["master_projects"]),
        offplan_projects=len(stats["offplan_master_projects"]),
        total_units=int(stats["units"]),
        areas_served=len(stats["areas"]),
        total_value_aed=None,
        earliest_year=min(stats["years"]) if stats["years"] else None,
        track_record_score=score,
        track_record_label=_score_label(score),
        top_areas=_top_areas(stats["area_names"]),
    )

    # Pull per-project aggregates for this developer
    rows = (
        await db.execute(
            select(
                DldBuilding.master_project,
                DldArea.name_display,
                func.count(DldBuilding.id).label("bld_count"),
                func.coalesce(func.sum(DldBuilding.flats), 0).label("units"),
                func.bool_or(DldBuilding.is_offplan).label("any_offplan"),
                func.min(func.extract("year", DldBuilding.creation_date)).label("y_min"),
                func.max(func.extract("year", DldBuilding.creation_date)).label("y_max"),
            )
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
            .group_by(DldBuilding.master_project, DldArea.name_display)
        )
    ).all()

    projects: list[DeveloperProjectRow] = []
    for mp, area, bld_count, units, any_offplan, y_min, y_max in rows:
        if _detect_brand(mp)[0] != slug.lower():
            continue
        if not mp:
            continue
        projects.append(DeveloperProjectRow(
            project_slug=_slugify(mp),
            master_project=mp,
            area_name=area,
            buildings_count=int(bld_count or 0),
            total_units=int(units or 0),
            is_offplan=bool(any_offplan),
            earliest_year=int(y_min) if y_min else None,
            latest_year=int(y_max) if y_max else None,
            avg_ppsf=None,
        ))

    projects.sort(key=lambda p: (not p.is_offplan, -p.total_units))
    return DeveloperDetail(
        slug=slug,
        name=stats["name"],
        summary=summary,
        projects=projects[:projects_limit],
    )
