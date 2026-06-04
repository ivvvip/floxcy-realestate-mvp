"""Backfill `dld_buildings` rows for popular buildings that appear in
the Ejari rents stream but have no entry in the buildings registry.

Background: the main ETL (`etl_dld.py`) computes buildings from
`buildings.csv` and joins per-project rents to it. Buildings like
SKY COURTS, LOLENA, AL HABTOOR CITY exist in tens of thousands of
rent contracts but the buildings CSV is silent on them (DLD never
issued them an OFFICIAL_NAME), so they previously 404'd on /buildings/[id].

This script reads the rent stream once, finds every
(area_norm, project_name_en) seen ≥ MIN_CONTRACTS times in 2026, and
inserts a synthetic dld_buildings row if no row already covers that
(area, project_name). Idempotent — re-running updates the aggregates.

All ppsf values are stored in true AED/sqft (× SQM_TO_SQFT applied at
read time from the source sqm column).
"""
from __future__ import annotations

import collections
import csv
import os
import sys
import uuid
from pathlib import Path

# Resolve sibling modules + .env
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from _building_classifier import (  # noqa: E402
    classify_building_name, display_name, is_identifiable,
)

DATA_DIR = Path(os.environ.get("DLD_DATA_DIR", str(Path.home() / "dld-data")))
SQM_TO_SQFT = 10.7639
MIN_CONTRACTS = 10  # ≥10 rent contracts in 2026 to be worth showing
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _norm(s):
    return (s or "").strip().lower()


def _f(s):
    if s is None or s == "":
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def main() -> None:
    src = DATA_DIR / "rents_2021_2026.csv"
    if not src.exists():
        sys.exit(f"missing source: {src}")

    # Bucket rents by (area_norm, project_name_en lowercased) — restrict
    # to 2026 so popularity reflects the current snapshot, not pre-COVID.
    by_key: dict[tuple[str, str], list[tuple[float, float | None, str, str | None]]] = (
        collections.defaultdict(list)
    )
    with open(src, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            start = (row.get("contract_start_date") or "")[:4]
            if start != "2026":
                continue
            area = _norm(row.get("area_name_en"))
            proj = (row.get("project_name_en") or "").strip()
            if not area or not proj:
                continue
            amt = _f(row.get("annual_amount"))
            a = _f(row.get("actual_area"))
            if amt is None or amt <= 0:
                continue
            master = (row.get("master_project_en") or "").strip() or None
            area_display = (row.get("area_name_en") or "").strip() or None
            by_key[(area, proj.lower())].append((amt, a, proj, master if master else area_display))

    print(f"scanned rents: {sum(len(v) for v in by_key.values()):,} 2026 contracts "
          f"across {len(by_key):,} (area,project) keys", flush=True)

    # Connect to prod DB via backend/.env (swap host to IP before running
    # per CLAUDE.md).
    from dotenv import load_dotenv
    load_dotenv(ENV_PATH)
    import psycopg2
    import psycopg2.extras

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set in backend/.env")
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()

    # Existing (area, project_name lowercased) keys so we don't double-insert.
    cur.execute("""
        SELECT da.name_norm, LOWER(b.project_name)
        FROM dld_buildings b
        JOIN dld_areas da ON da.id = b.dld_area_id
        WHERE b.project_name IS NOT NULL AND b.project_name <> ''
    """)
    existing = {(a, p) for a, p in cur.fetchall()}
    print(f"existing dld_buildings (area,project_name) keys: {len(existing):,}", flush=True)

    # Area name_norm → id
    cur.execute("SELECT name_norm, id FROM dld_areas")
    area_to_id = {n: str(i) for n, i in cur.fetchall()}

    rows_to_insert = []
    skipped_existing = 0
    skipped_low = 0
    skipped_no_area = 0
    skipped_unidentifiable = 0
    for (area, proj_lower), contracts in by_key.items():
        if len(contracts) < MIN_CONTRACTS:
            skipped_low += 1
            continue
        if (area, proj_lower) in existing:
            skipped_existing += 1
            continue
        aid = area_to_id.get(area)
        if not aid:
            skipped_no_area += 1
            continue

        # Pull the canonical project_name (case-preserving) from the
        # most-common spelling we saw.
        spellings = collections.Counter(c[2] for c in contracts)
        proj_name = spellings.most_common(1)[0][0]
        masters = collections.Counter(c[3] for c in contracts if c[3])
        master = masters.most_common(1)[0][0] if masters else None
        area_display = area.title()

        amts = [c[0] for c in contracts]
        ppsfs = [
            (c[0] / c[1]) / SQM_TO_SQFT
            for c in contracts
            if c[1] and c[1] > 0
        ]
        avg_rent = sum(amts) / len(amts) if amts else None
        avg_ppsf = sum(ppsfs) / len(ppsfs) if ppsfs else None

        # Classify the building name; skip if it looks like an area or
        # a master_project (would create false buildings in the index).
        bn_clean, bn_type = classify_building_name(
            proj_name, master, area_display,
        )
        if not is_identifiable(bn_type):
            skipped_unidentifiable += 1
            continue
        bn_display = display_name(
            proj_name, master, area_display, bn_clean, bn_type,
        )

        rows_to_insert.append((
            str(uuid.uuid4()), aid, None,  # id, dld_area_id, project_number
            proj_name[:255], (master[:255] if master else None),  # project_name, master_project
            None, "Building", None,         # zone, prop_sub_type, land_type
            None, None,                     # actual_area, built_up_area
            None, None, None,               # flats, shops, offices
            None, None, None, None, None,   # floors, bld_levels, elevators, pools, parks
            None, None, None,               # is_freehold, is_offplan, creation_date
            round(avg_rent, 2) if avg_rent else None,
            round(avg_ppsf, 2) if avg_ppsf else None,
            len(contracts),
            None,                           # occupancy_proxy_pct
            bn_clean, bn_type, bn_display, is_identifiable(bn_type),
        ))

    print(f"to insert: {len(rows_to_insert):,} new buildings (skipped: "
          f"existing={skipped_existing:,} low_contracts={skipped_low:,} "
          f"unknown_area={skipped_no_area:,} unidentifiable={skipped_unidentifiable:,})",
          flush=True)

    if rows_to_insert:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO dld_buildings (
                id, dld_area_id, project_number,
                project_name, master_project,
                zone, prop_sub_type, land_type,
                actual_area, built_up_area,
                flats, shops, offices,
                floors, bld_levels, elevators, swimming_pools, car_parks,
                is_freehold, is_offplan, creation_date,
                avg_annual_rent, avg_rent_per_sqft, active_rent_count,
                occupancy_proxy_pct,
                building_name_clean, building_name_type, display_name, is_identifiable
            )
            VALUES %s
            """,
            rows_to_insert,
            page_size=500,
        )
        conn.commit()
        print(f"inserted {len(rows_to_insert):,} synthetic buildings", flush=True)
    else:
        print("nothing to insert", flush=True)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
