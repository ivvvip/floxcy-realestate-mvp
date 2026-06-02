"""DLD historical-rents ETL → 5 tables: rent_history, yield_history,
building_rent_history, labor_camp_stats, commercial_benchmarks, and
lease_expiry_forecast.

Streams the 2021-2026 Ejari rent contracts export, classifies each row by
property_category, and routes the data through per-category aggregations:

  - apartment / villa / hotel_apt (residential) →
        dld_rent_history (area × year)
        dld_building_rent_history (project × year)
        dld_yield_history (derived from area-year rents × prices)
        dld_lease_expiry_forecast (area × project × sub_type × expiry_month)

  - labor_camp → dld_labor_camp_stats (area × year)
  - office / retail / warehouse → dld_commercial_benchmarks
        (area × category × year)
  - whole_building / other → counted only, not persisted

Same operating pattern as etl_dld_history.py — stdlib csv stream,
idempotent DELETE+INSERT, respects the CLAUDE.md 10.0.1.7 IP swap.

Run patterns:
    python scripts/etl_dld_rent_history.py            # dry-run summary
    python scripts/etl_dld_rent_history.py --to-db    # write to Postgres
    python scripts/etl_dld_rent_history.py --to-db --progress-every 500000
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import os
import statistics
import sys
import uuid
from pathlib import Path
from typing import Optional

# Local shared module — same directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _dld_category import (  # noqa: E402
    LABOR_CAMP_CATEGORY,
    RESIDENTIAL_AMOUNT_MIN,
    RESIDENTIAL_CATEGORIES,
    classify_property,
    is_bulk_contract,
    is_commercial,
    normalize_subtype,
    residential_amount_cap,
)

csv.field_size_limit(sys.maxsize)

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

SQM_TO_SQFT = 10.7639
RPSF_MIN = 10.0
RPSF_MAX = 5_000.0
ANNUAL_RENT_MIN = 5_000.0          # filter clearly-bogus contracts
ANNUAL_RENT_MAX = 50_000_000.0
YEARS = list(range(2021, 2027))
DEFAULT_PROGRESS = 500_000

# Snapshot date — used to filter lease expiries to the forward-looking
# window. Anything that has already expired isn't useful for the
# Availability Tracker.
SNAPSHOT_DATE = dt.date(2026, 6, 1)
SNAPSHOT_MONTH = SNAPSHOT_DATE.strftime("%Y-%m")

# Lease-expiry blend (per spec):
#   Person + Renewed contracts → 61% renewal probability
#   Person + New contracts     → 45% renewal probability
# estimated_available = round(contract_count × 0.39) is the spec's blended
# non-renewal rate; renewal_probability per-bucket is computed honestly from
# the per-row mix.
RENEWAL_PROB_RENEWED = 0.61
RENEWAL_PROB_NEW = 0.45
ESTIMATED_AVAILABLE_BLEND = 0.39


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

def _f(s: str | None) -> Optional[float]:
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _norm_area(s: str | None) -> Optional[str]:
    if not s:
        return None
    return s.strip().lower() or None


class StreamedRow:
    """Lightweight container for one classified rent row. dataclass-equivalent
    but using __slots__ for memory efficiency at 13M-row scale."""
    __slots__ = (
        "category", "area_norm", "year", "is_renew", "annual", "rent_psf",
        "size_sqm", "is_person", "is_bulk", "project_number", "project_name",
        "sub_type_normalized", "end_month",
    )

    def __init__(self, category, area_norm, year, is_renew, annual, rent_psf,
                 size_sqm, is_person, is_bulk, project_number, project_name,
                 sub_type_normalized, end_month):
        self.category = category
        self.area_norm = area_norm
        self.year = year
        self.is_renew = is_renew
        self.annual = annual
        self.rent_psf = rent_psf
        self.size_sqm = size_sqm
        self.is_person = is_person
        self.is_bulk = is_bulk
        self.project_number = project_number
        self.project_name = project_name
        self.sub_type_normalized = sub_type_normalized
        self.end_month = end_month  # 'YYYY-MM' or None


def stream_classified_rents(path: Path, progress_every: int):
    """Yield StreamedRow objects spanning every category.

    Filtering is *minimal* at stream time so each downstream aggregator can
    apply its own gates. We still drop rows with no area / no amount / no
    size / out-of-range PPSF / unknown year, since those are dead data
    anywhere. Residential 10K-500K amount cap is applied here so all
    residential aggregators see the same filtered pool.
    """
    total = 0
    kept = 0
    last_report = 0
    cat_counter: collections.Counter = collections.Counter()

    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            if total - last_report >= progress_every:
                pct = (kept / total * 100) if total else 0
                print(
                    f"  [{total:>11,} scanned · {kept:>10,} kept · {pct:5.1f}% pass]",
                    flush=True,
                )
                last_report = total

            category = classify_property(
                row.get("ejari_property_type_en"),
                row.get("ejari_property_sub_type_en"),
                row.get("ejari_bus_property_type_en"),
            )

            area_norm = _norm_area(row.get("area_name_en"))
            if not area_norm:
                continue

            annual = _f(row.get("annual_amount"))
            if not annual or annual < ANNUAL_RENT_MIN or annual > ANNUAL_RENT_MAX:
                continue

            # Residential per-category caps. Apartment 10K-2M, Villa 10K-5M,
            # Hotel Apt 10K-3M. Generous enough to keep Burj Khalifa-tier
            # penthouses, Palm villas, and 5* serviced apartments.
            if category in RESIDENTIAL_CATEGORIES:
                if annual < RESIDENTIAL_AMOUNT_MIN:
                    continue
                cap = residential_amount_cap(category)
                if cap is not None and annual > cap:
                    continue

            size_sqm = _f(row.get("actual_area"))
            if not size_sqm or size_sqm <= 0:
                continue

            size_sqft = size_sqm * SQM_TO_SQFT
            rent_psf = annual / size_sqft
            if rent_psf < RPSF_MIN or rent_psf > RPSF_MAX:
                continue

            date_str = (row.get("contract_start_date") or "").strip()
            if len(date_str) < 4:
                continue
            try:
                year = int(date_str[:4])
            except ValueError:
                continue
            if year not in YEARS:
                continue

            reg = (row.get("contract_reg_type_en") or "").strip()
            is_renew = reg == "Renew"

            tenant = (row.get("tenant_type_en") or "").strip()
            is_person = tenant == "Person"

            nprop = _f(row.get("no_of_prop"))
            nprop_int = int(nprop) if nprop is not None else None
            is_bulk = is_bulk_contract(category, annual, nprop_int)

            project_number = (row.get("project_number") or "").strip() or None
            project_name = (row.get("project_name_en") or "").strip() or None

            sub_type_normalized = normalize_subtype(
                row.get("ejari_property_sub_type_en")
            )

            end_str = (row.get("contract_end_date") or "").strip()
            end_month = end_str[:7] if len(end_str) >= 7 else None

            kept += 1
            cat_counter[category] += 1
            yield StreamedRow(
                category=category,
                area_norm=area_norm,
                year=year,
                is_renew=is_renew,
                annual=annual,
                rent_psf=rent_psf,
                size_sqm=size_sqm,
                is_person=is_person,
                is_bulk=is_bulk,
                project_number=project_number,
                project_name=project_name,
                sub_type_normalized=sub_type_normalized,
                end_month=end_month,
            )

    cat_summary = ", ".join(f"{k}={v:,}" for k, v in cat_counter.most_common())
    print(
        f"  [DONE · {total:,} total · {kept:,} kept · "
        f"{(kept/total*100 if total else 0):.2f}% pass]\n"
        f"  category mix: {cat_summary}",
        flush=True,
    )


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

class RentAgg:
    """Bucket-level rent accumulator. Only Person rows contribute to the
    amount stats (annuals/rpsfs and new/renew splits); Authority rows are
    counted separately for audit visibility but excluded from the math."""
    __slots__ = (
        "annuals", "rpsfs", "new_count", "renew_count",
        "person_count", "authority_count",
    )

    def __init__(self) -> None:
        self.annuals: list[float] = []
        self.rpsfs: list[float] = []
        self.new_count = 0
        self.renew_count = 0
        self.person_count = 0
        self.authority_count = 0

    def add(self, is_renew: bool, annual: float, rent_psf: float, is_person: bool) -> None:
        if is_person:
            self.annuals.append(annual)
            self.rpsfs.append(rent_psf)
            if is_renew:
                self.renew_count += 1
            else:
                self.new_count += 1
            self.person_count += 1
        else:
            # Authority (or rare blanks) — count only.
            self.authority_count += 1


# A project key is either ("pn", project_number) when the building has a DLD
# project number, or ("pna", project_name_lower, area_norm) as a fallback.
ProjectKey = tuple


def _project_key(project_number: Optional[str], project_name: Optional[str],
                 area_norm: str) -> Optional[ProjectKey]:
    if project_number:
        return ("pn", project_number)
    if project_name:
        return ("pna", project_name.lower(), area_norm)
    return None


class CommercialAgg:
    """Minimal commercial bucket — no tenant split since commercial leases
    can be Person OR Authority and we don't filter."""
    __slots__ = ("annuals", "rpsfs", "count")

    def __init__(self) -> None:
        self.annuals: list[float] = []
        self.rpsfs: list[float] = []
        self.count = 0

    def add(self, annual: float, rent_psf: float) -> None:
        self.annuals.append(annual)
        self.rpsfs.append(rent_psf)
        self.count += 1


