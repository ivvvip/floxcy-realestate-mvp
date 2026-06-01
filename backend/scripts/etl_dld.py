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
import glob
import os
import re
import statistics
import sys
import uuid
from pathlib import Path
from typing import Optional

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


def load_rents_deduped() -> list[dict]:
    rent_files = sorted(glob.glob(str(DATA_DIR / "rents-2026-06-01*.csv")))
    seen: set[tuple] = set()
    rows: list[dict] = []
    for p in rent_files:
        for row in load_csv(Path(p)):
            key = tuple(row.values())
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Compute area display names — pick the best Title-Case form per norm key
# ---------------------------------------------------------------------------

def collect_areas(*sources: list[dict], col: str = "AREA_EN") -> dict[str, str]:
    """Returns {name_norm: name_display} — display is best Title-Case observed."""
    counts: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for src in sources:
        for row in src:
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

    # Rents 2026: annual rent + annual rent per sqft
    rent_amounts: dict[str, list[float]] = collections.defaultdict(list)
    rent_ppsf: dict[str, list[float]] = collections.defaultdict(list)
    rent_count_2026: dict[str, int] = collections.Counter()
    for r in rents_2026:
        area = norm(r.get("AREA_EN"))
        if not area:
            continue
        rent_count_2026[area] += 1
        amt = parse_float(r.get("ANNUAL_AMOUNT"))
        a = parse_float(r.get("ACTUAL_AREA"))
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
        area = norm(r.get("AREA_EN"))
        if not area:
            continue
        rent_count_2025[area] += 1
        amt = parse_float(r.get("ANNUAL_AMOUNT"))
        a = parse_float(r.get("ACTUAL_AREA"))
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
    # Index rents by (area_norm, project_en) to find per-building rents
    proj_rents: dict[tuple[str, str], list[tuple[float, float]]] = collections.defaultdict(list)
    for r in rents_2026:
        proj = (r.get("PROJECT_EN") or "").strip()
        area = norm(r.get("AREA_EN"))
        if not proj or not area:
            continue
        amt = parse_float(r.get("ANNUAL_AMOUNT"))
        a = parse_float(r.get("ACTUAL_AREA"))
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

def compute_benchmarks(rents_2026: list[dict]):
    bucket: dict[tuple[str, str, str], list[tuple[float, float]]] = collections.defaultdict(list)
    for r in rents_2026:
        area = norm(r.get("AREA_EN"))
        pst = (r.get("PROP_SUB_TYPE_EN") or "").strip()
        if not area or not pst:
            continue
        amt = parse_float(r.get("ANNUAL_AMOUNT"))
        sq = parse_float(r.get("ACTUAL_AREA"))
        if amt is None or amt <= 0 or sq is None or sq <= 0:
            continue
        band = size_band_of(sq)
        if not band:
            continue
        ppsf = amt / sq
        if not (10 <= ppsf <= 5000):
            continue
        bucket[(area, pst, band)].append((amt, ppsf))

    out: list[dict] = []
    for (area, pst, band), pairs in bucket.items():
        if len(pairs) < MIN_BENCHMARK_SAMPLES:
            continue
        amts = sorted(p[0] for p in pairs)
        ppsfs = sorted(p[1] for p in pairs)
        out.append(dict(
            area_norm=area, prop_sub_type=pst, size_band=band,
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
                bm["sample_count"],
                bm["p10_annual_rent"], bm["p25_annual_rent"], bm["median_annual_rent"],
                bm["p75_annual_rent"], bm["p90_annual_rent"],
                bm["p25_rent_per_sqft"], bm["median_rent_per_sqft"], bm["p75_rent_per_sqft"],
            ))
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO dld_rent_benchmarks (id, dld_area_id,
                prop_sub_type, size_band, period, sample_count,
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
    rents_all = load_rents_deduped()
    rents_2026 = [r for r in rents_all if (r.get("START_DATE") or "")[:4] == "2026"]
    rents_2025 = [r for r in rents_all if (r.get("START_DATE") or "")[:4] == "2025"]
    buildings = list(load_csv(DATA_DIR / "buildings-2026-06-01.csv"))
    lands = list(load_csv(DATA_DIR / "lands-2026-06-01.csv"))
    brokers_raw = list(load_csv(DATA_DIR / "brokers-2026-06-01.csv"))

    print(f"[etl]   transactions: {len(txns):,}", flush=True)
    print(f"[etl]   rents (dedup): {len(rents_all):,} → 2026={len(rents_2026):,} 2025={len(rents_2025):,}", flush=True)
    print(f"[etl]   buildings: {len(buildings):,}", flush=True)
    print(f"[etl]   lands: {len(lands):,}", flush=True)
    print(f"[etl]   brokers: {len(brokers_raw):,}", flush=True)

    # --- Areas
    areas = collect_areas(txns, rents_2026, rents_2025, buildings, lands)
    print(f"[etl] canonical DLD areas: {len(areas):,}", flush=True)

    # --- Area counts
    area_counts = {
        "txn": collections.Counter(norm(r.get("AREA_EN")) for r in txns),
        "rent_2026": collections.Counter(norm(r.get("AREA_EN")) for r in rents_2026),
        "rent_2025": collections.Counter(norm(r.get("AREA_EN")) for r in rents_2025),
        "building": collections.Counter(norm(r.get("AREA_EN")) for r in buildings),
        "land": collections.Counter(norm(r.get("AREA_EN")) for r in lands),
    }
    for k in area_counts:
        area_counts[k].pop("", None)

    # --- Metrics
    metrics, _rc25 = compute_area_metrics(txns, rents_2026, rents_2025)
    print(f"[etl] area metrics computed: {len(metrics):,}", flush=True)

    # --- Buildings
    bldg_rows = compute_buildings(buildings, rents_2026)

    # --- Brokers
    broker_rows = compute_brokers(brokers_raw)
    active = sum(1 for b in broker_rows if b["is_active"])
    print(f"[etl] brokers (deduped): {len(broker_rows):,} | active today: {active:,}", flush=True)

    # --- Benchmarks
    bench = compute_benchmarks(rents_2026)
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
