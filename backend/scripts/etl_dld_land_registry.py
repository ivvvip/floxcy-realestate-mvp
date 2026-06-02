"""DLD land registry ETL → dld_land_registry + dld_area_land_summary.

Side effects:
  1. Streams the 259k-row parcel export, writes into dld_land_registry
  2. Aggregates per-area via SQL into dld_area_land_summary
  3. UPDATEs dld_canonical_areas.area_name_ar using the (free!) Arabic
     names that live in this file
  4. Re-exports data/areas.json so the frontend sees the Arabic
     translations immediately

Run:
    python scripts/etl_dld_land_registry.py            # dry-run summary
    python scripts/etl_dld_land_registry.py --to-db    # write to Postgres
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Optional

csv.field_size_limit(sys.maxsize)

HOME = Path.home()
SRC = HOME / "dld-data" / "land_registry.csv"
OUT_JSON = Path(__file__).resolve().parent.parent.parent / "data" / "areas.json"


# ---------------------------------------------------------------------------
# Stream
# ---------------------------------------------------------------------------

def _bool(s: str | None) -> Optional[bool]:
    if s is None:
        return None
    s = s.strip()
    if s in ("1", "1.00", "true", "True", "yes"):
        return True
    if s in ("0", "0.00", "false", "False", "no"):
        return False
    return None


def _norm_area(s: str | None) -> Optional[str]:
    if not s:
        return None
    return s.strip().lower() or None


def _f(s: str | None) -> Optional[float]:
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def stream(path: Path, progress_every: int = 50_000):
    print(f"Streaming {path}", flush=True)
    n, kept = 0, 0
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            n += 1
            if n % progress_every == 0:
                print(f"  [{n:>8,} scanned · {kept:>8,} kept]", flush=True)
            area_norm = _norm_area(row.get("area_name_en"))
            if not area_norm:
                continue
            prop_id = (row.get("property_id") or "").strip()
            if not prop_id:
                continue
            kept += 1
            yield (prop_id, area_norm, row)
    print(f"  [DONE · {n:,} scanned · {kept:,} kept]", flush=True)


def collect_arabic_names(rows_iter) -> dict[str, str]:
    """As a side-effect of streaming once, collect canonical Arabic name
    per area (first non-empty seen)."""
    # NB this consumer is called separately; the actual streaming runs in
    # write_to_db. This helper is for the dry-run path.
    arabic: dict[str, str] = {}
    for _, area_norm, row in rows_iter:
        if area_norm in arabic:
            continue
        ar = (row.get("area_name_ar") or "").strip()
        if ar:
            arabic[area_norm] = ar
    return arabic


# ---------------------------------------------------------------------------
# Postgres
# ---------------------------------------------------------------------------

def get_sync_db_url() -> str:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


def write_to_db(path: Path, batch_size: int = 5000) -> dict:
    """Stream + insert + derive + update + return summary."""
    import psycopg2
    import psycopg2.extras

    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    arabic_by_area: dict[str, str] = {}
    inserted = 0
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dld_land_registry")
            cur.execute("DELETE FROM dld_area_land_summary")

            batch: list[tuple] = []

            def flush():
                nonlocal inserted
                if not batch:
                    return
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dld_land_registry (
                        id, property_id, area_name_norm, area_name_en, area_name_ar,
                        zone_id, land_number, land_sub_number, parcel_id,
                        actual_area_sqm, property_type_en, property_sub_type_en,
                        land_type_en, is_free_hold, is_registered,
                        pre_registration_number, project_name_en, master_project_en
                    ) VALUES %s
                    """,
                    batch,
                    page_size=batch_size,
                )
                inserted += len(batch)
                batch.clear()

            for prop_id, area_norm, row in stream(path):
                ar = (row.get("area_name_ar") or "").strip()
                if ar and area_norm not in arabic_by_area:
                    arabic_by_area[area_norm] = ar
                batch.append((
                    str(uuid.uuid4()),
                    prop_id,
                    area_norm,
                    (row.get("area_name_en") or "").strip() or None,
                    ar or None,
                    (row.get("zone_id") or "").strip() or None,
                    (row.get("land_number") or "").strip() or None,
                    (row.get("land_sub_number") or "").strip() or None,
                    (row.get("parcel_id") or "").strip() or None,
                    _f(row.get("actual_area")),
                    (row.get("property_type_en") or "").strip() or None,
                    (row.get("property_sub_type_en") or "").strip() or None,
                    (row.get("land_type_en") or "").strip() or None,
                    _bool(row.get("is_free_hold")),
                    _bool(row.get("is_registered")),
                    (row.get("pre_registration_number") or "").strip() or None,
                    (row.get("project_name_en") or "").strip() or None,
                    (row.get("master_project_en") or "").strip() or None,
                ))
                if len(batch) >= batch_size:
                    flush()
            flush()
            print(f"  inserted {inserted:,} land_registry rows", flush=True)
            print(f"  collected Arabic name for {len(arabic_by_area)} areas", flush=True)

            # Derive per-area summary in one SQL pass.
            cur.execute(
                """
                INSERT INTO dld_area_land_summary (
                    id, area_name_norm, area_name_display, total_parcels,
                    total_area_sqm, freehold_pct, registered_pct,
                    land_type_mix, top_master_projects
                )
                WITH base AS (
                    SELECT
                        area_name_norm,
                        MAX(area_name_en) AS area_name_display,
                        COUNT(*) AS total_parcels,
                        ROUND(SUM(COALESCE(actual_area_sqm, 0))::numeric, 2) AS total_area_sqm,
                        ROUND(
                            100.0 * COUNT(*) FILTER (WHERE is_free_hold = TRUE)
                              / NULLIF(COUNT(*) FILTER (WHERE is_free_hold IS NOT NULL), 0),
                            2
                        ) AS freehold_pct,
                        ROUND(
                            100.0 * COUNT(*) FILTER (WHERE is_registered = TRUE)
                              / NULLIF(COUNT(*) FILTER (WHERE is_registered IS NOT NULL), 0),
                            2
                        ) AS registered_pct
                    FROM dld_land_registry
                    GROUP BY area_name_norm
                ),
                mix AS (
                    SELECT
                        area_name_norm,
                        jsonb_object_agg(land_type_en, pct) AS land_type_mix
                    FROM (
                        SELECT
                            area_name_norm,
                            NULLIF(land_type_en, '') AS land_type_en,
                            ROUND(
                                100.0 * COUNT(*) /
                                NULLIF(SUM(COUNT(*)) OVER (PARTITION BY area_name_norm), 0),
                                1
                            ) AS pct
                        FROM dld_land_registry
                        GROUP BY area_name_norm, land_type_en
                    ) t
                    WHERE land_type_en IS NOT NULL
                    GROUP BY area_name_norm
                ),
                projects AS (
                    SELECT
                        area_name_norm,
                        jsonb_agg(
                            jsonb_build_object('name', master_project_en, 'parcel_count', cnt)
                            ORDER BY cnt DESC
                        ) FILTER (WHERE rn <= 5) AS top_master_projects
                    FROM (
                        SELECT
                            area_name_norm,
                            master_project_en,
                            COUNT(*) AS cnt,
                            ROW_NUMBER() OVER (
                                PARTITION BY area_name_norm
                                ORDER BY COUNT(*) DESC
                            ) AS rn
                        FROM dld_land_registry
                        WHERE master_project_en IS NOT NULL AND master_project_en <> ''
                        GROUP BY area_name_norm, master_project_en
                    ) p
                    GROUP BY area_name_norm
                )
                SELECT
                    gen_random_uuid(),
                    b.area_name_norm,
                    b.area_name_display,
                    b.total_parcels,
                    b.total_area_sqm,
                    b.freehold_pct,
                    b.registered_pct,
                    mix.land_type_mix,
                    projects.top_master_projects
                FROM base b
                LEFT JOIN mix ON mix.area_name_norm = b.area_name_norm
                LEFT JOIN projects ON projects.area_name_norm = b.area_name_norm
                """
            )
            cur.execute("SELECT COUNT(*) FROM dld_area_land_summary")
            summary_rows = cur.fetchone()[0]
            print(f"  derived {summary_rows:,} area_land_summary rows", flush=True)

            # 3) Update canonical Arabic names from the in-memory map
            ar_rows = [
                (area_norm, ar) for area_norm, ar in arabic_by_area.items()
            ]
            updated = 0
            if ar_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    UPDATE dld_canonical_areas AS c
                    SET area_name_ar = v.area_name_ar
                    FROM (VALUES %s) AS v(area_name_norm, area_name_ar)
                    WHERE UPPER(v.area_name_norm) = c.area_name_upper
                    """,
                    ar_rows,
                    page_size=500,
                )
                # rowcount on UPDATE w/ FROM-VALUES isn't always reliable in
                # all psycopg2 versions; use a SELECT to verify
                cur.execute(
                    "SELECT COUNT(*) FROM dld_canonical_areas WHERE area_name_ar IS NOT NULL"
                )
                updated = cur.fetchone()[0]
            print(f"  canonical areas with Arabic name: {updated}", flush=True)

        conn.commit()
        print("✓ committed", flush=True)
        return {
            "land_registry_rows": inserted,
            "area_summary_rows": summary_rows,
            "areas_with_arabic": updated,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Export areas.json from canonical (now with Arabic)
# ---------------------------------------------------------------------------

def export_areas_json(path: Path) -> int:
    import psycopg2
    dsn = get_sync_db_url()
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, area_name, area_name_upper, area_name_slug,
                       area_name_ar, source_datasets, first_seen_year,
                       occurrence_count
                FROM dld_canonical_areas
                ORDER BY area_name
                """
            )
            records = []
            for r in cur.fetchall():
                records.append({
                    "id": r[0],
                    "area_name": r[1],
                    "area_name_upper": r[2],
                    "area_name_slug": r[3],
                    "area_name_ar": r[4],
                    "source_datasets": list(r[5]) if r[5] else [],
                    "first_seen_year": r[6],
                    "occurrence_count": int(r[7] or 0),
                })
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(records, indent=2, ensure_ascii=False))
            print(f"  → wrote {len(records):,} records to {path}", flush=True)
            return len(records)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default=str(SRC))
    parser.add_argument("--to-db", action="store_true")
    parser.add_argument("--json", default=str(OUT_JSON))
    args = parser.parse_args()

    started_at = dt.datetime.utcnow()
    path = Path(args.file).expanduser()
    if not path.exists():
        print(f"ERROR: file not found: {path}", flush=True)
        return 2

    if args.to_db:
        summary = write_to_db(path)
        print(f"\nSummary: {summary}", flush=True)
        json_count = export_areas_json(Path(args.json))
        print(f"Exported areas.json: {json_count} records", flush=True)
        # Quick post-derivation report
        import psycopg2
        conn = psycopg2.connect(get_sync_db_url())
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT area_name_display, total_parcels, freehold_pct, registered_pct
                    FROM dld_area_land_summary
                    ORDER BY total_parcels DESC
                    LIMIT 10
                    """
                )
                print("\nTop 10 areas by parcel count:")
                print(f"  {'Area':<40} {'Parcels':>9} {'Freehold':>9} {'Registered':>11}")
                for name, n, fh, reg in cur.fetchall():
                    print(
                        f"  {(name or '-')[:40]:<40} "
                        f"{n:>9,} "
                        f"{(float(fh) if fh else 0):>8.1f}% "
                        f"{(float(reg) if reg else 0):>10.1f}%"
                    )
        finally:
            conn.close()
    else:
        # Dry-run: just count
        n = sum(1 for _ in stream(path))
        print(f"\nDry-run: {n:,} rows would be inserted", flush=True)

    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
