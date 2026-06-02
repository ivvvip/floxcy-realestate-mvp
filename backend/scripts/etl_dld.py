"""DLD ETL pipeline — Dubai Land Department CSV snapshots → Postgres.

Reads CSVs from $DLD_DATA_DIR (default ~/dld-data), dedupes the 7 rent splits,
normalizes area names case-insensitively, computes per-area + per-building +
per-benchmark metrics, and (with --to-db) writes them to the dld_* tables.

Usage:
    python scripts/etl_dld.py              # dry-run: compute + print summary
    python scripts/etl_dld.py --to-db      # actually write to Postgres
    python scripts/etl_dld.py --to-db --update-curated  # also write a fresh
                                                          market_snapshot row
                                                          per matched curated area

Reads DATABASE_URL from backend/.env (asyncpg URL is converted to sync psycopg2).
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import os
import re
import statistics
import sys
import uuid
from pathlib import Path
from typing import Optional

# Local shared module — same directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _dld_category import (  # noqa: E402
    RESIDENTIAL_AMOUNT_MIN,
    RESIDENTIAL_CATEGORIES,
    classify_property,
    is_bulk_contract,
    is_residential,
    residential_amount_cap,
)

DATA_DIR = Path(os.environ.get("DLD_DATA_DIR", str(Path.home() / "dld-data")))
TODAY = dt.date(2026, 6, 1)

SIZE_BANDS = [
    ("<50", 0, 50),
    ("50-99", 50, 100),
    ("100-149", 100, 150),
    ("150-199", 150, 200),
    ("200-299", 200, 300),
    ("300+", 300, float("inf")),
]
MIN_BENCHMARK_SAMPLES = 5


def norm(s: Optional[str]) -> str:
    if not s:
        return ""
    return s.strip().lower()


def to_title(s: str) -> str:
    return " ".join(w.capitalize() for w in s.split())


def parse_float(s: Optional[str]) -> Optional[float]:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_int(s: Optional[str]) -> Optional[int]:
    f = parse_float(s)
    return int(f) if f is not None else None


def parse_date(s: Optional[str]) -> Optional[dt.date]:
    if not s:
        return None
    try:
        return dt.date.fromisoformat(s[:10])
    except ValueError:
        return None


def parse_datetime(s: Optional[str]) -> Optional[dt.datetime]:
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(s.replace(" ", "T")[:19])
    except ValueError:
        return None


def parse_bool(s: Optional[str]) -> Optional[bool]:
    if not s:
        return None
    s = s.strip().lower()
    if s in ("yes", "true", "free hold", "off-plan", "off plan", "offplan"):
        return True
    if s in ("no", "false", "non free hold", "ready"):
        return False
    return None


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    vs = sorted(values)
    k = (len(vs) - 1) * pct
    f = int(k)
    c = min(f + 1, len(vs) - 1)
    if f == c:
        return vs[f]
    return vs[f] + (vs[c] - vs[f]) * (k - f)


def size_band_of(sqm: Optional[float]) -> Optional[str]:
    if sqm is None or sqm <= 0:
        return None
    for label, lo, hi in SIZE_BANDS:
        if lo <= sqm < hi:
            return label
    return None


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_csv(path: Path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def load_rents_categorized(years: tuple[int, ...] = (2025, 2026)) -> dict[str, list[dict]]:
    """Stream rents_2021_2026.csv (NEW 41-column schema), classify each row
    by property_category, and split into per-category lists.

    Each surviving row is annotated with:
        row["_category"]       — apartment / villa / hotel_apt / labor_camp /
                                 office / retail / warehouse / whole_building /
                                 other
        row["_is_person"]      — True when tenant_type_en == 'Person'
        row["_is_bulk"]        — bulk-contract flag (see _dld_category)

    Residential rows are additionally subject to the 10K-500K annual_amount
    cap (except villas — they retain higher amounts and just get bulk-flagged
    when no_of_prop > 1). This is the snapshot ETL; the historical ETL applies
    the same taxonomy across 2021-2026.
    """
    path = DATA_DIR / "rents_2021_2026.csv"
    if not path.exists():
        raise SystemExit(f"NEW rents source not found: {path}")

    years_set = {str(y) for y in years}
    buckets: dict[str, list[dict]] = collections.defaultdict(list)
    seen_total = 0
    seen_authority = 0
    seen_amount_out_of_band = 0

    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = (row.get("contract_start_date") or "")[:4]
            if date not in years_set:
                continue
            seen_total += 1

            category = classify_property(
                row.get("ejari_property_type_en"),
                row.get("ejari_property_sub_type_en"),
                row.get("ejari_bus_property_type_en"),
            )

            tenant = (row.get("tenant_type_en") or "").strip()
            is_person = tenant == "Person"
            if tenant == "Authority":
                seen_authority += 1

            amt = parse_float(row.get("annual_amount"))
            nprop = parse_int(row.get("no_of_prop"))
            bulk = is_bulk_contract(category, amt, nprop)

            # Residential per-category caps. Apartment 10K-2M, Villa 10K-5M,
            # Hotel Apt 10K-3M. Generous enough to keep Burj Khalifa-tier
            # penthouses, Palm villas, and 5* serviced apartments in the
            # residential pool.
            if is_residential(category):
                if amt is None:
                    continue
                if amt < RESIDENTIAL_AMOUNT_MIN:
                    seen_amount_out_of_band += 1
                    continue
                cap = residential_amount_cap(category)
                if cap is not None and amt > cap:
                    seen_amount_out_of_band += 1
                    continue

            row["_category"] = category
            row["_is_person"] = is_person
            row["_is_bulk"] = bulk
            buckets[category].append(row)

    summary = ", ".join(
        f"{k}={len(v):,}" for k, v in sorted(buckets.items()) if v
    )
    print(
        f"[etl] rent classify: scanned {seen_total:,} in years {years_set} | "
        f"by category: {summary} | "
        f"dropped {seen_amount_out_of_band:,} residential amounts outside per-category caps "
        f"(apt 10K-2M, villa 10K-5M, hotel_apt 10K-3M) | "
        f"Authority tenants seen: {seen_authority:,} (kept tagged for audit)",
        flush=True,
    )
    return buckets


def residential_person_rents(
    buckets: dict[str, list[dict]],
    include_bulk: bool = False,
) -> list[dict]:
    """Subset = apartment+villa+hotel_apt where _is_person=True (and
    optionally non-bulk). This is the canonical input for area_metrics,
    buildings, and the residential benchmark cells we actually trust.
    """
    out: list[dict] = []
    for cat in RESIDENTIAL_CATEGORIES:
        for r in buckets.get(cat, []):
            if not r.get("_is_person"):
                continue
            if not include_bulk and r.get("_is_bulk"):
                continue
            out.append(r)
    return out


# ---------------------------------------------------------------------------
# Compute area display names — pick the best Title-Case form per norm key
# ---------------------------------------------------------------------------

def collect_areas(
    *sources: tuple[list[dict], str],
) -> dict[str, str]:
    """Returns {name_norm: name_display} — display is best Title-Case observed.

    Each source is a tuple of (rows, column_name) since the OLD-schema CSVs
    (transactions, buildings, lands) use AREA_EN while the NEW-schema rents
    file uses area_name_en.
    """
    counts: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for rows, col in sources:
        for row in rows:
            v = (row.get(col) or "").strip()
            if not v:
                continue
            n = v.lower()
            counts[n][v] += 1

    out: dict[str, str] = {}
    for n, c in counts.items():
        # Prefer the variant that is NOT fully uppercase if available.
        best = None
        for variant, _cnt in c.most_common():
            if variant.upper() != variant:
                best = variant
                break
        if best is None:
            best = to_title(n)
        out[n] = best
    return out


# ---------------------------------------------------------------------------
# Per-area metrics
# ---------------------------------------------------------------------------

def compute_area_metrics(txns: list[dict], rents_2026: list[dict], rents_2025: list[dict]):
    """Return {name_norm: {metric: value, ...}}."""

    # Sales price per sqft (GROUP_EN='Sales' only, ACTUAL_AREA > 0)
    sales_ppsf: dict[str, list[float]] = collections.defaultdict(list)
    sales_count: dict[str, int] = collections.Counter()
    for r in txns:
        if r.get("GROUP_EN") != "Sales":
            continue
        area = norm(r.get("AREA_EN"))
        if not area:
            continue
        sales_count[area] += 1
        v = parse_float(r.get("TRANS_VALUE"))
        a = parse_float(r.get("ACTUAL_AREA"))
        if v is None or a is None or a <= 0 or v <= 0:
            continue
        ppsf = v / a
        # Sanity filter — exclude obvious data errors
        if ppsf < 100 or ppsf > 20000:
            continue
        sales_ppsf[area].append(ppsf)

    # Rents 2026: annual rent + annual rent per sqft (NEW schema column names)
    rent_amounts: dict[str, list[float]] = collections.defaultdict(list)
    rent_ppsf: dict[str, list[float]] = collections.defaultdict(list)
    rent_count_2026: dict[str, int] = collections.Counter()
    for r in rents_2026:
        area = norm(r.get("area_name_en"))
        if not area:
            continue
        rent_count_2026[area] += 1
        amt = parse_float(r.get("annual_amount"))
        a = parse_float(r.get("actual_area"))
        if amt is None or amt <= 0:
            continue
        rent_amounts[area].append(amt)
        if a and a > 0:
            ppsf = amt / a
            if 10 <= ppsf <= 5000:
                rent_ppsf[area].append(ppsf)

    # Rents 2025: just rent per sqft median (for YoY)
    rent_ppsf_2025: dict[str, list[float]] = collections.defaultdict(list)
    rent_count_2025: dict[str, int] = collections.Counter()
    for r in rents_2025:
        area = norm(r.get("area_name_en"))
        if not area:
            continue
        rent_count_2025[area] += 1
        amt = parse_float(r.get("annual_amount"))
        a = parse_float(r.get("actual_area"))
        if amt is None or a is None or amt <= 0 or a <= 0:
            continue
        ppsf = amt / a
        if 10 <= ppsf <= 5000:
            rent_ppsf_2025[area].append(ppsf)

    all_areas = set(sales_ppsf) | set(rent_amounts) | set(rent_count_2026) | set(rent_count_2025) | set(sales_count)
    out: dict[str, dict] = {}
    for a in all_areas:
        sp = sales_ppsf.get(a, [])
        rp = rent_ppsf.get(a, [])
        ra = rent_amounts.get(a, [])
        rp25 = rent_ppsf_2025.get(a, [])

        median_ppsf = statistics.median(sp) if sp else None
        median_rent_ppsf = statistics.median(rp) if rp else None
        median_rent_ppsf_2025 = statistics.median(rp25) if rp25 else None

        yield_pct = None
        if median_ppsf and median_rent_ppsf:
            yield_pct = (median_rent_ppsf / median_ppsf) * 100

        growth = None
        if median_rent_ppsf and median_rent_ppsf_2025 and median_rent_ppsf_2025 > 0:
            growth = (median_rent_ppsf / median_rent_ppsf_2025 - 1) * 100

        out[a] = dict(
            avg_price_per_sqft=(sum(sp) / len(sp)) if sp else None,
            median_price_per_sqft=median_ppsf,
            sales_count=sales_count.get(a, 0),
            avg_annual_rent=(sum(ra) / len(ra)) if ra else None,
            median_annual_rent=statistics.median(ra) if ra else None,
            avg_rent_per_sqft=(sum(rp) / len(rp)) if rp else None,
            median_rent_per_sqft=median_rent_ppsf,
            rent_count_2026=rent_count_2026.get(a, 0),
            rental_yield_pct=yield_pct,
            rent_growth_yoy_pct=growth,
        )
    return out, rent_count_2025


# ---------------------------------------------------------------------------
# Buildings — match to rents via PROJECT_EN
# ---------------------------------------------------------------------------

def compute_buildings(buildings: list[dict], rents_2026: list[dict]):
    # Index rents by (area_norm, project_name_en) to find per-building rents.
    # buildings CSV (OLD schema) still uses PROJECT_EN/AREA_EN; rents (NEW
    # schema) uses project_name_en/area_name_en — case-insensitive match.
    proj_rents: dict[tuple[str, str], list[tuple[float, float]]] = collections.defaultdict(list)
    for r in rents_2026:
        proj = (r.get("project_name_en") or "").strip()
        area = norm(r.get("area_name_en"))
        if not proj or not area:
            continue
        amt = parse_float(r.get("annual_amount"))
        a = parse_float(r.get("actual_area"))
        if amt is None or amt <= 0:
            continue
        proj_rents[(area, proj.strip().lower())].append((amt, a or 0))

    out: list[dict] = []
    for b in buildings:
        area_n = norm(b.get("AREA_EN"))
        proj_name = (b.get("PROJECT_EN") or "").strip()
        proj_key = (area_n, proj_name.lower()) if proj_name else None

        rents_for = proj_rents.get(proj_key, []) if proj_key else []
        amts = [a for a, _ in rents_for if a > 0]
        ppsfs = [a / sq for a, sq in rents_for if sq > 0 and a > 0]
        flats = parse_int(b.get("FLATS")) or 0
        occ = None
        if flats > 0:
            occ = min(100.0, (len(rents_for) / flats) * 100)

        out.append(dict(
            area_norm=area_n if area_n else None,
            project_number=(b.get("PROJECT_NUMBER") or "").strip() or None,
            project_name=proj_name or None,
            master_project=(b.get("MASTER_PROJECT_EN") or "").strip() or None,
            zone=(b.get("ZONE_EN") or "").strip() or None,
            prop_sub_type=(b.get("PROP_SUB_TYPE_EN") or "").strip() or None,
            land_type=(b.get("LAND_TYPE_EN") or "").strip() or None,
            actual_area=parse_float(b.get("ACTUAL_AREA")),
            built_up_area=parse_float(b.get("BUILT_UP_AREA")),
            flats=flats or None,
            shops=parse_int(b.get("SHOPS")),
            offices=parse_int(b.get("OFFICES")),
            floors=parse_int(b.get("FLOORS")),
            bld_levels=parse_int(b.get("BLD_LEVELS")),
            elevators=parse_int(b.get("ELEVATORS")),
            swimming_pools=parse_int(b.get("SWIMMING_POOLS")),
            car_parks=parse_int(b.get("CAR_PARKS")),
            is_freehold=parse_bool(b.get("IS_FREE_HOLD_EN")),
            is_offplan=parse_bool(b.get("IS_OFFPLAN_EN")),
            creation_date=parse_datetime(b.get("CREATION_DATE")),
            avg_annual_rent=(sum(amts) / len(amts)) if amts else None,
            avg_rent_per_sqft=(sum(ppsfs) / len(ppsfs)) if ppsfs else None,
            active_rent_count=len(rents_for),
            occupancy_proxy_pct=occ,
        ))
    return out


# ---------------------------------------------------------------------------
# Rent benchmarks by (area, prop_sub_type, size_band)
# ---------------------------------------------------------------------------

def compute_benchmarks(buckets: dict[str, list[dict]]):
    """Compute per-(area, sub_type, size_band, category, is_bulk) rent
    benchmarks across the residential categories.

    Bulk-flagged contracts get their own cells rather than being dropped —
    consumer-facing UI should query is_bulk_contract=false; B2B can opt in.
    """
    bucket: dict[
        tuple[str, str, str, str, bool],
        list[tuple[float, float]],
    ] = collections.defaultdict(list)

    for category in RESIDENTIAL_CATEGORIES:
        for r in buckets.get(category, []):
            if not r.get("_is_person"):
                continue
            area = norm(r.get("area_name_en"))
            # prop_sub_type semantics match the OLD pipeline: it's the
            # property sub-type (Flat / Studio / Villa / Hotel apartments)
            # — the same value the /dld/rent-check endpoint passes from
            # the user's UI choice. The NEW historical CSV puts that string
            # in ejari_property_type_en; ejari_property_sub_type_en holds
            # bedroom-count granularity ("1 bed rooms+hall") which would
            # explode the cell count and break rent-check lookups.
            pst = (r.get("ejari_property_type_en") or "").strip()
            if not area or not pst:
                continue
            amt = parse_float(r.get("annual_amount"))
            sq = parse_float(r.get("actual_area"))
            if amt is None or amt <= 0 or sq is None or sq <= 0:
                continue
            band = size_band_of(sq)
            if not band:
                continue
            ppsf = amt / sq
            if not (10 <= ppsf <= 5000):
                continue
            is_bulk = bool(r.get("_is_bulk"))
            bucket[(area, pst, band, category, is_bulk)].append((amt, ppsf))

    out: list[dict] = []
    for (area, pst, band, category, is_bulk), pairs in bucket.items():
        if len(pairs) < MIN_BENCHMARK_SAMPLES:
            continue
        amts = sorted(p[0] for p in pairs)
        ppsfs = sorted(p[1] for p in pairs)
        out.append(dict(
            area_norm=area, prop_sub_type=pst, size_band=band,
            property_usage="Residential",
            property_category=category,
            is_bulk_contract=is_bulk,
            sample_count=len(pairs),
            p10_annual_rent=percentile(amts, 0.10),
            p25_annual_rent=percentile(amts, 0.25),
            median_annual_rent=percentile(amts, 0.50),
            p75_annual_rent=percentile(amts, 0.75),
            p90_annual_rent=percentile(amts, 0.90),
            p25_rent_per_sqft=percentile(ppsfs, 0.25),
            median_rent_per_sqft=percentile(ppsfs, 0.50),
            p75_rent_per_sqft=percentile(ppsfs, 0.75),
        ))
    return out


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------

def get_sync_db_url() -> str:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(env_path)
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    # asyncpg URL -> psycopg2 URL
    return url.replace("postgresql+asyncpg://", "postgresql://")


def write_to_db(
    *,
    areas: dict[str, str],
    area_counts: dict,
    metrics: dict[str, dict],
    buildings: list[dict],
    brokers: list[dict],
    benchmarks: list[dict],
    update_curated: bool,
):
    import psycopg2
    import psycopg2.extras

    url = get_sync_db_url()
    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        # ---- dld_areas — upsert ----
        print("[db] upserting dld_areas...", flush=True)
        area_norm_to_id: dict[str, str] = {}
        # First pass: gather curated_area_id matches
        cur.execute("SELECT id, name FROM areas")
        curated = {norm(n): str(i) for i, n in cur.fetchall()}

        rows = []
        for n, disp in areas.items():
            curated_id = curated.get(n)
            rows.append((
                str(uuid.uuid4()), n, disp, curated_id,
                area_counts["txn"].get(n, 0),
                area_counts["rent_2026"].get(n, 0),
                area_counts["rent_2025"].get(n, 0),
                area_counts["building"].get(n, 0),
                area_counts["land"].get(n, 0),
            ))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO dld_areas (id, name_norm, name_display, curated_area_id,
                txn_count, rent_count_2026, rent_count_2025, building_count, land_count)
            VALUES %s
            ON CONFLICT (name_norm) DO UPDATE SET
                name_display = EXCLUDED.name_display,
                curated_area_id = EXCLUDED.curated_area_id,
                txn_count = EXCLUDED.txn_count,
                rent_count_2026 = EXCLUDED.rent_count_2026,
                rent_count_2025 = EXCLUDED.rent_count_2025,
                building_count = EXCLUDED.building_count,
                land_count = EXCLUDED.land_count,
                updated_at = NOW()
            """,
            rows,
        )
        cur.execute("SELECT name_norm, id FROM dld_areas")
        area_norm_to_id = {n: str(i) for n, i in cur.fetchall()}
        print(f"[db]   dld_areas: {len(rows)} rows", flush=True)

        # ---- dld_area_metrics — wipe + reinsert for the current period ----
        print("[db] writing dld_area_metrics...", flush=True)
        cur.execute("DELETE FROM dld_area_metrics WHERE period = '2026-ytd'")
        rows = []
        for area_norm_key, m in metrics.items():
            aid = area_norm_to_id.get(area_norm_key)
            if not aid:
                continue
            rows.append((
                str(uuid.uuid4()), aid, "2026-ytd",
                m["avg_price_per_sqft"], m["median_price_per_sqft"], m["sales_count"],
                m["avg_annual_rent"], m["median_annual_rent"],
                m["avg_rent_per_sqft"], m["median_rent_per_sqft"], m["rent_count_2026"],
                m["rental_yield_pct"], m["rent_growth_yoy_pct"],
            ))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO dld_area_metrics (id, dld_area_id, period,
                avg_price_per_sqft, median_price_per_sqft, sales_count,
                avg_annual_rent, median_annual_rent,
                avg_rent_per_sqft, median_rent_per_sqft, rent_count_2026,
                rental_yield_pct, rent_growth_yoy_pct)
            VALUES %s
            """,
            rows,
        )
        print(f"[db]   dld_area_metrics: {len(rows)} rows", flush=True)

        # ---- dld_buildings — wipe + insert ----
        print("[db] writing dld_buildings...", flush=True)
        cur.execute("DELETE FROM dld_buildings")
        rows = []
        for b in buildings:
            aid = area_norm_to_id.get(b["area_norm"]) if b["area_norm"] else None
            rows.append((
                str(uuid.uuid4()), aid,
                b["project_number"], b["project_name"], b["master_project"], b["zone"],
                b["prop_sub_type"], b["land_type"],
                b["actual_area"], b["built_up_area"],
                b["flats"], b["shops"], b["offices"], b["floors"], b["bld_levels"],
                b["elevators"], b["swimming_pools"], b["car_parks"],
                b["is_freehold"], b["is_offplan"], b["creation_date"],
                b["avg_annual_rent"], b["avg_rent_per_sqft"],
                b["active_rent_count"], b["occupancy_proxy_pct"],
            ))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO dld_buildings (id, dld_area_id,
                project_number, project_name, master_project, zone,
                prop_sub_type, land_type, actual_area, built_up_area,
                flats, shops, offices, floors, bld_levels, elevators,
                swimming_pools, car_parks, is_freehold, is_offplan, creation_date,
                avg_annual_rent, avg_rent_per_sqft, active_rent_count, occupancy_proxy_pct)
            VALUES %s
            """,
            rows,
            page_size=500,
        )
        print(f"[db]   dld_buildings: {len(rows)} rows", flush=True)

        # ---- dld_rera_brokers — wipe + insert ----
        print("[db] writing dld_rera_brokers...", flush=True)
        cur.execute("DELETE FROM dld_rera_brokers")
        rows = []
        for b in brokers:
            rows.append((
                b["broker_number"], b["full_name"], b["gender"],
                b["license_start_date"], b["license_end_date"], b["is_active"],
                b["webpage"], b["phone"], b["fax"],
                b["real_estate_number"], b["real_estate_name"],
            ))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO dld_rera_brokers (broker_number, full_name, gender,
                license_start_date, license_end_date, is_active,
                webpage, phone, fax, real_estate_number, real_estate_name)
            VALUES %s
            """,
            rows,
            page_size=1000,
        )
        print(f"[db]   dld_rera_brokers: {len(rows)} rows", flush=True)

        # ---- dld_rent_benchmarks — wipe + insert ----
        print("[db] writing dld_rent_benchmarks...", flush=True)
        cur.execute("DELETE FROM dld_rent_benchmarks WHERE period = '2026'")
        rows = []
        for bm in benchmarks:
            aid = area_norm_to_id.get(bm["area_norm"])
            if not aid:
                continue
            rows.append((
                str(uuid.uuid4()), aid, bm["prop_sub_type"], bm["size_band"], "2026",
                bm["property_usage"],
                bm["property_category"],
                bm["is_bulk_contract"],
                bm["sample_count"],
                bm["p10_annual_rent"], bm["p25_annual_rent"], bm["median_annual_rent"],
                bm["p75_annual_rent"], bm["p90_annual_rent"],
                bm["p25_rent_per_sqft"], bm["median_rent_per_sqft"], bm["p75_rent_per_sqft"],
            ))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO dld_rent_benchmarks (id, dld_area_id,
                prop_sub_type, size_band, period, property_usage,
                property_category, is_bulk_contract, sample_count,
                p10_annual_rent, p25_annual_rent, median_annual_rent,
                p75_annual_rent, p90_annual_rent,
                p25_rent_per_sqft, median_rent_per_sqft, p75_rent_per_sqft)
            VALUES %s
            """,
            rows,
            page_size=500,
        )
        print(f"[db]   dld_rent_benchmarks: {len(rows)} rows", flush=True)

        # ---- Optionally refresh curated market_snapshots from DLD ----
        if update_curated:
            print("[db] refreshing market_snapshots for matched curated areas...", flush=True)
            cur.execute("""
                SELECT da.curated_area_id, da.name_norm, m.median_price_per_sqft,
                       m.median_annual_rent, m.rental_yield_pct, m.rent_count_2026, m.sales_count
                FROM dld_areas da
                JOIN dld_area_metrics m ON m.dld_area_id = da.id
                WHERE da.curated_area_id IS NOT NULL
                  AND m.period = '2026-ytd'
                  AND m.median_price_per_sqft IS NOT NULL
                  AND m.median_annual_rent IS NOT NULL
            """)
            snapshot_rows = []
            snap_date = dt.date(2026, 5, 31)
            for cid, name_norm_key, ppsf, rent, ypct, rcount, scount in cur.fetchall():
                # avg_sale_price = ppsf × 100 sqm as a placeholder?
                # Better: just leave it derived per-row. Use a typical mid-size unit estimate.
                # The schema requires non-null avg_sale_price; we approximate using ppsf*120 sqm.
                est_price = float(ppsf) * 120
                snapshot_rows.append((
                    str(uuid.uuid4()), str(cid), snap_date,
                    est_price, float(ppsf), float(rent), float(ypct or 0),
                    int(scount or 0), "DLD 2026 YTD",
                ))
            if snapshot_rows:
                # Delete prior DLD-sourced snapshot at same date to keep idempotent
                cur.execute(
                    "DELETE FROM market_snapshots WHERE snapshot_date = %s AND data_source = %s",
                    (snap_date, "DLD 2026 YTD"),
                )
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO market_snapshots (id, area_id, snapshot_date,
                        avg_sale_price, avg_price_per_sqft, avg_annual_rent, rental_yield,
                        transaction_volume, data_source, created_at)
                    VALUES %s
                    """,
                    [(*row, dt.datetime.utcnow()) for row in snapshot_rows],
                )
                print(f"[db]   market_snapshots: {len(snapshot_rows)} curated areas refreshed", flush=True)
            else:
                print("[db]   no curated areas matched DLD metrics", flush=True)

        conn.commit()
        print("[db] commit OK", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# Brokers
# ---------------------------------------------------------------------------

_GENDER_MAP = {"male": "male", "female": "female", "أنثى": "female", "ذكر": "male"}


def compute_brokers(brokers_csv: list[dict]) -> list[dict]:
    out = []
    for r in brokers_csv:
        end = parse_date(r.get("LICENSE_END_DATE"))
        raw_gender = (r.get("GENDER_EN") or "").strip().lower()
        out.append(dict(
            broker_number=(r.get("BROKER_NUMBER") or "").strip(),
            full_name=(r.get("BROKER_EN") or "").strip()[:255],
            gender=_GENDER_MAP.get(raw_gender) or (raw_gender[:16] if raw_gender else None),
            license_start_date=parse_date(r.get("LICENSE_START_DATE")),
            license_end_date=end,
            is_active=bool(end and end >= TODAY),
            webpage=(r.get("WEBPAGE") or "").strip()[:512] or None,
            phone=(r.get("PHONE") or "").strip()[:64] or None,
            fax=(r.get("FAX") or "").strip()[:64] or None,
            real_estate_number=(r.get("REAL_ESTATE_NUMBER") or "").strip()[:32] or None,
            real_estate_name=(r.get("REAL_ESTATE_EN") or "").strip()[:255] or None,
        ))
    # Dedup by broker_number, keep last
    seen = {}
    for b in out:
        if b["broker_number"]:
            seen[b["broker_number"]] = b
    return list(seen.values())


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to-db", action="store_true", help="actually write to DB")
    ap.add_argument("--update-curated", action="store_true",
                    help="refresh market_snapshots for matched curated areas")
    args = ap.parse_args()

    print(f"[etl] DLD data dir: {DATA_DIR}", flush=True)
    if not DATA_DIR.exists():
        sys.exit(f"DLD_DATA_DIR not found: {DATA_DIR}")

    # --- Load
    print("[etl] loading CSVs...", flush=True)
    txns = list(load_csv(DATA_DIR / "transactions-2026-06-01.csv"))
    # NEW: single canonical rent source, fully classified into property
    # categories at stream time. Residential subset feeds area_metrics +
    # buildings + benchmarks; commercial / labor_camp are written by the
    # historical ETL.
    rent_buckets_all = load_rents_categorized(years=(2025, 2026))

    # Split by year for YoY math on the residential person + non-bulk subset.
    def _yr(buckets: dict[str, list[dict]], y: str) -> list[dict]:
        out: list[dict] = []
        for rows in buckets.values():
            out.extend(r for r in rows if (r.get("contract_start_date") or "")[:4] == y)
        return out

    rents_2026_all = _yr(rent_buckets_all, "2026")
    rents_2025_all = _yr(rent_buckets_all, "2025")

    # The 2026 residential snapshot used for area_metrics / buildings is
    # Person + non-bulk only — the cleanest "what a private tenant paid" view.
    buckets_2026 = {c: [r for r in rs if (r.get("contract_start_date") or "")[:4] == "2026"]
                    for c, rs in rent_buckets_all.items()}
    buckets_2025 = {c: [r for r in rs if (r.get("contract_start_date") or "")[:4] == "2025"]
                    for c, rs in rent_buckets_all.items()}
    rents_2026_resi = residential_person_rents(buckets_2026, include_bulk=False)
    rents_2025_resi = residential_person_rents(buckets_2025, include_bulk=False)

    buildings = list(load_csv(DATA_DIR / "buildings-2026-06-01.csv"))
    lands = list(load_csv(DATA_DIR / "lands-2026-06-01.csv"))
    brokers_raw = list(load_csv(DATA_DIR / "brokers-2026-06-01.csv"))

    print(f"[etl]   transactions: {len(txns):,}", flush=True)
    print(
        f"[etl]   rents: 2026 all={len(rents_2026_all):,} residential-person-nonbulk={len(rents_2026_resi):,} | "
        f"2025 all={len(rents_2025_all):,} residential-person-nonbulk={len(rents_2025_resi):,}",
        flush=True,
    )
    print(f"[etl]   buildings: {len(buildings):,}", flush=True)
    print(f"[etl]   lands: {len(lands):,}", flush=True)
    print(f"[etl]   brokers: {len(brokers_raw):,}", flush=True)

    # --- Areas (OLD-schema sources use AREA_EN; NEW-schema rents use area_name_en)
    areas = collect_areas(
        (txns, "AREA_EN"),
        (rents_2026_all, "area_name_en"),
        (rents_2025_all, "area_name_en"),
        (buildings, "AREA_EN"),
        (lands, "AREA_EN"),
    )
    print(f"[etl] canonical DLD areas: {len(areas):,}", flush=True)

    # --- Area counts. Residential-person-nonbulk counts feed dld_areas so
    # the "how much real signal do we have here" stat is honest.
    area_counts = {
        "txn": collections.Counter(norm(r.get("AREA_EN")) for r in txns),
        "rent_2026": collections.Counter(norm(r.get("area_name_en")) for r in rents_2026_resi),
        "rent_2025": collections.Counter(norm(r.get("area_name_en")) for r in rents_2025_resi),
        "building": collections.Counter(norm(r.get("AREA_EN")) for r in buildings),
        "land": collections.Counter(norm(r.get("AREA_EN")) for r in lands),
    }
    for k in area_counts:
        area_counts[k].pop("", None)

    # --- Metrics (residential Person non-bulk only)
    metrics, _rc25 = compute_area_metrics(txns, rents_2026_resi, rents_2025_resi)
    print(f"[etl] area metrics computed: {len(metrics):,}", flush=True)

    # --- Buildings (residential Person non-bulk only)
    bldg_rows = compute_buildings(buildings, rents_2026_resi)

    # --- Brokers
    broker_rows = compute_brokers(brokers_raw)
    active = sum(1 for b in broker_rows if b["is_active"])
    print(f"[etl] brokers (deduped): {len(broker_rows):,} | active today: {active:,}", flush=True)

    # --- Benchmarks (all residential categories × Person × {bulk, non-bulk})
    bench = compute_benchmarks(buckets_2026)
    print(f"[etl] rent benchmark cells (n>={MIN_BENCHMARK_SAMPLES}): {len(bench):,}", flush=True)

    # --- Summary preview
    print("\n[etl] === TOP 10 AREAS BY TRANSACTION COUNT ===")
    print(f"{'area':<36} {'txns':>7} {'sales':>7} {'ppsf':>9} {'rent':>10} {'rent/sqft':>11} {'yield%':>7} {'YoY%':>7}")
    top_areas = sorted(metrics.items(), key=lambda kv: -kv[1]["sales_count"])[:10]
    for a, m in top_areas:
        disp = areas.get(a, a)
        ppsf = m["median_price_per_sqft"]
        rent = m["median_annual_rent"]
        rps = m["median_rent_per_sqft"]
        y = m["rental_yield_pct"]
        g = m["rent_growth_yoy_pct"]
        print(f"{disp[:35]:<36} {area_counts['txn'].get(a, 0):>7} {m['sales_count']:>7} "
              f"{ppsf or 0:>9.0f} {rent or 0:>10.0f} {rps or 0:>11.0f} "
              f"{y or 0:>7.2f} {g if g is not None else 0:>7.2f}")

    if args.to_db:
        write_to_db(
            areas=areas,
            area_counts=area_counts,
            metrics=metrics,
            buildings=bldg_rows,
            brokers=broker_rows,
            benchmarks=bench,
            update_curated=args.update_curated,
        )
    else:
        print("\n[etl] dry-run complete. Re-run with --to-db to persist.")


if __name__ == "__main__":
    main()
