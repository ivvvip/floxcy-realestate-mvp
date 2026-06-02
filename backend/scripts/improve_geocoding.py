"""Three-step improvement pass over dld_canonical_areas coordinates.

Run after scripts/geocode_canonical_areas.py. Idempotent — only fills
areas that don't yet have lat/lng (Phase A in the original script tagged
those it touched as coords_source='curated'; this script tags its writes
'curated_alias', 'manual_override', and 'nominatim_strict' respectively).

Step 1 — Bridge curated → canonical via the alias map
  Phase A in geocode_canonical_areas.py only matched 8/70 curated coords
  because curated uses marketing community names ('Dubai Marina') while
  canonical uses DLD admin sector names ('Marsa Dubai'). The alias map
  (app/data/dld_area_aliases.py) bridges those — for each curated area
  with coords, copy them to every admin sector aliased from the matching
  community key. Tagged source='curated_alias', confidence='high'.

Step 2 — Apply data/area_coords_overrides.json
  Manual high-confidence coords for areas Nominatim couldn't resolve.
  File schema: list of {area_name_upper, latitude, longitude, notes}.
  Tagged source='manual_override', confidence='high'.

Step 3 — Re-try Nominatim with tighter parameters
  For still-NULL areas, hit Nominatim with featuretype=settlement
  (forces an admin-grade result). Sleep 1.1s. Tagged source=
  'nominatim_strict'. Confidence still derived from the response shape.

After all steps:
  - Re-export data/area_coordinates.json from the final DB state
  - Show source × confidence coverage matrix
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

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.data.dld_area_aliases import (  # noqa: E402
    COMMUNITY_TO_ADMIN_SECTORS,
    admin_sector_to_community,
)

DATA_DIR = ROOT.parent / "data"
OVERRIDES_FILE = DATA_DIR / "area_coords_overrides.json"
OUT_JSON = DATA_DIR / "area_coordinates.json"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {
    "User-Agent": "Floxcy/1.0 (real-estate-investment-intelligence; ivvvvip@gmail.com)",
    "Accept-Language": "en",
}
SLEEP_S = 1.1

logger = logging.getLogger("improve_geo")


def get_sync_db_url() -> str:
    env_path = ROOT / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


# ---------------------------------------------------------------------------
# Step 1 — Bridge curated → canonical via alias map
# ---------------------------------------------------------------------------

def step1_bridge_aliases(cur) -> int:
    """For each curated area with coords, look up its community in the
    alias map (lowercase name match), get the list of admin sectors,
    and UPDATE every canonical entry matching those sectors that doesn't
    already have coords. Returns total rows updated."""
    cur.execute("""
        SELECT name, latitude, longitude FROM areas
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """)
    curated = cur.fetchall()  # [(name, lat, lng), ...]

    total_updated = 0
    bridged_examples: list[tuple[str, str, int]] = []  # (curated_name, sample admin sector, count)
    for name, lat, lng in curated:
        # Look up the curated name in the alias map (keys are lowercase
        # community names like 'damac hills 2'). The curated table uses
        # marketing names exactly so the lowercase comparison matches.
        sectors = COMMUNITY_TO_ADMIN_SECTORS.get(name.lower())
        if not sectors:
            continue
        sector_uppers = [s.upper() for s in sectors]
        cur.execute(
            """
            UPDATE dld_canonical_areas
            SET latitude = %s,
                longitude = %s,
                coords_source = 'curated_alias',
                coords_confidence = 'high'
            WHERE area_name_upper = ANY(%s)
              AND latitude IS NULL
            """,
            (float(lat), float(lng), sector_uppers),
        )
        if cur.rowcount > 0:
            bridged_examples.append((name, sectors[0], cur.rowcount))
            total_updated += cur.rowcount

    if bridged_examples:
        print(f"  bridged from {len(bridged_examples)} curated areas → {total_updated} canonical rows", flush=True)
        for cname, sample_sector, n in bridged_examples[:10]:
            print(f"    {cname!r:32} → {sample_sector!r}  ({n} sector{'s' if n > 1 else ''})")
        if len(bridged_examples) > 10:
            print(f"    … and {len(bridged_examples) - 10} more")
    else:
        print("  (no curated areas matched a community in the alias map)", flush=True)
    return total_updated


# ---------------------------------------------------------------------------
# Step 2 — Manual overrides
# ---------------------------------------------------------------------------

def step2_apply_overrides(cur, path: Path) -> int:
    if not path.exists():
        print(f"  (no overrides file at {path})", flush=True)
        return 0
    records = json.loads(path.read_text())
    if not records:
        return 0
    n_applied = 0
    n_skipped = 0
    for rec in records:
        upper = rec["area_name_upper"].upper()
        lat = rec["latitude"]
        lng = rec["longitude"]
        cur.execute(
            """
            UPDATE dld_canonical_areas
            SET latitude = %s, longitude = %s,
                coords_source = 'manual_override',
                coords_confidence = 'high'
            WHERE area_name_upper = %s
              AND latitude IS NULL
            """,
            (float(lat), float(lng), upper),
        )
        if cur.rowcount == 1:
            n_applied += 1
        else:
            # Either area not in canonical, OR area already has coords
            n_skipped += 1
            print(f"    override skipped: {rec['area_name_upper']} (already has coords or not in canonical)", flush=True)
    print(f"  applied {n_applied}/{len(records)} overrides ({n_skipped} skipped)", flush=True)
    return n_applied


# ---------------------------------------------------------------------------
# Step 3 — Strict Nominatim retry
# ---------------------------------------------------------------------------

def confidence_from_result(result: dict) -> str:
    importance = result.get("importance") or 0.0
    cls = (result.get("class") or "").lower()
    typ = (result.get("type") or "").lower()
    high_types = {"administrative", "neighbourhood", "suburb", "quarter", "city_block"}
    if cls in {"place", "boundary"} and typ in high_types and importance >= 0.30:
        return "high"
    if cls in {"place", "boundary"} and importance >= 0.18:
        return "medium"
    return "low"


def query_nominatim_strict(name: str) -> Optional[dict]:
    """featuretype=settlement forces admin-grade results."""
    qs = urlencode({
        "q": name,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
        "extratags": 0,
        "featuretype": "settlement",
        "countrycodes": "ae",
    })
    req = Request(f"{NOMINATIM_URL}?{qs}", headers=NOMINATIM_HEADERS)
    try:
        with urlopen(req, timeout=15) as resp:
            data = json.load(resp)
    except (HTTPError, URLError, ValueError) as e:
        logger.warning("Nominatim strict failed for %r: %s", name, e)
        return None
    if not data:
        return None
    return data[0]


def step3_strict_nominatim(cur) -> dict:
    cur.execute(
        "SELECT area_name, area_name_upper FROM dld_canonical_areas WHERE latitude IS NULL ORDER BY area_name"
    )
    todo = cur.fetchall()
    total = len(todo)
    print(f"  {total} areas still NULL after Steps 1+2 — trying strict Nominatim", flush=True)
    if not total:
        return {"total": 0, "resolved": 0, "still_null": []}

    resolved = 0
    still_null = []
    started = time.time()
    for i, (area_name, area_name_upper) in enumerate(todo, 1):
        # Try the canonical area name first; if community alias exists,
        # we already tried that variant in the prior run, so prioritise
        # the literal name here.
        queries = [
            f"{area_name}, Dubai, United Arab Emirates",
        ]
        community = admin_sector_to_community(area_name.lower())
        if community and community.lower() != area_name.lower():
            queries.append(f"{community}, Dubai, United Arab Emirates")

        chosen = None
        for q in queries:
            chosen = query_nominatim_strict(q)
            time.sleep(SLEEP_S)
            if chosen:
                break

        if not chosen:
            still_null.append(area_name)
            if i % 10 == 0 or i == total:
                elapsed = time.time() - started
                rate = i / elapsed if elapsed else 0
                eta = (total - i) / rate if rate else 0
                print(f"  [{i:>3}/{total}] resolved={resolved}  null={len(still_null)}  ETA {eta:.0f}s", flush=True)
            continue

        try:
            lat = float(chosen["lat"])
            lon = float(chosen["lon"])
        except (KeyError, ValueError, TypeError):
            still_null.append(area_name)
            continue

        bbox = chosen.get("boundingbox")
        bbox_s, bbox_n, bbox_w, bbox_e = (None, None, None, None)
        if bbox and len(bbox) == 4:
            try:
                bbox_s, bbox_n, bbox_w, bbox_e = (float(x) for x in bbox)
            except (ValueError, TypeError):
                pass

        conf = confidence_from_result(chosen)
        cur.execute(
            """
            UPDATE dld_canonical_areas
            SET latitude = %s, longitude = %s,
                bbox_north = %s, bbox_south = %s,
                bbox_east  = %s, bbox_west  = %s,
                coords_source = 'nominatim_strict',
                coords_confidence = %s
            WHERE area_name_upper = %s
            """,
            (lat, lon, bbox_n, bbox_s, bbox_e, bbox_w, conf, area_name_upper),
        )
        resolved += 1

        if i % 10 == 0 or i == total:
            elapsed = time.time() - started
            rate = i / elapsed if elapsed else 0
            eta = (total - i) / rate if rate else 0
            print(f"  [{i:>3}/{total}] resolved={resolved}  null={len(still_null)}  ETA {eta:.0f}s", flush=True)

    return {"total": total, "resolved": resolved, "still_null": still_null}


# ---------------------------------------------------------------------------
# Final export + report
# ---------------------------------------------------------------------------

def export_json(cur, path: Path) -> int:
    cur.execute(
        """
        SELECT id::text, area_name, area_name_upper, area_name_slug,
               latitude, longitude,
               bbox_north, bbox_south, bbox_east, bbox_west,
               coords_source, coords_confidence
        FROM dld_canonical_areas ORDER BY area_name
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


