"""Developer directory + detail.

There is no published `dld_developers` table in the DLD open dataset, so
this route derives developer entities from
`dld_buildings_sales.master_project_en` prefixes against a curated
brand list (Emaar, Sobha, Damac, Nakheel, Meraas, Aldar, etc.). Only
verifiable fields are exposed — there is no attempt to fabricate
completion %, escrow status, or RERA approval.

Track-record score weights real signals only: project count, sale
volume (transactions), areas served, and longevity.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld import DldArea, DldBuilding, DldBuildingsSales


router = APIRouter(
    prefix="/api/v1/developers",
    tags=["developers"],
    dependencies=[Depends(rate_limit_dependency)],
)


# Order matters: longer/more-specific prefixes first.
DEVELOPER_BRANDS: list[tuple[str, str, tuple[str, ...]]] = [
    # Emaar must come first — many of its masterplans don't carry the
    # word "EMAAR" (Downtown, Arabian Ranches, Dubai Hills, Dubai Creek,
    # Emirates Hills) so we route them via their masterplan names. All
    # variants share the same slug so the directory shows one Emaar card.
    ("emaar", "Emaar Properties", (
        "EMAAR",
        "DOWNTOWN",
        "ARABIAN RANCHES",
        "DUBAI HILLS",
        "DUBAI CREEK",
        "EMIRATES HILLS",
        "BEACHFRONT",
        "ADDRESS RES",
        "ADDRESS HILL",
        "ADDRESS HARB",
        "ADDRESS BOUL",
        "ADDRESS DOWN",
        "VIDA RES",
        "VIDA HILL",
        "VIDA DUBAI",
        "BURJ KHALIFA",
        "OPERA DISTRICT",
        "GRANDE",
    )),
    ("nakheel", "Nakheel", ("NAKHEEL", "PALM JUMEIRAH", "PALM JEBEL")),
    ("sobha", "Sobha Realty", ("SOBHA",)),
    ("damac", "Damac Properties", ("DAMAC",)),
    ("meraas", "Meraas", ("MERAAS", "BLUEWATERS", "CITY WALK", "LA MER")),
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
    ("tiger-group", "Tiger Group", ("TIGER GROUP",)),
    ("reportage", "Reportage Properties", ("REPORTAGE",)),
    ("imkan", "Imkan Properties", ("IMKAN",)),
    ("mag", "MAG Property Development", ("MAG ",)),
    ("nshama", "Nshama", ("NSHAMA", "TOWN SQUARE")),
    ("arada", "Arada", ("ARADA",)),
    ("seven-tides", "Seven Tides", ("SEVEN TIDES",)),
]


def _detect_brand(master_project: Optional[str]) -> tuple[str, str]:
    """Return (slug, display_name). 'other' bucket for unmatched names."""
    if not master_project:
        return ("other", "Independent / Unbranded")
    mp = master_project.strip().upper()
    for slug, name, prefixes in DEVELOPER_BRANDS:
        for p in prefixes:
            if p in mp:
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
    data_source: str = "Derived from dld_buildings_sales master_project_en clustering. Brand attribution is heuristic — Floxcy never sells verification badges."
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
    data_source: str = "Derived from dld_buildings_sales."


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def _detect_brand_multi(*candidates: Optional[str]) -> tuple[str, str]:
    """Try each candidate string in order and return the first hit.
    Lets us route a building when the brand lives in project_name even
    if master_project is a generic area name."""
    for c in candidates:
        slug, name = _detect_brand(c)
        if slug != "other":
            return slug, name
    return ("other", "Independent / Unbranded")


async def _aggregate_developers(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """Build the developer roll-up from two complementary tables:

      - dld_buildings_sales — transactions-side, has clean master_project_en
        + the offplan vs ready price split, but master_project is mostly
        area names (Business Bay, JVC) so brand signal is weak there.
      - dld_buildings — published DLD buildings registry, smaller but
        carries project_name strings like "DAMAC HILLS (2) - CAMELIA"
        and "Address Hillcrest" where the brand IS in the project name.

    Brand detection runs against (master_project_en, building_name_en)
    for sales rows and (project_name, master_project) for buildings rows.
    Buildings that route to the same brand slug collapse into one card.
    """
    agg: dict[str, dict[str, Any]] = {}

    def _bucket(slug: str, name: str) -> dict[str, Any]:
        return agg.setdefault(slug, {
            "slug": slug, "name": name,
            "master_projects": set(),
            "offplan_master_projects": set(),
            "areas": set(),
            "area_names": [],
            "units": 0,
            "years": [],
            "buildings": 0,
        })

    # ---- 1. Transactions-side rows ---------------------------------------
    sales_rows = (
        await db.execute(
            select(
                DldBuildingsSales.master_project_en,
                DldBuildingsSales.building_name_en,
                DldBuildingsSales.area_name_en,
                DldBuildingsSales.dld_area_id,
                DldBuildingsSales.total_transactions,
                DldBuildingsSales.avg_ppsf_offplan,
                DldBuildingsSales.avg_sale_price_offplan,
                DldBuildingsSales.first_seen_year,
                DldBuildingsSales.last_seen_year,
            )
        )
    ).all()

    for (
        mp, bld_name, area_name, area_id, total_txn,
        avg_ppsf_off, avg_price_off, first_year, last_year,
    ) in sales_rows:
        slug, name = _detect_brand_multi(mp, bld_name)
        bucket = _bucket(slug, name)
        bucket["buildings"] += 1
        # Project key: master_project_en if it routed; else the building
        # name (so a branded "AZIZI MINA" still counts as a project).
        proj_key = (mp or bld_name or "").strip()
        if proj_key:
            bucket["master_projects"].add(proj_key)
            if avg_ppsf_off is not None or avg_price_off is not None:
                bucket["offplan_master_projects"].add(proj_key)
        if total_txn:
            bucket["units"] += int(total_txn)
        if area_id:
            bucket["areas"].add(area_id)
        if area_name:
            bucket["area_names"].append(area_name)
        if first_year:
            bucket["years"].append(int(first_year))
        if last_year:
            bucket["years"].append(int(last_year))

    # ---- 2. Published buildings registry rows ----------------------------
    bld_rows = (
        await db.execute(
            select(
                DldBuilding.project_name,
                DldBuilding.master_project,
                DldArea.name_display,
                DldBuilding.dld_area_id,
                DldBuilding.flats,
                DldBuilding.is_offplan,
                DldBuilding.creation_date,
            )
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
        )
    ).all()

    for pn, mp, area_name, area_id, flats, is_offplan, cdate in bld_rows:
        slug, name = _detect_brand_multi(pn, mp)
        if slug == "other":
            continue  # don't duplicate the unbranded bucket from sales side
        bucket = _bucket(slug, name)
        bucket["buildings"] += 1
        # Project key prefers project_name (richer) over master_project
        proj_key = (pn or mp or "").strip()
        if proj_key:
            bucket["master_projects"].add(proj_key)
            if is_offplan:
                bucket["offplan_master_projects"].add(proj_key)
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
        # Skip the catch-all bucket from the directory — it's mostly
        # area names being recorded as master_project ("Business Bay"),
        # not real developer projects. Detail endpoint still resolves
        # 'other' for completeness.
        if stats["slug"] == "other":
            continue
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
    else:
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

    # Build per-project rows by pulling raw rows from both tables and
    # grouping in Python by detected brand — mirrors the aggregation
    # logic and handles the case where the brand lives in building_name
    # rather than master_project.
    by_proj: dict[str, dict[str, Any]] = {}

    sales_rows = (
        await db.execute(
            select(
                DldBuildingsSales.master_project_en,
                DldBuildingsSales.building_name_en,
                DldBuildingsSales.area_name_en,
                DldBuildingsSales.total_transactions,
                DldBuildingsSales.avg_ppsf_offplan,
                DldBuildingsSales.avg_ppsf_ready,
                DldBuildingsSales.avg_sale_price_offplan,
                DldBuildingsSales.first_seen_year,
                DldBuildingsSales.last_seen_year,
            )
        )
    ).all()
    for (
        mp, bld_name, area, total_txn, avg_off, avg_ready, avg_price_off,
        y_first, y_last,
    ) in sales_rows:
        b_slug, _ = _detect_brand_multi(mp, bld_name)
        if b_slug != slug.lower():
            continue
        proj_key = (mp or bld_name or "").strip()
        if not proj_key:
            continue
        entry = by_proj.setdefault(proj_key, {
            "master_project": proj_key,
            "area_name": area,
            "buildings_count": 0,
            "total_units": 0,
            "is_offplan": False,
            "years": [],
            "avg_ppsf_sum": 0.0,
            "avg_ppsf_n": 0,
        })
        entry["buildings_count"] += 1
        entry["total_units"] += int(total_txn or 0)
        if avg_off is not None or avg_price_off is not None:
            entry["is_offplan"] = True
        if y_first:
            entry["years"].append(int(y_first))
        if y_last:
            entry["years"].append(int(y_last))
        if avg_ready is not None:
            entry["avg_ppsf_sum"] += float(avg_ready)
            entry["avg_ppsf_n"] += 1

    bld_rows = (
        await db.execute(
            select(
                DldBuilding.project_name,
                DldBuilding.master_project,
                DldArea.name_display,
                DldBuilding.flats,
                DldBuilding.is_offplan,
                DldBuilding.creation_date,
            )
            .outerjoin(DldArea, DldArea.id == DldBuilding.dld_area_id)
        )
    ).all()
    for pn, mp, area_name, flats, is_offplan, cdate in bld_rows:
        b_slug, _ = _detect_brand_multi(pn, mp)
        if b_slug != slug.lower():
            continue
        proj_key = (pn or mp or "").strip()
        if not proj_key:
            continue
        entry = by_proj.setdefault(proj_key, {
            "master_project": proj_key,
            "area_name": area_name,
            "buildings_count": 0,
            "total_units": 0,
            "is_offplan": False,
            "years": [],
            "avg_ppsf_sum": 0.0,
            "avg_ppsf_n": 0,
        })
        entry["buildings_count"] += 1
        entry["total_units"] += int(flats or 0)
        if is_offplan:
            entry["is_offplan"] = True
        if cdate:
            entry["years"].append(cdate.year)

    projects: list[DeveloperProjectRow] = []
    for proj_key, e in by_proj.items():
        avg_ppsf = (e["avg_ppsf_sum"] / e["avg_ppsf_n"]) if e["avg_ppsf_n"] else None
        projects.append(DeveloperProjectRow(
            project_slug=_slugify(proj_key),
            master_project=proj_key,
            area_name=e["area_name"],
            buildings_count=e["buildings_count"],
            total_units=e["total_units"],
            is_offplan=e["is_offplan"],
            earliest_year=min(e["years"]) if e["years"] else None,
            latest_year=max(e["years"]) if e["years"] else None,
            avg_ppsf=avg_ppsf,
        ))

    projects.sort(key=lambda p: (not p.is_offplan, -p.total_units))
    return DeveloperDetail(
        slug=slug,
        name=stats["name"],
        summary=summary,
        projects=projects[:projects_limit],
    )
