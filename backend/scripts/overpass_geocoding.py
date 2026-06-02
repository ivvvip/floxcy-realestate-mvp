"""Overpass API geocoder for dld_canonical_areas.

Goal: fill the 66 still-NULL canonical areas after Nominatim attempts,
using OSM admin boundary polygons. Single bulk Overpass query gets every
Dubai admin boundary at once, then we match by name in-process — much
faster than 60+ individual API calls and gives us actual polygon shapes,
not just centroids.

Strategy:
  1. ONE Overpass call: `relation` + `way` features in Dubai with
     admin_level 8-10 OR place=suburb/neighbourhood/quarter, with full
     geometry.
  2. Parse each feature's `geometry` into a GeoJSON polygon, compute
     centroid + bbox.
  3. Index by normalised name; also keep aliases (no "Al " prefix,
     numeric→ordinal etc).
  4. For each NULL canonical area: try the canonical name first, then
     community-alias name, then strip-Al variants.
  5. Where matched: UPDATE coords/source/confidence/polygon + write
     polygon to dld_canonical_areas.

Also: this script can OPTIONALLY UPGRADE existing low-confidence
nominatim entries with their proper OSM polygon shape via --upgrade-poly
(only adds the polygon column; doesn't move the centroid).

Run:
    python scripts/overpass_geocoding.py            # dry-run summary
    python scripts/overpass_geocoding.py --to-db    # commit
    python scripts/overpass_geocoding.py --to-db --upgrade-poly
        # also fill polygon for existing-coords entries
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.data.dld_area_aliases import admin_sector_to_community  # noqa: E402

DATA_DIR = ROOT.parent / "data"
OUT_JSON = DATA_DIR / "area_coordinates.json"

# Overpass instance. Default is overpass-api.de; can fall back to
# overpass.kumi.systems if main is overloaded.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Standard ALSO-RAN header. Overpass is more lenient than Nominatim but
# still asks for identification.
HEADERS = {
    "User-Agent": "Floxcy/1.0 (real-estate-investment-intelligence; ivvvvip@gmail.com)",
    "Accept-Language": "en",
}
OVERPASS_TIMEOUT_S = 180

# Dubai sanity bounds — reject results outside this box
DUBAI_BBOX = {
    "south": 24.5,
    "north": 25.6,
    "west": 54.5,
    "east": 56.0,
}

logger = logging.getLogger("overpass")


# ---------------------------------------------------------------------------
# Overpass
# ---------------------------------------------------------------------------

# Dubai's OSM area id is 3604479752 (Emirate boundary). Use it directly
# rather than an `area["name"="Dubai"]` filter — that filter matches dozens
# of POIs named Dubai and returns nothing useful.
#
# We grab three classes of features inside that area:
#   - relations: admin_level 8/9/10 boundaries (neighbourhoods, districts)
#   - ways:      named places (suburb / neighbourhood / quarter / city_block)
#   - nodes:     same — gives a centroid even when no polygon exists
# `out body geom` returns full geometry inline (member ways for relations).
OVERPASS_QUERY = """
[out:json][timeout:180];
(
  relation(area:3604479752)["admin_level"~"^(8|9|10)$"]["boundary"="administrative"];
  way(area:3604479752)["place"~"^(suburb|neighbourhood|quarter|city_block|district|town|village)$"];
  node(area:3604479752)["place"~"^(suburb|neighbourhood|quarter|city_block|district|town|village)$"];
);
out body geom;
"""


def fetch_overpass() -> dict:
    """POST the query; return parsed JSON."""
    data = ("data=" + OVERPASS_QUERY).encode()
    for url in OVERPASS_URLS:
        print(f"  Querying {url}", flush=True)
        req = Request(url, data=data, headers=HEADERS, method="POST")
        try:
            with urlopen(req, timeout=OVERPASS_TIMEOUT_S) as resp:
                return json.load(resp)
        except (HTTPError, URLError) as e:
            logger.warning("Overpass call to %s failed: %s — trying fallback", url, e)
            continue
    raise RuntimeError("All Overpass endpoints failed")


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _bbox_centroid(coords: list[tuple[float, float]]) -> tuple[float, float, dict]:
    """Return (lat, lon, bbox_dict) from an iterable of (lat, lon) pairs."""
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    return (
        sum(lats) / len(lats),
        sum(lons) / len(lons),
        {
            "north": max(lats),
            "south": min(lats),
            "east":  max(lons),
            "west":  min(lons),
        },
    )


def _ring_to_geojson(ring: list[dict]) -> list[list[float]]:
    """Overpass geometry list (lat/lon dicts) → GeoJSON ring [[lon,lat],...]."""
    pts = [[float(p["lon"]), float(p["lat"])] for p in ring]
    # Close the ring if Overpass didn't
    if pts and pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def _extract_geometry(feature: dict) -> Optional[dict]:
    """Build a GeoJSON Polygon or MultiPolygon + centroid + bbox from any
    Overpass feature (relation / way / node). Returns None if no geometry
    can be derived (e.g. node-only features get a point centroid but no
    polygon).
    """
    t = feature.get("type")

    # Node: just a point. Centroid = the point itself; no polygon.
    if t == "node":
        lat = feature.get("lat"); lon = feature.get("lon")
        if lat is None or lon is None:
            return None
        return {
            "centroid": (float(lat), float(lon)),
            "bbox": {
                "north": float(lat), "south": float(lat),
                "east":  float(lon), "west":  float(lon),
            },
            "polygon": None,
        }

    # Way: geometry is a single line, treat as polygon ring
    if t == "way":
        geom = feature.get("geometry") or []
        if len(geom) < 3:
            return None
        ring = _ring_to_geojson(geom)
        coords = [(p["lat"], p["lon"]) for p in geom]
        lat, lon, bbox = _bbox_centroid(coords)
        return {
            "centroid": (lat, lon),
            "bbox": bbox,
            "polygon": {"type": "Polygon", "coordinates": [ring]},
        }

    # Relation: walk members, gather outer rings
    if t == "relation":
        outer_rings = []
        all_coords = []
        for m in feature.get("members") or []:
            if m.get("type") != "way":
                continue
            geom = m.get("geometry") or []
            if len(geom) < 3:
                continue
            role = (m.get("role") or "").lower()
            if role and role != "outer":
                # Skip inner (holes) for v1 simplicity — coverage matters
                # more than topological correctness for our use case.
                continue
            outer_rings.append(_ring_to_geojson(geom))
            for p in geom:
                all_coords.append((p["lat"], p["lon"]))
        if not outer_rings or not all_coords:
            return None
        lat, lon, bbox = _bbox_centroid(all_coords)
        if len(outer_rings) == 1:
            poly = {"type": "Polygon", "coordinates": [outer_rings[0]]}
        else:
            # Multiple disjoint rings → MultiPolygon
            poly = {
                "type": "MultiPolygon",
                "coordinates": [[r] for r in outer_rings],
            }
        return {"centroid": (lat, lon), "bbox": bbox, "polygon": poly}

    return None


# ---------------------------------------------------------------------------
# Name normalisation + indexing
# ---------------------------------------------------------------------------

def _norm(s: str | None) -> str:
    if not s:
        return ""
    s = s.strip().upper()
    # Hyphens / underscores act as word separators in DLD names
    # (Al-Bastakiyah, Al-Murar Qadeem → AL BASTAKIYAH, AL MURAR QADEEM)
    s = re.sub(r"[-_]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def _build_match_keys(name: str) -> list[str]:
    """Generate every reasonable lookup key for an area name."""
    keys = set()
    n = _norm(name)
    if n:
        keys.add(n)
        # No "AL " prefix (DLD areas often start with Al but OSM may not)
        if n.startswith("AL "):
            keys.add(n[3:])
        # Trailing ordinal → digit
        ord_map = {"FIRST": "1", "SECOND": "2", "THIRD": "3",
                   "FOURTH": "4", "FIFTH": "5", "SIXTH": "6", "SEVENTH": "7"}
        for ord_word, digit in ord_map.items():
            if n.endswith(" " + ord_word):
                keys.add(n[: -len(ord_word) - 1] + " " + digit)
                keys.add(n[: -len(ord_word) - 1].strip())  # also bare-stem
    return sorted(keys)


def index_features(features: list[dict]) -> dict[str, dict]:
    """Build name→feature dict. For each OSM feature, extract every variant
    of its name (English, official-name, alt_name etc) and index by all of
    them. Conflicts: keep the first hit with the most complete geometry."""
    index: dict[str, dict] = {}
    skipped = 0
    for feat in features:
        tags = feat.get("tags") or {}
        if not tags:
            skipped += 1
            continue
        geom = _extract_geometry(feat)
        if not geom:
            skipped += 1
            continue
        # All name-bearing tags
        name_candidates = set()
        for key in ("name", "name:en", "official_name", "official_name:en",
                    "alt_name", "alt_name:en", "loc_name"):
            v = tags.get(key)
            if v:
                name_candidates.add(v)
        for raw in name_candidates:
            for k in _build_match_keys(raw):
                if not k:
                    continue
                existing = index.get(k)
                # Prefer features with a polygon over point-only features
                if existing is None:
                    index[k] = geom
                elif existing.get("polygon") is None and geom.get("polygon") is not None:
                    index[k] = geom
    print(f"  indexed {len(index):,} name keys from {len(features):,} OSM features "
          f"({skipped} skipped — no name/geom)", flush=True)
    return index


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def find_match(area_name: str, index: dict[str, dict]) -> Optional[dict]:
    """Try multiple keys for an area until one hits.

    Match strategy:
      1. Exact key match using normalised + ordinal-expanded variants
      2. Community alias variants (e.g. Wadi Al Safa 5 → Arabian Ranches)
      3. Transliteration-tolerant variants (apostrophe-strip, double→single
         letter collapse, common e/a vowel swaps for DLD spellings)
      4. Fuzzy match via difflib with ratio >= 0.85 — only as a last resort
         since false positives are expensive
    """
    import difflib

    # 1+2: exact keys
    queries = _build_match_keys(area_name)
    community = admin_sector_to_community(area_name.lower())
    if community:
        queries.extend(_build_match_keys(community))
    for q in queries:
        hit = index.get(q)
        if hit:
            return hit

    # 3: transliteration variants — compose all transforms (suffix-strip,
    # vowel-collapse, swaps) so e.g. "Al-Riqqa East" gets BOTH the EAST
    # suffix stripped AND RIQQA→RIGGA applied to reach AL RIGGA.
    base = _norm(area_name)
    swaps = [
        ("MAMZER", "MAMZAR"), ("MAMZAR", "MAMZER"),
        ("JAFLIYA", "JAFFILIYA"), ("JAFLIYA", "JAFILIYA"),
        ("SAFFA", "SAFA"), ("SAFA", "SAFFA"),
        ("THANAYAH", "THANYAH"),  # OSM has THANYAH (with H), not THANYA
        ("MURQABAT", "MARAQABAT"), ("MERKADH", "MERKADHA"),
        ("BHARIYAH", "BAHRIYAH"),
        ("GOZE", "QUOZ"), ("QUOZ", "GOZE"),
        ("MARARR", "MURAR"), ("BARSHAA", "BARSHA"),
        ("BAAGH", "BAGH"), ("ASBAQ", "ASBAG"),
        ("DZAHIYYAH", "DAHIYAH"),
        ("BALOOSH", "BALUSH"),
        # Bastakiya is the historic Persian quarter; OSM uses AL FAHIDI now
        ("BASTAKIYAH", "FAHIDI"),
        # Al-Riqqa is the DLD spelling; OSM uses AL RIGGA
        ("RIQQA", "RIGGA"),
    ]
    drop_suffixes = (
        " EAST", " WEST", " NORTH", " SOUTH",
        " QADEEM",  # Arabic "old"
        " OLD",
        " INDUSTRIAL FIRST", " INDUSTRIAL SECOND",
        " INDUSTRIAL THIRD", " INDUSTRIAL FOURTH",
    )

    def _expand(b: str) -> set[str]:
        """All single-transform variants of b (apostrophe-strip, consonant /
        vowel collapse, swap, suffix-strip). Caller composes by feeding
        results back through _expand for closure."""
        out = set()
        if "'" in b:
            out.add(b.replace("'", ""))
        c = re.sub(r"([BCDFGHJKLMNPRSTWZ])\1+", r"\1", b)
        if c != b:
            out.add(c)
        c2 = re.sub(r"([AEIOU])\1+", r"\1", b)
        if c2 != b:
            out.add(c2)
        for old, new in swaps:
            if old in b:
                out.add(b.replace(old, new))
        for suffix in drop_suffixes:
            if b.endswith(suffix):
                out.add(b[: -len(suffix)])
                if "INDUSTRIAL" in suffix:
                    out.add(b[: -len(suffix)] + " INDUSTRIAL")
        return out

    # Iterate _expand to a fixed point (bounded — variants converges fast)
    variants = {base}
    for _ in range(4):  # 4 rounds is more than enough for compositions seen
        new = set()
        for v in variants:
            new |= _expand(v)
        if new.issubset(variants):
            break
        variants |= new

    for variant in variants:
        for k in _build_match_keys(variant):
            hit = index.get(k)
            if hit:
                return hit

    # 4: fuzzy match (last resort). 0.85 is conservative — catches
    # MARARR→MURAR but rejects unrelated short names.
    candidates = difflib.get_close_matches(base, list(index.keys()), n=1, cutoff=0.85)
    if candidates:
        return index[candidates[0]]
    return None


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------

def get_sync_db_url() -> str:
    env_path = ROOT / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


def in_dubai(lat: float, lon: float) -> bool:
    return (DUBAI_BBOX["south"] <= lat <= DUBAI_BBOX["north"]
            and DUBAI_BBOX["west"] <= lon <= DUBAI_BBOX["east"])


def confidence_from_polygon(geom: dict) -> str:
    """Polygon-bearing features → 'high'; point-only → 'medium'."""
    return "high" if geom.get("polygon") else "medium"


def step_a_fill_null(cur, index: dict[str, dict]) -> dict:
    """For NULL canonical areas, try to match in Overpass and UPDATE."""
    cur.execute(
        "SELECT area_name, area_name_upper FROM dld_canonical_areas "
        "WHERE latitude IS NULL ORDER BY area_name"
    )
    todo = cur.fetchall()
    print(f"  {len(todo)} NULL areas to attempt", flush=True)
    resolved = 0
    confidences = {"high": 0, "medium": 0}
    still_null = []
    for area_name, area_name_upper in todo:
        match = find_match(area_name, index)
        if not match:
            still_null.append(area_name)
            continue
        lat, lon = match["centroid"]
        if not in_dubai(lat, lon):
            still_null.append(area_name)
            continue
        bbox = match["bbox"]
        conf = confidence_from_polygon(match)
        cur.execute(
            """
            UPDATE dld_canonical_areas
            SET latitude = %s, longitude = %s,
                bbox_north = %s, bbox_south = %s,
                bbox_east  = %s, bbox_west  = %s,
                coords_source = 'overpass',
                coords_confidence = %s,
                polygon = %s
            WHERE area_name_upper = %s
            """,
            (lat, lon, bbox["north"], bbox["south"], bbox["east"], bbox["west"],
             conf, json.dumps(match["polygon"]) if match["polygon"] else None,
             area_name_upper),
        )
        resolved += 1
        confidences[conf] += 1
    return {"resolved": resolved, "still_null": still_null, "confidences": confidences}


def step_b_upgrade_polygons(cur, index: dict[str, dict]) -> int:
    """For canonical areas that DO have coords but no polygon, try to
    attach a polygon from Overpass (keeping their existing coords/source).
    """
    cur.execute(
        "SELECT area_name, area_name_upper FROM dld_canonical_areas "
        "WHERE polygon IS NULL AND latitude IS NOT NULL "
        "ORDER BY area_name"
    )
    todo = cur.fetchall()
    print(f"  {len(todo)} areas with coords but no polygon — attempting upgrade", flush=True)
    upgraded = 0
    for area_name, area_name_upper in todo:
        match = find_match(area_name, index)
        if not match or not match.get("polygon"):
            continue
        cur.execute(
            "UPDATE dld_canonical_areas SET polygon = %s "
            "WHERE area_name_upper = %s",
            (json.dumps(match["polygon"]), area_name_upper),
        )
        upgraded += 1
    print(f"  upgraded {upgraded} areas with OSM polygons", flush=True)
    return upgraded


# ---------------------------------------------------------------------------
# JSON re-export
# ---------------------------------------------------------------------------

def export_json(cur, path: Path) -> int:
    cur.execute(
        """
        SELECT id::text, area_name, area_name_upper, area_name_slug,
               latitude, longitude,
               bbox_north, bbox_south, bbox_east, bbox_west,
               coords_source, coords_confidence, polygon
        FROM dld_canonical_areas ORDER BY area_name
        """
    )
    records = []
    for r in cur.fetchall():
        records.append({
            "id": r[0], "area_name": r[1], "area_name_upper": r[2],
            "area_name_slug": r[3], "latitude": r[4], "longitude": r[5],
            "bbox": [r[6], r[7], r[8], r[9]] if all(x is not None for x in r[6:10]) else None,
            "coords_source": r[10], "coords_confidence": r[11],
            "polygon": r[12],
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
    print(f"  {'source':<20} {'confidence':<11} {'count':>6}")
    for src, conf, n in cur.fetchall():
        print(f"  {(src or 'null'):<20} {(conf or 'null'):<11} {n:>6,}")

    cur.execute(
        """
        SELECT
          COUNT(*) FILTER (WHERE latitude IS NOT NULL),
          COUNT(*) FILTER (WHERE polygon IS NOT NULL),
          COUNT(*) FILTER (WHERE latitude IS NULL),
          COUNT(*)
        FROM dld_canonical_areas
        """
    )
    w, p, n, t = cur.fetchone()
    print(f"\n  with coords  : {w}/{t}  ({w*100/t:.1f}%)")
    print(f"  with polygon : {p}/{t}  ({p*100/t:.1f}%)")
    print(f"  still NULL   : {n}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to-db", action="store_true")
    parser.add_argument("--upgrade-poly", action="store_true",
                        help="Also attach polygons to areas that already have coords")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="  %(levelname)s %(message)s")
    started_at = dt.datetime.utcnow()

    print("Fetching Dubai admin boundaries from Overpass...", flush=True)
    raw = fetch_overpass()
    features = raw.get("elements") or []
    print(f"  got {len(features):,} OSM features", flush=True)

    print("\nIndexing by name variants...", flush=True)
    index = index_features(features)

    if not args.to_db:
        print("\nDry run — pass --to-db to commit", flush=True)
        # Show a sample of what we'd hit
        sample_count = 0
        for k in sorted(index.keys()):
            if "BUSINESS" in k or "MARINA" in k or "MAMZER" in k or "JAFLIYA" in k:
                geom = index[k]
                print(f"  {k:<40} centroid={geom['centroid']} polygon={'yes' if geom['polygon'] else 'no'}")
                sample_count += 1
                if sample_count >= 8:
                    break
        return 0

    import psycopg2
    dsn = get_sync_db_url()
    print(f"\nConnecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            print("\nStep A — fill NULL canonical areas from Overpass matches", flush=True)
            summary = step_a_fill_null(cur, index)
            conn.commit()
            print(
                f"  resolved {summary['resolved']} "
                f"({summary['confidences']['high']} high, "
                f"{summary['confidences']['medium']} medium)",
                flush=True,
            )
            if summary["still_null"]:
                print(f"  still NULL: {len(summary['still_null'])}")
                for n in summary["still_null"][:20]:
                    print(f"    · {n}")
                if len(summary["still_null"]) > 20:
                    print(f"    … and {len(summary['still_null']) - 20} more")

            if args.upgrade_poly:
                print("\nStep B — upgrade existing-coords areas with OSM polygons", flush=True)
                step_b_upgrade_polygons(cur, index)
                conn.commit()

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