class LaborCampAgg:
    __slots__ = ("annuals", "count")

    def __init__(self) -> None:
        self.annuals: list[float] = []
        self.count = 0

    def add(self, annual: float) -> None:
        self.annuals.append(annual)
        self.count += 1


class ExpiryAgg:
    __slots__ = ("annuals", "renew_count", "new_count")

    def __init__(self) -> None:
        self.annuals: list[float] = []
        self.renew_count = 0
        self.new_count = 0

    def add(self, is_renew: bool, annual: float) -> None:
        self.annuals.append(annual)
        if is_renew:
            self.renew_count += 1
        else:
            self.new_count += 1

    @property
    def count(self) -> int:
        return self.renew_count + self.new_count


def aggregate(path: Path, progress_every: int):
    """Stream once, fan out into 5 aggregation dicts.

    Returns a dict {
        'area':      dict[(area_norm, year), RentAgg],
        'building':  dict[(ProjectKey, year), RentAgg],
        'bldg_meta': dict[ProjectKey, (project_number, project_name, area_norm)],
        'labor':     dict[(area_norm, year), LaborCampAgg],
        'comm':      dict[(area_norm, category, year), CommercialAgg],
        'expiry':    dict[(area_norm, project_name, sub_type, expiry_month), ExpiryAgg],
    }
    """
    print(f"Aggregating {path}", flush=True)
    area_aggs: dict[tuple[str, int], RentAgg] = collections.defaultdict(RentAgg)
    bldg_aggs: dict[tuple[ProjectKey, int], RentAgg] = collections.defaultdict(RentAgg)
    bldg_meta: dict[ProjectKey, tuple[Optional[str], Optional[str], str]] = {}
    labor_aggs: dict[tuple[str, int], LaborCampAgg] = collections.defaultdict(LaborCampAgg)
    comm_aggs: dict[tuple[str, str, int], CommercialAgg] = collections.defaultdict(CommercialAgg)
    expiry_aggs: dict[
        tuple[str, Optional[str], str, str], ExpiryAgg
    ] = collections.defaultdict(ExpiryAgg)

    for r in stream_classified_rents(path, progress_every):
        # ---- Residential apartment/villa/hotel_apt ----
        if r.category in RESIDENTIAL_CATEGORIES:
            # rent_history + building_rent_history skip bulk contracts so the
            # area-level + building-level averages reflect honest unit rents.
            if r.is_bulk:
                continue
            area_aggs[(r.area_norm, r.year)].add(
                r.is_renew, r.annual, r.rent_psf, r.is_person
            )
            pkey = _project_key(r.project_number, r.project_name, r.area_norm)
            if pkey is not None:
                bldg_aggs[(pkey, r.year)].add(
                    r.is_renew, r.annual, r.rent_psf, r.is_person
                )
                if pkey not in bldg_meta:
                    bldg_meta[pkey] = (r.project_number, r.project_name, r.area_norm)

            # Lease expiry: Person residential only, end_month in the future.
            if r.is_person and r.end_month and r.end_month >= SNAPSHOT_MONTH:
                expiry_aggs[
                    (r.area_norm, r.project_name, r.sub_type_normalized, r.end_month)
                ].add(r.is_renew, r.annual)
            continue

        # ---- Labor camps ----
        if r.category == LABOR_CAMP_CATEGORY:
            labor_aggs[(r.area_norm, r.year)].add(r.annual)
            continue

        # ---- Commercial (office / retail / warehouse) ----
        if is_commercial(r.category):
            comm_aggs[(r.area_norm, r.category, r.year)].add(r.annual, r.rent_psf)
            continue
        # whole_building / other → counted only (in cat_counter); not stored.

    return {
        "area": area_aggs,
        "building": bldg_aggs,
        "bldg_meta": bldg_meta,
        "labor": labor_aggs,
        "comm": comm_aggs,
        "expiry": expiry_aggs,
    }