def report(cur) -> None:
    cur.execute(
        """
        SELECT coords_source, coords_confidence, COUNT(*)
        FROM dld_canonical_areas
        GROUP BY coords_source, coords_confidence
        ORDER BY coords_source NULLS LAST, coords_confidence
        """
    )
    print("\n=== Final coverage by source × confidence ===")
    print(f"  {'source':<18} {'confidence':<11} {'count':>6}")
    for src, conf, n in cur.fetchall():
        print(f"  {(src or 'null'):<18} {(conf or 'null'):<11} {n:>6,}")

    cur.execute(
        """
        SELECT
          COUNT(*) FILTER (WHERE latitude IS NOT NULL),
          COUNT(*) FILTER (WHERE latitude IS NULL),
          COUNT(*)
        FROM dld_canonical_areas
        """
    )
    with_, without, total = cur.fetchone()
    print(f"\n  with coords: {with_}/{total}  ({with_*100/total:.1f}%)")
    print(f"  null       : {without}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to-db", action="store_true")
    parser.add_argument("--skip-strict", action="store_true",
                        help="Skip Step 3 (Nominatim strict retry)")
    args = parser.parse_args()

    started_at = dt.datetime.utcnow()
    if not args.to_db:
        print("Dry run. Use --to-db to commit.", flush=True)
        return 0

    import psycopg2
    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            print("\nStep 1 — Bridge curated → canonical via alias map", flush=True)
            step1_bridge_aliases(cur)
            conn.commit()

            print("\nStep 2 — Apply data/area_coords_overrides.json", flush=True)
            step2_apply_overrides(cur, OVERRIDES_FILE)
            conn.commit()

            if not args.skip_strict:
                print("\nStep 3 — Strict Nominatim retry (featuretype=settlement, countrycodes=ae)", flush=True)
                summary = step3_strict_nominatim(cur)
                conn.commit()
                if summary.get("still_null"):
                    print(f"\n=== {len(summary['still_null'])} areas still NULL ===")
                    for n in summary["still_null"][:25]:
                        print(f"  · {n}")
                    if len(summary["still_null"]) > 25:
                        print(f"  … and {len(summary['still_null']) - 25} more")

            json_count = export_json(cur, OUT_JSON)
            print(f"\nExported {json_count} records → {OUT_JSON}", flush=True)
            report(cur)
    finally:
        conn.close()

    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
