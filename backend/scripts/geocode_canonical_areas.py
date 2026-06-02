"""Populate latitude/longitude on dld_canonical_areas.

Two-phase strategy:

  Phase A — curated copy (zero API calls):
    For any canonical area whose UPPER name matches the curated `areas`
    table's name (UPPER), copy latitude + longitude from there. Tag
    coords_source='curated', coords_confidence='high' (these are hand-picked).

  Phase B — Nominatim for the rest:
    For each remaining area, build a query trying the marketing community
    name first (via dld_area_aliases.admin_sector_to_community) then
    falling back to the area name itself. Append ", Dubai, UAE". Sleep
    1.1s between requests per Nominatim usage policy. Confidence is
    derived from Nominatim's `importance` + the result `class/type`.

Output:
  - DB: UPDATEs dld_canonical_areas with lat/lng/bbox/source/confidence.
  - JSON: data/area_coordinates.json — same data for the frontend to
    consume statically. Keeps the source-of-truth shared with the DB.

Run patterns:
    python scripts/geocode_canonical_areas.py            # dry-run report
    python scripts/geocode_canonical_areas.py --to-db    # commit + JSON
    python scripts/geocode_canonical_areas.py --to-db --only-missing
        # skip areas that already have coords (idempotent retry)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Add backend/app to path so we can import the alias map
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.data.dld_area_aliases import admin_sector_to_community  # noqa: E402

DATA_DIR = ROOT.parent / "data"
OUT_JSON = DATA_DIR / "area_coordinates.json"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {
    # Per Nominatim usage policy: identify the app + contact email
    "User-Agent": "Floxcy/1.0 (real-estate-investment-intelligence; ivvvvip@gmail.com)",
    "Accept-Language": "en",
}
SLEEP_S = 1.1

logger = logging.getLogger("geocode")


def get_sync_db_url() -> str:
    env_path = ROOT / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


# ---------------------------------------------------------------------------
# Phase A — copy from curated.areas (no API)
# ---------------------------------------------------------------------------

def phase_a_curated(cur) -> int:
    """For canonical areas that match a curated area by UPPER(name),
    copy latitude + longitude. Returns count of rows touched."""
    cur.execute(
        """
        UPDATE dld_canonical_areas c
        SET latitude  = a.latitude,
            longitude = a.longitude,
            coords_source = 'curated',
            coords_confidence = 'high'
        FROM areas a
        WHERE UPPER(a.name) = c.area_name_upper
          AND a.latitude IS NOT NULL
          AND a.longitude IS NOT NULL
        """
    )
    return cur.rowcount


# ---------------------------------------------------------------------------
# Phase B — Nominatim
# ---------------------------------------------------------------------------

def confidence_from_result(result: dict) -> str:
    importance = result.get("importance") or 0.0
    cls = (result.get("class") or "").lower()
    typ = (result.get("type") or "").lower()
    high_types = {"administrative", "neighbourhood", "suburb", "quarter", "city_block"}
    if cls in {"place", "boundary"} and typ in high_types and importance >= 0.35:
        return "high"
    if cls in {"place", "boundary"} and importance >= 0.20:
        return "medium"
    return "low"


def query_nominatim(name: str) -> Optional[dict]:
    """Single Nominatim call returning the first hit (or None)."""
    qs = urlencode({
        "q": name,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
        "extratags": 0,
    })
    req = Request(f"{NOMINATIM_URL}?{qs}", headers=NOMINATIM_HEADERS)
    try:
        with urlopen(req, timeout=15) as resp:
            data = json.load(resp)
    except (HTTPError, URLError, ValueError) as e:
        logger.warning("Nominatim failed for %r: %s", name, e)
        return None
    if not data:
        return None
    return data[0]


def build_queries(area_name: str) -> list[str]:
    """Priority list of queries to try.
    1. community alias if area maps to one (e.g. 'Damac Hills 2, Dubai')
    2. the area name itself ('Wadi Al Safa 5, Dubai')
    3. shorter form (drop 'Al ', or numeric suffix) — last resort
    """
    queries: list[str] = []

    community = admin_sector_to_community(area_name.lower())
    if community:
        queries.append(f"{community}, Dubai, United Arab Emirates")

    queries.append(f"{area_name}, Dubai, United Arab Emirates")

    # Last-ditch fallback: strip a trailing ordinal/digit + retry
    import re
    stripped = re.sub(r"\s+(\d+|First|Second|Third|Fourth|Fifth|Sixth|Seventh)$", "", area_name)
    if stripped != area_name:
        queries.append(f"{stripped}, Dubai, United Arab Emirates")

    # De-dup while preserving order
    seen = set()
    out = []
    for q in queries:
        if q not in seen:
            out.append(q)
            seen.add(q)
    return out


def phase_b_nominatim(cur, only_missing: bool) -> dict:
    """Geocode every canonical area that lacks coords. Returns summary
    counts + the list of records written."""
    where = "WHERE latitude IS NULL OR longitude IS NULL" if only_missing else ""
    cur.execute(
        f"""
        SELECT area_name, area_name_upper FROM dld_canonical_areas
        {where}
        ORDER BY area_name
        """
    )
    todo = cur.fetchall()
    total = len(todo)
    print(f"  Phase B: {total} areas to geocode (sleep {SLEEP_S}s between calls)", flush=True)

    confidences = {"high": 0, "medium": 0, "low": 0}
    unresolved = []
    records = []
    started = time.time()

    for i, (area_name, area_name_upper) in enumerate(todo, 1):
        queries = build_queries(area_name)
        chosen = None
        chosen_q = None
        for q in queries:
            chosen = query_nominatim(q)
            chosen_q = q
            time.sleep(SLEEP_S)
            if chosen:
                break

        if not chosen:
            unresolved.append(area_name)
            if i % 20 == 0 or i == total:
                elapsed = time.time() - started
                rate = i / elapsed if elapsed else 0
                eta = (total - i) / rate if rate else 0
                print(
                    f"  [{i:>3}/{total}] · {confidences} resolved · "
                    f"{len(unresolved)} null · ETA {eta:.0f}s",
                    flush=True,
                )
            continue

        try:
            lat = float(chosen["lat"])
            lon = float(chosen["lon"])
        except (KeyError, ValueError, TypeError):
            unresolved.append(area_name)
            continue

        bbox = chosen.get("boundingbox")
        bbox_s, bbox_n, bbox_w, bbox_e = (None, None, None, None)
        if bbox and len(bbox) == 4:
            try:
                bbox_s = float(bbox[0])
                bbox_n = float(bbox[1])
                bbox_w = float(bbox[2])
                bbox_e = float(bbox[3])
            except (ValueError, TypeError):
                pass

        conf = confidence_from_result(chosen)
        confidences[conf] += 1

        cur.execute(
            """
            UPDATE dld_canonical_areas
            SET latitude = %s, longitude = %s,
                bbox_north = %s, bbox_south = %s,
                bbox_east  = %s, bbox_west  = %s,
                coords_source = 'nominatim',
                coords_confidence = %s
            WHERE area_name_upper = %s
            """,
            (lat, lon, bbox_n, bbox_s, bbox_e, bbox_w, conf, area_name_upper),
        )
        records.append({
            "area_name": area_name,
            "area_name_upper": area_name_upper,
            "latitude": lat,
            "longitude": lon,
            "bbox_north": bbox_n,
            "bbox_south": bbox_s,
            "bbox_east": bbox_e,
            "bbox_west": bbox_w,
            "coords_source": "nominatim",
            "coords_confidence": conf,
            "nominatim_query": chosen_q,
            "nominatim_display_name": chosen.get("display_name"),
            "nominatim_importance": chosen.get("importance"),
            "nominatim_class": chosen.get("class"),
            "nominatim_type": chosen.get("type"),
        })

        if i % 20 == 0 or i == total:
            elapsed = time.time() - started
            rate = i / elapsed if elapsed else 0
            eta = (total - i) / rate if rate else 0
            print(
                f"  [{i:>3}/{total}] · {confidences} resolved · "
                f"{len(unresolved)} null · ETA {eta:.0f}s",
                flush=True,
            )

    return {
        "total": total,
        "confidences": confidences,
        "unresolved_count": len(unresolved),
        "unresolved_names": unresolved,
        "records": records,
    }


# ---------------------------------------------------------------------------
# JSON export — sourced from the final DB state
# ---------------------------------------------------------------------------

def export_json(cur, path: Path) -> int:
    cur.execute(
        """
        SELECT id::text, area_name, area_name_upper, area_name_slug,
               latitude, longitude,
               bbox_north, bbox_south, bbox_east, bbox_west,
               coords_source, coords_confidence
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
            "latitude": r[4],
            "longitude": r[5],
            "bbox": [r[6], r[7], r[8], r[9]] if all(x is not None for x in r[6:10]) else None,
            "coords_source": r[10],
            "coords_confidence": r[11],
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(records, indent=2, ensure_ascii=False))
    return len(records)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to-db", action="store_true")
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Skip Phase B for areas that already have coords (for retries)",
    )
    parser.add_argument(
        "--skip-phase-b",
        action="store_true",
        help="Curated copy only — useful to test Phase A standalone",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="  %(levelname)s %(message)s")
    started_at = dt.datetime.utcnow()

    if not args.to_db:
        print("Dry run (no DB writes). Use --to-db to commit.", flush=True)
        return 0

    import psycopg2

    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    summary_b: dict = {}
    try:
        with conn.cursor() as cur:
            print("\nPhase A — copy from curated.areas …", flush=True)
            phase_a_count = phase_a_curated(cur)
            print(f"  copied coords for {phase_a_count} areas from curated", flush=True)

            if not args.skip_phase_b:
                print("\nPhase B — Nominatim …", flush=True)
                summary_b = phase_b_nominatim(cur, only_missing=True)
            else:
                print("\nSkipping Phase B (--skip-phase-b)", flush=True)

            # Commit before final report
            conn.commit()

            # Coverage report
            cur.execute(
                """
                SELECT coords_source, coords_confidence, COUNT(*)
                FROM dld_canonical_areas
                GROUP BY coords_source, coords_confidence
                ORDER BY coords_source NULLS LAST, coords_confidence
                """
            )
            print("\n=== Coverage by source × confidence ===", flush=True)
            print(f"  {'source':<12} {'confidence':<11} {'count':>6}")
            for src, conf, n in cur.fetchall():
                print(f"  {(src or 'null'):<12} {(conf or 'null'):<11} {n:>6,}")

            cur.execute(
                """
                SELECT
                  COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS with_coords,
                  COUNT(*) FILTER (WHERE latitude IS NULL)     AS without,
                  COUNT(*)                                      AS total
                FROM dld_canonical_areas
                """
            )
            with_coords, without, total = cur.fetchone()
            print(f"\n  with coords: {with_coords}/{total}  ({with_coords*100/total:.1f}%)", flush=True)
            print(f"  null       : {without}", flush=True)

            json_count = export_json(cur, OUT_JSON)
            print(f"\nExported {json_count} records → {OUT_JSON}", flush=True)

            if summary_b.get("unresolved_names"):
                print(f"\n=== {len(summary_b['unresolved_names'])} unresolved areas ===", flush=True)
                for n in summary_b["unresolved_names"][:30]:
                    print(f"  · {n}")
                if len(summary_b["unresolved_names"]) > 30:
                    print(f"  … and {len(summary_b['unresolved_names']) - 30} more")

    finally:
        conn.close()

    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