def build_rent_rows(aggs: dict[tuple[str, int], RentAgg]) -> list[dict]:
    rows: list[dict] = []
    for (area_norm, year), a in aggs.items():
        n = a.person_count
        if n == 0:
            # Bucket only had Authority leases — skip rather than emit nulls.
            # The audit count is still visible at the per-area level via
            # SUM(authority_contract_count) if we ever surface it.
            continue
        total = a.new_count + a.renew_count
        rows.append({
            "area_name_norm": area_norm,
            "year": year,
            "avg_annual_rent": round(statistics.fmean(a.annuals), 2),
            "median_annual_rent": round(statistics.median(a.annuals), 2),
            "avg_rent_per_sqft": round(statistics.fmean(a.rpsfs), 2),
            "median_rent_per_sqft": round(statistics.median(a.rpsfs), 2),
            "contract_count": n,
            "new_count": a.new_count,
            "renew_count": a.renew_count,
            "renewal_rate_pct": round(a.renew_count / total * 100, 2) if total else None,
            "person_contract_count": a.person_count,
            "authority_contract_count": a.authority_count,
        })
    return rows


# Building rent rows are kept even with small sample sizes — at the building
# level a single annual lease is informative ("only one tenant moved in this
# year"). Downstream consumers can filter by contract_count if they want a
# minimum signal threshold.
def build_building_rent_rows(
    aggs: dict[tuple[ProjectKey, int], RentAgg],
    meta: dict[ProjectKey, tuple[Optional[str], Optional[str], str]],
) -> list[dict]:
    rows: list[dict] = []
    for (pkey, year), a in aggs.items():
        n = a.person_count
        if n == 0:
            continue
        project_number, project_name, area_norm = meta[pkey]
        rows.append({
            "project_number": project_number,
            "project_name": project_name,
            "area_name_norm": area_norm,
            "year": year,
            "avg_annual_rent": round(statistics.fmean(a.annuals), 2),
            "median_annual_rent": round(statistics.median(a.annuals), 2),
            "avg_rent_per_sqft": round(statistics.fmean(a.rpsfs), 2),
            "median_rent_per_sqft": round(statistics.median(a.rpsfs), 2),
            "contract_count": n,
            "new_count": a.new_count,
            "renew_count": a.renew_count,
            "person_contract_count": a.person_count,
            "authority_contract_count": a.authority_count,
        })
    return rows


