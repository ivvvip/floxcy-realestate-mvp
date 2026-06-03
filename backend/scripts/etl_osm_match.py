"""OSM Overpass → dld_building_osm_coords ETL.

Reads ~/dld-data/osm_buildings.json (produced by the Overpass query
documented at the top of this script), normalises building names on both
sides, and writes:

  - dld_building_osm_coords: one row per matched DLD building, with the
    OSM name, lat/lon, osm_id, match_type ('exact' | 'fuzzy'), match_ratio,
    floors when available.
  - dld_buildings_derived: lat/lon/osm_verified denormalised columns
    refreshed from the same matches.

Idempotent: TRUNCATE + INSERT on dld_building_osm_coords; UPDATE on
dld_buildings_derived clears prior coords first so removing a match from
OSM also clears it locally.

Re-fetching the source JSON:
  curl -s -X POST 'https://overpass-api.de/api/interpreter' \\
       -H 'User-Agent: floxcy/0.1' \\
       -H 'Accept: application/json' \\
       --data '[out:json][timeout:120];
       (
         way["building"]["name"](24.79,54.85,25.45,55.70);
         relation["building"]["name"](24.79,54.85,25.45,55.70);
       );
       out center tags;'

Run patterns:
    python scripts/etl_osm_match.py            # dry-run
    python scripts/etl_osm_match.py --to-db    # write to Postgres
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import uuid
from pathlib import Path

DATA_PATH = Path.home() / "dld-data" / "osm_buildings.json"
FUZZY_CUTOFF = 0.86

# Manually-curated unverify list. Even when a (project_name, area_name)
# pair would match an OSM entry by name, we still skip it because the
# real building doesn't live where the OSM hit places it.
#
# Pattern that surfaced these: many low-confidence name collisions in
# Business Bay (the Burj Khalifa-adjacent towers all share generic
# names like "OPAL TOWER" / "SILVER TOWER" with unrelated buildings
# elsewhere). Audit ran against area centroid via haversine; everything
# here was >10 km from where the DLD-side area places it.
#
# Stays unverified on every re-run — Floxcy renders "Location
# approximate" + name-only Google Maps link, which is honest.
MANUAL_OSM_UNVERIFY: set[tuple[str, str]] = {
    # (project_name_en exactly as in dld_buildings_derived, area_name_en)
    ("THE 8", "Palm Jumeirah"),
    ("PLATINUM TOWER", "Al Thanyah Fifth"),
    ("PRIME TOWER", "Business Bay"),
    ("Binghatti Creek", "Al Jadaf"),
    ("AL BAHIA", "Al Safouh First"),
    ("THE S TOWER", "Al Safouh Second"),
    ("OPAL TOWER", "Business Bay"),
    ("SILVER TOWER", "Business Bay"),
    ("OXFORD TOWER", "Business Bay"),
    ("CRYSTAL TOWER", "Business Bay"),
    ("THE DUBAI MALL", "Burj Khalifa"),
    ("AVANTI TOWER", "Business Bay"),
}

# Dubai-only bbox + NE-corner refinement. The Overpass query intentionally
# pulls a slightly wider box (24.79–25.45 N, 54.85–55.70 E) so future
# Mamzar/Mirdif edge additions land cleanly; in-script we then drop
# anything that fell into Sharjah / Ajman / UAQ via the matcher. The
# Dubai-Sharjah boundary cuts diagonally through the NE quadrant — there
# is no Dubai land at (lat > 25.30, lon > 55.37); buildings there belong
# to Al Nahda / Al Majaz / Al Taawun Sharjah even when OSM tagged them
# without an addr:emirate hint.
DUBAI_BBOX_LAT_MIN = 24.79
DUBAI_BBOX_LAT_MAX = 25.40
DUBAI_BBOX_LON_MIN = 54.85
DUBAI_BBOX_LON_MAX = 55.65
SHARJAH_NE_CUT_LAT = 25.30
SHARJAH_NE_CUT_LON = 55.37


def is_in_dubai(lat: float, lon: float) -> bool:
    """True when the point is inside Floxcy's Dubai-only bbox AND outside
    the NE Sharjah corner. Conservative — drops a handful of legitimate
    edge buildings in Al Mamzar in exchange for never showing Sharjah."""
    if not (DUBAI_BBOX_LAT_MIN <= lat <= DUBAI_BBOX_LAT_MAX):
        return False
    if not (DUBAI_BBOX_LON_MIN <= lon <= DUBAI_BBOX_LON_MAX):
        return False
    if lat > SHARJAH_NE_CUT_LAT and lon > SHARJAH_NE_CUT_LON:
        return False
    return True

# Words that distort the SequenceMatcher score because they're so common
# across Dubai building names. Stripped before normalisation so "Lake View"
# and "Lake View Tower" rank as effectively the same string.
STOPWORDS = {
    "the", "by", "at", "of", "and",
    "residence", "residences",
    "tower", "towers",
    "building",
    "al", "el",
    "dubai",
}


def get_sync_db_url() -> str:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


def normalize(name: str) -> str:
    if not name:
        return ""
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    tokens = [t for t in s.split() if t and t not in STOPWORDS]
    return " ".join(tokens)


def load_osm() -> list[dict]:
    """Load the OSM dump, dropping any building outside Dubai. The Overpass
    bbox is intentionally wide; this is the canonical Dubai-only gate."""
    if not DATA_PATH.exists():
        raise SystemExit(f"missing OSM dump: {DATA_PATH}")
    raw = json.loads(DATA_PATH.read_text())
    kept: list[dict] = []
    dropped = 0
    for o in raw:
        try:
            lat = float(o["lat"])
            lon = float(o["lon"])
        except (KeyError, TypeError, ValueError):
            dropped += 1
            continue
        if not is_in_dubai(lat, lon):
            dropped += 1
            continue
        kept.append(o)
    print(
        f"OSM rows loaded:  {len(kept):,} kept · {dropped:,} dropped outside Dubai bbox",
        flush=True,
    )
    return kept


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--to-db", action="store_true")
    args = ap.parse_args()

    osm = load_osm()

    import psycopg2
    import psycopg2.extras

    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, project_name_en, master_project_en, area_name_en, contract_count
                FROM dld_buildings_derived
                ORDER BY contract_count DESC
            """)
            dld = cur.fetchall()
        print(f"DLD buildings:    {len(dld):,}", flush=True)

        osm_by_norm: dict[str, list[dict]] = {}
        for o in osm:
            n = normalize(o["name"])
            if n:
                osm_by_norm.setdefault(n, []).append(o)
        osm_keys = list(osm_by_norm.keys())

        matches: list[tuple] = []
        exact, fuzzy = 0, 0
        unverify_skipped = 0
        for bid, name, _master, area_name, _cnt in dld:
            n = normalize(name)
            if not n:
                continue
            # Hard-skip any (building, area) pair the audit flagged as
            # geographically wrong even though it matches a name in OSM.
            if name and area_name and (name, area_name) in MANUAL_OSM_UNVERIFY:
                unverify_skipped += 1
                continue
            osm_row: dict | None = None
            match_type: str = ""
            ratio: float = 0.0
            if n in osm_by_norm:
                osm_row = osm_by_norm[n][0]
                match_type = "exact"
                ratio = 1.0
                exact += 1
            else:
                cand = difflib.get_close_matches(n, osm_keys, n=1, cutoff=FUZZY_CUTOFF)
                if cand:
                    osm_row = osm_by_norm[cand[0]][0]
                    match_type = "fuzzy"
                    ratio = round(difflib.SequenceMatcher(None, n, cand[0]).ratio(), 3)
                    fuzzy += 1
            if osm_row is None:
                continue
            floors = None
            f_raw = (osm_row.get("floors") or "").strip()
            if f_raw.isdigit():
                floors = int(f_raw)
            matches.append((
                str(uuid.uuid4()),
                bid,
                name,
                osm_row["name"],
                float(osm_row["lat"]),
                float(osm_row["lon"]),
                int(osm_row["osm_id"]),
                osm_row.get("osm_kind"),
                match_type,
                ratio,
                floors,
                osm_row.get("type"),
            ))

        print(
            f"\nMatched: {len(matches):,} "
            f"(exact={exact}, fuzzy={fuzzy})  "
            f"= {len(matches)/len(dld)*100:.1f}% of roster · "
            f"manual unverify: {unverify_skipped}",
            flush=True,
        )

        if not args.to_db:
            print("\nDry-run only. Re-run with --to-db to write.", flush=True)
            return 0

        with conn.cursor() as cur:
            # Reset denorm columns + match table
            cur.execute("""
                UPDATE dld_buildings_derived
                SET lat = NULL, lon = NULL, osm_verified = FALSE
            """)
            cur.execute("TRUNCATE dld_building_osm_coords")
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_building_osm_coords (
                    id, building_id, dld_name, osm_name, lat, lon,
                    osm_id, osm_kind, match_type, match_ratio, floors,
                    building_type
                ) VALUES %s
                """,
                matches,
                page_size=500,
            )
            # Backfill the denormalised cols
            cur.execute("""
                UPDATE dld_buildings_derived AS b
                SET lat = c.lat, lon = c.lon, osm_verified = TRUE
                FROM dld_building_osm_coords AS c
                WHERE c.building_id = b.id
            """)
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM dld_building_osm_coords")
            n_coords = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM dld_buildings_derived WHERE osm_verified")
            n_verified = cur.fetchone()[0]
        print(f"\nWrote {n_coords:,} osm-coords rows; "
              f"{n_verified:,} dld_buildings_derived flagged verified.",
              flush=True)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