def build_labor_camp_rows(aggs: dict[tuple[str, int], LaborCampAgg]) -> list[dict]:
    """avg_rooms_per_contract is left NULL — DLD's sub_type strings for labor
    camps don't reliably encode room counts (often just 'Room in Labor Camp'
    or 'Bed Space'). A future parser pass can populate this if needed."""
    rows: list[dict] = []
    for (area_norm, year), a in aggs.items():
        if a.count == 0:
            continue
        rows.append({
            "area_name_norm": area_norm,
            "year": year,
            "contract_count": a.count,
            "avg_rooms_per_contract": None,
            "avg_annual_amount": round(statistics.fmean(a.annuals), 2),
            "median_annual_amount": round(statistics.median(a.annuals), 2),
            "total_annual_income": round(sum(a.annuals), 2),
        })
    return rows


def build_commercial_rows(
    aggs: dict[tuple[str, str, int], CommercialAgg],
) -> list[dict]:
    rows: list[dict] = []
    for (area_norm, category, year), a in aggs.items():
        if a.count == 0:
            continue
        rows.append({
            "area_name_norm": area_norm,
            "property_category": category,
            "year": year,
            "avg_annual_rent": round(statistics.fmean(a.annuals), 2),
            "median_annual_rent": round(statistics.median(a.annuals), 2),
            "avg_rent_per_sqft": round(statistics.fmean(a.rpsfs), 2),
            "median_rent_per_sqft": round(statistics.median(a.rpsfs), 2),
            "sample_size": a.count,
        })
    return rows


def build_expiry_rows(
    aggs: dict[tuple[str, Optional[str], str, str], ExpiryAgg],
) -> list[dict]:
    """One row per (area, project_name, sub_type, expiry_month).
    renewal_probability blends per-bucket Renew vs New ratio against the
    spec's static probabilities. estimated_available uses the flat 39%
    non-renewal rate from the spec."""
    rows: list[dict] = []
    for (area_norm, project_name, sub_type, expiry_month), a in aggs.items():
        total = a.count
        if total == 0:
            continue
        prob = (
            a.renew_count * RENEWAL_PROB_RENEWED
            + a.new_count * RENEWAL_PROB_NEW
        ) / total
        rows.append({
            "area_name_norm": area_norm,
            "project_name_en": project_name,
            "property_sub_type": sub_type,
            "expiry_month": expiry_month,
            "contract_count": total,
            "estimated_available": int(round(total * ESTIMATED_AVAILABLE_BLEND)),
            "avg_last_rent": round(statistics.fmean(a.annuals), 2),
            "renewal_probability": round(prob * 100, 2),  # stored as percent
        })
    return rows


# ---------------------------------------------------------------------------
# Postgres write + yield derivation
# ---------------------------------------------------------------------------

def get_sync_db_url() -> str:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


YIELD_CAP_PCT = 20.0


def write_rent_history_and_derive_yields(
    rent_rows: list[dict],
    building_rows: list[dict],
    labor_rows: list[dict],
    commercial_rows: list[dict],
    expiry_rows: list[dict],
) -> dict:
    """Write dld_rent_history + dld_building_rent_history, then derive
    dld_yield_history in a single SQL pass joining against dld_price_history.
    Returns summary counts."""
    import psycopg2
    import psycopg2.extras

    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name_norm, id FROM dld_areas")
            area_ids = {n: i for n, i in cur.fetchall()}
            print(f"  {len(area_ids):,} known dld_areas", flush=True)

            # Building lookup: prefer project_number, fall back to
            # (lower(project_name), dld_area_id).
            cur.execute(
                "SELECT id, project_number, project_name, dld_area_id FROM dld_buildings"
            )
            by_pnumber: dict[str, str] = {}
            by_pname_area: dict[tuple[str, str], str] = {}
            for bid, pnumber, pname, daid in cur.fetchall():
                if pnumber:
                    by_pnumber[str(pnumber).strip()] = bid
                if pname and daid:
                    by_pname_area[(pname.strip().lower(), str(daid))] = bid
            print(
                f"  building lookup: {len(by_pnumber):,} by project_number, "
                f"{len(by_pname_area):,} by (project_name, area)",
                flush=True,
            )

            # 1) Idempotent rebuild of rent_history
            cur.execute("DELETE FROM dld_rent_history")
            rh_rows = []
            for r in rent_rows:
                rh_rows.append((
                    str(uuid.uuid4()),
                    area_ids.get(r["area_name_norm"]),
                    r["area_name_norm"],
                    r["year"],
                    r["avg_annual_rent"],
                    r["median_annual_rent"],
                    r["avg_rent_per_sqft"],
                    r["median_rent_per_sqft"],
                    r["contract_count"],
                    r["new_count"],
                    r["renew_count"],
                    r["renewal_rate_pct"],
                    r["person_contract_count"],
                    r["authority_contract_count"],
                ))
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_rent_history (
                    id, dld_area_id, area_name_norm, year,
                    avg_annual_rent, median_annual_rent,
                    avg_rent_per_sqft, median_rent_per_sqft,
                    contract_count, new_count, renew_count, renewal_rate_pct,
                    person_contract_count, authority_contract_count
                ) VALUES %s
                """,
                rh_rows,
                page_size=500,
            )
            print(f"  inserted {len(rh_rows):,} rent-history rows", flush=True)

            # 1b) Idempotent rebuild of building_rent_history
            cur.execute("DELETE FROM dld_building_rent_history")
            brh_rows = []
            matched_pnumber = 0
            matched_pname = 0
            unmatched = 0
            for r in building_rows:
                area_id = area_ids.get(r["area_name_norm"])
                bid = None
                if r["project_number"] and r["project_number"] in by_pnumber:
                    bid = by_pnumber[r["project_number"]]
                    matched_pnumber += 1
                elif r["project_name"] and area_id is not None:
                    key = (r["project_name"].strip().lower(), str(area_id))
                    bid = by_pname_area.get(key)
                    if bid:
                        matched_pname += 1
                    else:
                        unmatched += 1
                else:
                    unmatched += 1
                brh_rows.append((
                    str(uuid.uuid4()),
                    bid,
                    area_id,
                    r["project_number"],
                    r["project_name"],
                    r["area_name_norm"],
                    r["year"],
                    r["avg_annual_rent"],
                    r["median_annual_rent"],
                    r["avg_rent_per_sqft"],
                    r["median_rent_per_sqft"],
                    r["contract_count"],
                    r["new_count"],
                    r["renew_count"],
                    r["person_contract_count"],
                    r["authority_contract_count"],
                ))
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_building_rent_history (
                    id, dld_building_id, dld_area_id,
                    project_number, project_name, area_name_norm, year,
                    avg_annual_rent, median_annual_rent,
                    avg_rent_per_sqft, median_rent_per_sqft,
                    contract_count, new_count, renew_count,
                    person_contract_count, authority_contract_count
                ) VALUES %s
                """,
                brh_rows,
                page_size=1000,
            )
            print(
                f"  inserted {len(brh_rows):,} building rent-history rows · "
                f"matched: {matched_pnumber:,} by project_number, "
                f"{matched_pname:,} by (project_name, area), "
                f"{unmatched:,} unmatched (kept for area-level analysis)",
                flush=True,
            )

            # 2) Derive yield_history by joining price+rent histories.
            # gross_yield = (rent_psf / sale_ppsf) × 100, capped at 25.
            cur.execute("DELETE FROM dld_yield_history")
            cur.execute(
                f"""
                INSERT INTO dld_yield_history (
                    id, dld_area_id, area_name_norm, year,
                    gross_yield_pct, sale_ppsf, rent_psf,
                    yield_delta_yoy_pct, sample_score
                )
                SELECT
                    gen_random_uuid(),
                    p.dld_area_id,
                    p.area_name_norm,
                    p.year,
                    LEAST(
                        ROUND((r.avg_rent_per_sqft / NULLIF(p.avg_ppsf_all, 0) * 100)::numeric, 2),
                        {YIELD_CAP_PCT}
                    ) AS gross_yield_pct,
                    p.avg_ppsf_all,
                    r.avg_rent_per_sqft,
                    NULL::numeric AS yield_delta_yoy_pct,
                    LEAST(p.transaction_count, r.contract_count) AS sample_score
                FROM dld_price_history p
                JOIN dld_rent_history r
                  ON r.area_name_norm = p.area_name_norm
                 AND r.year = p.year
                WHERE p.avg_ppsf_all IS NOT NULL
                  AND r.avg_rent_per_sqft IS NOT NULL
                  AND p.avg_ppsf_all > 0
                """
            )
            cur.execute("SELECT COUNT(*) FROM dld_yield_history")
            yield_rows_total = cur.fetchone()[0]
            print(f"  derived {yield_rows_total:,} yield-history rows", flush=True)

            # 3) Fill yield_delta_yoy_pct via a self-join window.
            cur.execute(
                """
                UPDATE dld_yield_history y
                SET yield_delta_yoy_pct = ROUND(
                    (y.gross_yield_pct - prev.gross_yield_pct)::numeric, 2
                )
                FROM dld_yield_history prev
                WHERE prev.area_name_norm = y.area_name_norm
                  AND prev.year = y.year - 1
                  AND y.gross_yield_pct IS NOT NULL
                  AND prev.gross_yield_pct IS NOT NULL
                """
            )

            # 3b) Idempotent rebuild of labor_camp_stats
            cur.execute("DELETE FROM dld_labor_camp_stats")
            lc_rows = []
            for r in labor_rows:
                lc_rows.append((
                    str(uuid.uuid4()),
                    area_ids.get(r["area_name_norm"]),
                    r["area_name_norm"],
                    r["year"],
                    r["contract_count"],
                    r["avg_rooms_per_contract"],
                    r["avg_annual_amount"],
                    r["median_annual_amount"],
                    r["total_annual_income"],
                ))
            if lc_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dld_labor_camp_stats (
                        id, dld_area_id, area_name_norm, year,
                        contract_count, avg_rooms_per_contract,
                        avg_annual_amount, median_annual_amount,
                        total_annual_income
                    ) VALUES %s
                    """,
                    lc_rows,
                    page_size=500,
                )
            print(f"  inserted {len(lc_rows):,} labor-camp-stats rows", flush=True)

            # 3c) Idempotent rebuild of commercial_benchmarks
            cur.execute("DELETE FROM dld_commercial_benchmarks")
            cm_rows = []
            for r in commercial_rows:
                cm_rows.append((
                    str(uuid.uuid4()),
                    area_ids.get(r["area_name_norm"]),
                    r["area_name_norm"],
                    r["property_category"],
                    r["year"],
                    r["avg_annual_rent"],
                    r["median_annual_rent"],
                    r["avg_rent_per_sqft"],
                    r["median_rent_per_sqft"],
                    r["sample_size"],
                ))
            if cm_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dld_commercial_benchmarks (
                        id, dld_area_id, area_name_norm, property_category, year,
                        avg_annual_rent, median_annual_rent,
                        avg_rent_per_sqft, median_rent_per_sqft, sample_size
                    ) VALUES %s
                    """,
                    cm_rows,
                    page_size=500,
                )
            print(f"  inserted {len(cm_rows):,} commercial-benchmark rows", flush=True)

            # 3d) Idempotent rebuild of lease_expiry_forecast
            cur.execute("DELETE FROM dld_lease_expiry_forecast")
            le_rows = []
            for r in expiry_rows:
                le_rows.append((
                    str(uuid.uuid4()),
                    area_ids.get(r["area_name_norm"]),
                    r["area_name_norm"],
                    r["project_name_en"],
                    r["property_sub_type"],
                    r["expiry_month"],
                    r["contract_count"],
                    r["estimated_available"],
                    r["avg_last_rent"],
                    r["renewal_probability"],
                ))
            if le_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dld_lease_expiry_forecast (
                        id, dld_area_id, area_name_norm, project_name_en,
                        property_sub_type, expiry_month,
                        contract_count, estimated_available,
                        avg_last_rent, renewal_probability
                    ) VALUES %s
                    """,
                    le_rows,
                    page_size=1000,
                )
            print(f"  inserted {len(le_rows):,} lease-expiry-forecast rows", flush=True)

            # 4) Sanity-stat: how many distinct areas now have ≥3y of yields?
            cur.execute(
                """
                SELECT COUNT(DISTINCT area_name_norm)
                FROM dld_yield_history
                WHERE gross_yield_pct IS NOT NULL
                GROUP BY area_name_norm
                HAVING COUNT(*) >= 3
                """
            )
            row = cur.fetchone()
            areas_with_3y = row[0] if row else 0

        conn.commit()
        print("✓ committed", flush=True)
        return {
            "rent_rows": len(rh_rows),
            "yield_rows": yield_rows_total,
            "building_rows": len(brh_rows),
            "labor_rows": len(lc_rows),
            "commercial_rows": len(cm_rows),
            "expiry_rows": len(le_rows),
            "areas_with_3y_yield": areas_with_3y,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def report_top_yield_areas(n: int = 10) -> None:
    """Show top-N latest-year yields. Runs a fresh query against prod."""
    import psycopg2
    dsn = get_sync_db_url()
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH latest AS (
                    SELECT MAX(year) AS y FROM dld_yield_history
                )
                SELECT y.area_name_norm, y.year, y.gross_yield_pct,
                       y.yield_delta_yoy_pct, y.sample_score
                FROM dld_yield_history y, latest
                WHERE y.year = latest.y
                  AND y.gross_yield_pct IS NOT NULL
                  AND y.sample_score >= 30
                ORDER BY y.gross_yield_pct DESC
                LIMIT %s
                """,
                (n,),
            )
            print(
                f"\nTop {n} areas by current gross yield "
                f"(sample ≥30 sales AND ≥30 contracts):", flush=True,
            )
            print(f"  {'Area':<40} {'Year':>6} {'Yield':>7} {'YoY Δ':>8} {'Sample':>7}")
            for area, year, yld, delta, sample in cur.fetchall():
                print(
                    f"  {area[:40]:<40} {year:>6} "
                    f"{float(yld):>6.2f}% "
                    f"{(float(delta) if delta else 0):>+7.2f}% "
                    f"{int(sample):>7}"
                )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file",
        default=str(Path.home() / "dld-data" / "rents_2021_2026.csv"),
    )
    parser.add_argument("--to-db", action="store_true")
    parser.add_argument("--progress-every", type=int, default=DEFAULT_PROGRESS)
    parser.add_argument("--top-n", type=int, default=10)
    args = parser.parse_args()

    started_at = dt.datetime.utcnow()
    path = Path(args.file).expanduser()
    if not path.exists():
        print(f"ERROR: file not found: {path}", flush=True)
        return 2

    bundle = aggregate(path, progress_every=args.progress_every)
    rows = build_rent_rows(bundle["area"])
    bldg_rows = build_building_rent_rows(bundle["building"], bundle["bldg_meta"])
    labor_rows = build_labor_camp_rows(bundle["labor"])
    commercial_rows = build_commercial_rows(bundle["comm"])
    expiry_rows = build_expiry_rows(bundle["expiry"])

    print(f"\nDistinct (area, year) residential rent groups: {len(rows):,}", flush=True)
    print(f"Distinct (building, year) residential rent groups: {len(bldg_rows):,}", flush=True)
    print(f"Distinct (area, year) labor-camp groups: {len(labor_rows):,}", flush=True)
    print(f"Distinct (area, category, year) commercial groups: {len(commercial_rows):,}", flush=True)
    print(f"Distinct (area, project, sub_type, expiry_month) expiry groups: {len(expiry_rows):,}", flush=True)

    if args.to_db:
        summary = write_rent_history_and_derive_yields(
            rows, bldg_rows, labor_rows, commercial_rows, expiry_rows
        )
        print(
            f"\nSummary: {summary['rent_rows']:,} rent rows, "
            f"{summary['yield_rows']:,} yield rows, "
            f"{summary['building_rows']:,} building-rent rows, "
            f"{summary['labor_rows']:,} labor-camp rows, "
            f"{summary['commercial_rows']:,} commercial rows, "
            f"{summary['expiry_rows']:,} expiry rows, "
            f"{summary['areas_with_3y_yield']:,} areas with ≥3y yield series",
            flush=True,
        )
        report_top_yield_areas(n=args.top_n)

    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
