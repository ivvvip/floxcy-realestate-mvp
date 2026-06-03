"""DLD transactions ETL — multi-track pass over transactions_2021_2026.csv.

This is the rewrite that backs the user-spec transaction-side fixes:

  Fix 1  — explicit SALE_PROCEDURES allowlist (not just trans_group=Sales)
  Fix 2  — property_usage Arabic leak ("أخرى") → "Other"
  Fix 3  — metro name typo fix ("Buj Khalifa..." → "Burj Khalifa...")
  Fix 4  — amount/area anomaly filters (drop < 1K, flag > 500M as bulk,
           drop procedure_area > 50K for Unit-type sales)
  Fix 5  — Gifts/Grants kept out of price math entirely; stored in
           dld_gift_transfers for ownership-tracking analytics

  Build 1 — dld_buildings_sales (per (building_name_en, area_id) benchmarks)
  Build 2 — dld_bedroom_benchmarks (per (area, bedroom, reg_type, year))
  Build 3 — parking_pct on dld_area_metrics + dld_buildings_sales

Existing dld_price_history + dld_area_appreciation are preserved and
recomputed using the broadened sale procedure list.

Run patterns:
    python scripts/etl_dld_history.py             # dry-run
    python scripts/etl_dld_history.py --to-db     # write to Postgres
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

# Local shared modules — same directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _transactions_classifier import (  # noqa: E402
    SALE_PROCEDURES,
    SQM_TO_SQFT,
    TX_AMOUNT_MIN,
    TX_AREA_MAX_UNIT,
    TX_PPSF_MAX,
    TX_PPSF_MIN,
    classify_procedure,
    is_bulk_transaction,
    normalize_bedroom,
    normalize_metro,
    normalize_usage,
    slug,
)

csv.field_size_limit(sys.maxsize)

CHUNK_REPORT_DEFAULT = 500_000
# History window. Pre-2009 the data is dominated by plot-only land sales,
# project_name_en tagging is <2%, and the price distribution is structurally
# different (different DLD procedure mix). 2009 is the practical floor where
# unit-level sales become well-represented and bedroom benchmarks start to
# carry signal. See the per-year quality audit for the breakdown.
YEARS = set(range(2009, 2027))
BUILDING_MIN_TRANSACTIONS = 3
BEDROOM_MIN_SAMPLES = 5


def _f(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _norm_area(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    return s.strip().lower() or None


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

class TxRow:
    """Lightweight classified transaction row. __slots__ for memory."""
    __slots__ = (
        "track", "reg_type", "area_norm", "area_name_en", "year",
        "value", "ppsf", "size_sqm",
        "building_name", "master_project_en",
        "bedroom", "has_parking", "is_bulk", "instance_date",
        "property_usage",
    )

    def __init__(self, **kw) -> None:
        for k in self.__slots__:
            setattr(self, k, kw.get(k))


def stream_classified_rows(path: Path, progress_every: int):
    """Yield TxRow objects: one per qualifying row, tagged track ∈
    {"sale", "gift"}.

    Sale-track filtering (Fix 1, Fix 4):
      procedure_name_en in SALE_PROCEDURES
      property_type_en  == "Unit"  (Land/Building are not unit sales)
      year              in YEARS
      area_name_en      not blank
      actual_worth      >= TX_AMOUNT_MIN  (1,000)   — drops gift-zero rows
      procedure_area    > 0 AND <= TX_AREA_MAX_UNIT (50,000 sqm)
      ppsf              in [TX_PPSF_MIN, TX_PPSF_MAX]

    Gift-track filtering (Fix 5):
      procedure_name_en in GIFT_PROCEDURES
      year              in YEARS
      area_name_en      not blank
      (no price math; just count by (area, year))
    """
    total = 0
    sale = 0
    gift = 0
    last_report = 0
    skipped_amount = 0
    skipped_area = 0
    skipped_ppsf = 0
    bulk_count = 0

    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            if total - last_report >= progress_every:
                pct = (sale + gift) / total * 100 if total else 0
                print(
                    f"  [{total:>10,} scanned · sale={sale:>9,} gift={gift:>7,} "
                    f"· {pct:5.1f}% pass]",
                    flush=True,
                )
                last_report = total

            reg_type, track = classify_procedure(row.get("procedure_name_en"))
            if track == "skip":
                continue

            area_norm = _norm_area(row.get("area_name_en"))
            if not area_norm:
                continue

            date_str = (row.get("instance_date") or "").strip()
            if len(date_str) < 4:
                continue
            try:
                year = int(date_str[:4])
            except ValueError:
                continue
            if year not in YEARS:
                continue

            instance_date = None
            if len(date_str) >= 10:
                try:
                    instance_date = dt.date.fromisoformat(date_str[:10])
                except ValueError:
                    instance_date = None

            if track == "gift":
                gift += 1
                yield TxRow(
                    track="gift",
                    reg_type=None,
                    area_norm=area_norm,
                    area_name_en=(row.get("area_name_en") or "").strip() or None,
                    year=year,
                    value=None, ppsf=None, size_sqm=None,
                    building_name=None,
                    master_project_en=None,
                    bedroom=None,
                    has_parking=None,
                    is_bulk=False,
                    instance_date=instance_date,
                    property_usage=None,
                )
                continue

            # Sale track
            ptype = (row.get("property_type_en") or "").strip()
            if ptype != "Unit":
                # Drop non-unit sales — Land / Building / Villa are tracked
                # separately upstream (Villa stays in the rents-side analysis
                # by property_sub_type).
                continue

            value = _f(row.get("actual_worth"))
            if value is None or value < TX_AMOUNT_MIN:
                skipped_amount += 1
                continue

            size_sqm = _f(row.get("procedure_area"))
            if not size_sqm or size_sqm <= 0:
                continue
            if size_sqm > TX_AREA_MAX_UNIT:
                skipped_area += 1
                continue

            size_sqft = size_sqm * SQM_TO_SQFT
            ppsf = value / size_sqft
            if ppsf < TX_PPSF_MIN or ppsf > TX_PPSF_MAX:
                skipped_ppsf += 1
                continue

            bulk = is_bulk_transaction(value)
            if bulk:
                bulk_count += 1

            sale += 1
            yield TxRow(
                track="sale",
                reg_type=reg_type,
                area_norm=area_norm,
                area_name_en=(row.get("area_name_en") or "").strip() or None,
                year=year,
                value=value, ppsf=ppsf, size_sqm=size_sqm,
                building_name=(row.get("building_name_en") or "").strip() or None,
                master_project_en=(row.get("master_project_en") or "").strip() or None,
                bedroom=normalize_bedroom(row.get("rooms_en")),
                has_parking=(row.get("has_parking") or "").strip() == "1",
                is_bulk=bulk,
                instance_date=instance_date,
                property_usage=normalize_usage(row.get("property_usage_en")),
            )

    pass_pct = (sale + gift) / total * 100 if total else 0
    print(
        f"  [DONE · {total:,} total · sale={sale:,} gift={gift:,} "
        f"· {pass_pct:.2f}% pass]\n"
        f"  filtered: amount<1K → {skipped_amount:,} · "
        f"area>{int(TX_AREA_MAX_UNIT/1000)}K → {skipped_area:,} · "
        f"ppsf out-of-band → {skipped_ppsf:,} · "
        f"bulk (kept, flagged) → {bulk_count:,}",
        flush=True,
    )


# ---------------------------------------------------------------------------
# Aggregators
# ---------------------------------------------------------------------------

class AreaYearAgg:
    """Per (area, year) — feeds dld_price_history."""
    __slots__ = (
        "ppsf_all", "ppsf_ready", "ppsf_offplan",
        "values_all", "size_sqm_all",
        "count_ready", "count_offplan",
        "parking_yes", "parking_total",
    )

    def __init__(self) -> None:
        self.ppsf_all: list[float] = []
        self.ppsf_ready: list[float] = []
        self.ppsf_offplan: list[float] = []
        self.values_all: list[float] = []
        self.size_sqm_all: list[float] = []
        self.count_ready = 0
        self.count_offplan = 0
        self.parking_yes = 0
        self.parking_total = 0

    def add(self, r: TxRow) -> None:
        self.ppsf_all.append(r.ppsf)
        self.values_all.append(r.value)
        self.size_sqm_all.append(r.size_sqm)
        if r.reg_type == "off_plan":
            self.ppsf_offplan.append(r.ppsf)
            self.count_offplan += 1
        else:
            self.ppsf_ready.append(r.ppsf)
            self.count_ready += 1
        if r.has_parking is not None:
            self.parking_total += 1
            if r.has_parking:
                self.parking_yes += 1


class BuildingSalesAgg:
    """Per (building_name_en lower, area_norm) — feeds dld_buildings_sales."""
    __slots__ = (
        "building_name", "area_norm", "area_name_en", "master_project_en",
        "values_ready", "values_offplan", "ppsf_ready", "ppsf_offplan",
        "values_all",
        "years_seen", "first_year", "last_year", "last_date",
        "parking_yes", "parking_total", "bulk_count",
    )

    def __init__(self, building_name: str, area_norm: str,
                 area_name_en: Optional[str], master_project_en: Optional[str]) -> None:
        self.building_name = building_name
        self.area_norm = area_norm
        self.area_name_en = area_name_en
        self.master_project_en = master_project_en
        self.values_ready: list[float] = []
        self.values_offplan: list[float] = []
        self.ppsf_ready: list[float] = []
        self.ppsf_offplan: list[float] = []
        self.values_all: list[float] = []
        self.years_seen: set[int] = set()
        self.first_year = 9999
        self.last_year = 0
        self.last_date: Optional[dt.date] = None
        self.parking_yes = 0
        self.parking_total = 0
        self.bulk_count = 0

    def add(self, r: TxRow) -> None:
        self.values_all.append(r.value)
        if r.reg_type == "off_plan":
            self.values_offplan.append(r.value)
            self.ppsf_offplan.append(r.ppsf)
        else:
            self.values_ready.append(r.value)
            self.ppsf_ready.append(r.ppsf)
        self.years_seen.add(r.year)
        if r.year < self.first_year:
            self.first_year = r.year
        if r.year > self.last_year:
            self.last_year = r.year
        if r.instance_date and (self.last_date is None or r.instance_date > self.last_date):
            self.last_date = r.instance_date
        if r.has_parking is not None:
            self.parking_total += 1
            if r.has_parking:
                self.parking_yes += 1
        if r.is_bulk:
            self.bulk_count += 1


class BedroomAgg:
    """Per (area_norm, bedroom_type, reg_type, year) — feeds dld_bedroom_benchmarks."""
    __slots__ = ("values", "ppsfs")

    def __init__(self) -> None:
        self.values: list[float] = []
        self.ppsfs: list[float] = []

    def add(self, value: float, ppsf: float) -> None:
        self.values.append(value)
        self.ppsfs.append(ppsf)


def aggregate(path: Path, progress_every: int):
    """Stream the file once, fan out into four aggregator dicts."""
    print(f"Aggregating {path}", flush=True)
    area_aggs: dict[tuple[str, int], AreaYearAgg] = collections.defaultdict(AreaYearAgg)
    building_aggs: dict[tuple[str, str], BuildingSalesAgg] = {}
    bedroom_aggs: dict[tuple[str, str, str, int], BedroomAgg] = collections.defaultdict(BedroomAgg)
    gift_counts: collections.Counter = collections.Counter()
    # Track display-name carryover for gift areas so we can resolve area_id later
    gift_areas: dict[str, Optional[str]] = {}

    for r in stream_classified_rows(path, progress_every):
        if r.track == "gift":
            gift_counts[(r.area_norm, r.year)] += 1
            gift_areas.setdefault(r.area_norm, r.area_name_en)
            continue

        # Sale track
        area_aggs[(r.area_norm, r.year)].add(r)

        if r.building_name:
            bkey = (r.building_name.strip().lower(), r.area_norm)
            b = building_aggs.get(bkey)
            if b is None:
                b = BuildingSalesAgg(
                    building_name=r.building_name.strip(),
                    area_norm=r.area_norm,
                    area_name_en=r.area_name_en,
                    master_project_en=r.master_project_en,
                )
                building_aggs[bkey] = b
            b.add(r)

        if r.bedroom and not r.is_bulk:
            # Bedroom benchmarks should reflect the typical buyer's market —
            # exclude the bulk portfolio sales the bulk flag captures.
            bedroom_aggs[(r.area_norm, r.bedroom, r.reg_type or "ready", r.year)].add(
                r.value, r.ppsf
            )

    return {
        "area": area_aggs,
        "building": building_aggs,
        "bedroom": bedroom_aggs,
        "gift_counts": gift_counts,
        "gift_areas": gift_areas,
    }


# ---------------------------------------------------------------------------
# Row builders
# ---------------------------------------------------------------------------

def _mean(xs: list[float]) -> Optional[float]:
    return round(statistics.fmean(xs), 2) if xs else None


def _median(xs: list[float]) -> Optional[float]:
    return round(statistics.median(xs), 2) if xs else None


def build_history_rows(aggs: dict[tuple[str, int], AreaYearAgg]) -> list[dict]:
    rows: list[dict] = []
    for (area_norm, year), a in aggs.items():
        n = len(a.ppsf_all)
        if n == 0:
            continue
        n_ready = len(a.ppsf_ready)
        n_off = len(a.ppsf_offplan)
        rows.append({
            "area_name_norm": area_norm,
            "year": year,
            "avg_ppsf_ready": _mean(a.ppsf_ready),
            "avg_ppsf_offplan": _mean(a.ppsf_offplan),
            "avg_ppsf_all": _mean(a.ppsf_all),
            "median_ppsf_all": _median(a.ppsf_all),
            "transaction_count": n,
            "transaction_count_ready": a.count_ready,
            "transaction_count_offplan": a.count_offplan,
            "total_value_aed": round(sum(a.values_all), 2),
            "median_deal_size": _median(a.size_sqm_all),
            "offplan_pct": round((a.count_offplan / n) * 100, 2) if n else None,
        })
    return rows


def build_appreciation_rows(history_rows: list[dict]) -> list[dict]:
    by_area: dict[str, dict[int, dict]] = collections.defaultdict(dict)
    for r in history_rows:
        by_area[r["area_name_norm"]][r["year"]] = r

    out: list[dict] = []
    for area_norm, years_map in by_area.items():
        years = sorted(years_map.keys())
        if not years:
            continue
        latest = years[-1]
        ppsf_latest = years_map[latest].get("avg_ppsf_all")
        if ppsf_latest is None:
            continue

        def _delta(years_back: int) -> Optional[float]:
            base_year = latest - years_back
            base = years_map.get(base_year, {}).get("avg_ppsf_all")
            if base is None or base <= 0:
                return None
            return round(((ppsf_latest - base) / base) * 100, 2)

        a1 = _delta(1)
        a3 = _delta(3)
        a5 = _delta(5)
        a10 = _delta(10)
        cagr5 = None
        base5 = years_map.get(latest - 5, {}).get("avg_ppsf_all")
        if base5 and base5 > 0:
            cagr5 = round((((ppsf_latest / base5) ** (1 / 5)) - 1) * 100, 2)
        cagr10 = None
        base10 = years_map.get(latest - 10, {}).get("avg_ppsf_all")
        if base10 and base10 > 0:
            cagr10 = round((((ppsf_latest / base10) ** (1 / 10)) - 1) * 100, 2)

        out.append({
            "area_name_norm": area_norm,
            "base_year": years[0],
            "latest_year": latest,
            "appreciation_1y_pct": a1,
            "appreciation_3y_pct": a3,
            "appreciation_5y_pct": a5,
            "appreciation_10y_pct": a10,
            "cagr_5y_pct": cagr5,
            "cagr_10y_pct": cagr10,
            "years_of_data": len(years),
        })
    return out


def build_building_sales_rows(
    aggs: dict[tuple[str, str], BuildingSalesAgg],
) -> list[dict]:
    rows: list[dict] = []
    for _, b in aggs.items():
        total = len(b.values_all)
        if total < BUILDING_MIN_TRANSACTIONS:
            continue
        parking_pct = (
            round((b.parking_yes / b.parking_total) * 100, 2)
            if b.parking_total else None
        )
        rows.append({
            "building_name_en": b.building_name,
            "building_name_slug": slug(b.building_name) or "unknown",
            "area_name_norm": b.area_norm,
            "area_name_en": b.area_name_en,
            "master_project_en": b.master_project_en,
            "total_transactions": total,
            "avg_sale_price_ready": _mean(b.values_ready),
            "avg_sale_price_offplan": _mean(b.values_offplan),
            "avg_ppsf_ready": _mean(b.ppsf_ready),
            "avg_ppsf_offplan": _mean(b.ppsf_offplan),
            "median_sale_price": _median(b.values_all),
            "min_sale_price": round(min(b.values_all), 2) if b.values_all else None,
            "max_sale_price": round(max(b.values_all), 2) if b.values_all else None,
            "years_covered": len(b.years_seen),
            "first_seen_year": b.first_year if b.first_year < 9999 else None,
            "last_seen_year": b.last_year or None,
            "last_transaction_date": b.last_date,
            "parking_pct": parking_pct,
            "bulk_transaction_count": b.bulk_count,
        })
    return rows


def build_bedroom_rows(
    aggs: dict[tuple[str, str, str, int], BedroomAgg],
) -> list[dict]:
    rows: list[dict] = []
    for (area_norm, bedroom, reg_type, year), a in aggs.items():
        n = len(a.values)
        if n < BEDROOM_MIN_SAMPLES:
            continue
        rows.append({
            "area_name_norm": area_norm,
            "bedroom_type": bedroom,
            "reg_type": reg_type,
            "year": year,
            "avg_price_aed": _mean(a.values),
            "median_price_aed": _median(a.values),
            "avg_ppsf": _mean(a.ppsfs),
            "transaction_count": n,
        })
    return rows


def build_gift_rows(counts: collections.Counter) -> list[dict]:
    rows: list[dict] = []
    for (area_norm, year), n in counts.items():
        if n == 0:
            continue
        rows.append({"area_name_norm": area_norm, "year": year, "transfer_count": n})
    return rows


# ---------------------------------------------------------------------------
# Parking — apply to dld_area_metrics as a single UPDATE keyed on area_norm
# ---------------------------------------------------------------------------

def build_parking_updates(
    aggs: dict[tuple[str, int], AreaYearAgg],
) -> dict[str, float]:
    """Returns {area_norm: parking_pct} aggregated across all years in the
    sale aggregator. Patched onto dld_area_metrics rows where the dld_area_id
    matches."""
    yes = collections.Counter()
    total = collections.Counter()
    for (area_norm, _year), a in aggs.items():
        yes[area_norm] += a.parking_yes
        total[area_norm] += a.parking_total
    out: dict[str, float] = {}
    for area_norm, n in total.items():
        if n > 0:
            out[area_norm] = round((yes[area_norm] / n) * 100, 2)
    return out


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------

def get_sync_db_url() -> str:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


def write_to_db(
    history: list[dict],
    appreciations: list[dict],
    buildings_sales: list[dict],
    bedroom_rows: list[dict],
    gift_rows: list[dict],
    parking_updates: dict[str, float],
) -> dict:
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

            # 1) dld_price_history (idempotent rebuild)
            cur.execute("DELETE FROM dld_price_history")
            cur.execute("DELETE FROM dld_area_appreciation")
            ph_rows = [(
                str(uuid.uuid4()), area_ids.get(r["area_name_norm"]),
                r["area_name_norm"], r["year"],
                r["avg_ppsf_ready"], r["avg_ppsf_offplan"],
                r["avg_ppsf_all"], r["median_ppsf_all"],
                r["transaction_count"], r["transaction_count_ready"],
                r["transaction_count_offplan"], r["total_value_aed"],
                r["median_deal_size"], r["offplan_pct"],
            ) for r in history]
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_price_history (
                    id, dld_area_id, area_name_norm, year,
                    avg_ppsf_ready, avg_ppsf_offplan, avg_ppsf_all, median_ppsf_all,
                    transaction_count, transaction_count_ready, transaction_count_offplan,
                    total_value_aed, median_deal_size, offplan_pct
                ) VALUES %s
                """,
                ph_rows,
                page_size=500,
            )
            print(f"  inserted {len(ph_rows):,} price-history rows", flush=True)

            ap_rows = [(
                str(uuid.uuid4()), area_ids.get(r["area_name_norm"]),
                r["area_name_norm"], r["base_year"], r["latest_year"],
                r["appreciation_1y_pct"], r["appreciation_3y_pct"],
                r["appreciation_5y_pct"], r["appreciation_10y_pct"],
                r["cagr_5y_pct"], r["cagr_10y_pct"], r["years_of_data"],
            ) for r in appreciations]
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_area_appreciation (
                    id, dld_area_id, area_name_norm, base_year, latest_year,
                    appreciation_1y_pct, appreciation_3y_pct, appreciation_5y_pct,
                    appreciation_10y_pct, cagr_5y_pct, cagr_10y_pct, years_of_data
                ) VALUES %s
                """,
                ap_rows,
                page_size=500,
            )
            print(f"  inserted {len(ap_rows):,} appreciation rows", flush=True)

            # 2) dld_buildings_sales
            cur.execute("DELETE FROM dld_buildings_sales")
            bs_rows = [(
                str(uuid.uuid4()),
                b["building_name_en"], b["building_name_slug"],
                area_ids.get(b["area_name_norm"]),
                b["area_name_en"], b["master_project_en"],
                b["total_transactions"],
                b["avg_sale_price_ready"], b["avg_sale_price_offplan"],
                b["avg_ppsf_ready"], b["avg_ppsf_offplan"],
                b["median_sale_price"], b["min_sale_price"], b["max_sale_price"],
                b["years_covered"], b["first_seen_year"], b["last_seen_year"],
                b["last_transaction_date"], b["parking_pct"],
                b["bulk_transaction_count"],
            ) for b in buildings_sales]
            if bs_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dld_buildings_sales (
                        id, building_name_en, building_name_slug,
                        dld_area_id, area_name_en, master_project_en,
                        total_transactions,
                        avg_sale_price_ready, avg_sale_price_offplan,
                        avg_ppsf_ready, avg_ppsf_offplan,
                        median_sale_price, min_sale_price, max_sale_price,
                        years_covered, first_seen_year, last_seen_year,
                        last_transaction_date, parking_pct, bulk_transaction_count
                    ) VALUES %s
                    """,
                    bs_rows,
                    page_size=1000,
                )
            print(f"  inserted {len(bs_rows):,} buildings-sales rows", flush=True)

            # 3) dld_bedroom_benchmarks
            cur.execute("DELETE FROM dld_bedroom_benchmarks")
            bd_rows = [(
                str(uuid.uuid4()),
                area_ids.get(r["area_name_norm"]),
                r["area_name_norm"], r["bedroom_type"], r["reg_type"], r["year"],
                r["avg_price_aed"], r["median_price_aed"], r["avg_ppsf"],
                r["transaction_count"],
            ) for r in bedroom_rows]
            if bd_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dld_bedroom_benchmarks (
                        id, dld_area_id, area_name_norm, bedroom_type, reg_type, year,
                        avg_price_aed, median_price_aed, avg_ppsf, transaction_count
                    ) VALUES %s
                    """,
                    bd_rows,
                    page_size=1000,
                )
            print(f"  inserted {len(bd_rows):,} bedroom-benchmark rows", flush=True)

            # 4) dld_gift_transfers
            cur.execute("DELETE FROM dld_gift_transfers")
            gt_rows = [(
                str(uuid.uuid4()),
                area_ids.get(r["area_name_norm"]),
                r["area_name_norm"], r["year"], r["transfer_count"],
            ) for r in gift_rows]
            if gt_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dld_gift_transfers (
                        id, dld_area_id, area_name_norm, year, transfer_count
                    ) VALUES %s
                    """,
                    gt_rows,
                    page_size=500,
                )
            print(f"  inserted {len(gt_rows):,} gift-transfer rows", flush=True)

            # 5) UPDATE dld_area_metrics.parking_pct
            updated = 0
            for area_norm, pct in parking_updates.items():
                aid = area_ids.get(area_norm)
                if not aid:
                    continue
                cur.execute(
                    "UPDATE dld_area_metrics SET parking_pct = %s "
                    "WHERE dld_area_id = %s AND period = '2026-ytd'",
                    (pct, aid),
                )
                updated += cur.rowcount
            print(f"  patched parking_pct on {updated:,} area_metrics rows", flush=True)

        conn.commit()
        print("✓ committed", flush=True)
        return {
            "price_history": len(ph_rows),
            "appreciation": len(ap_rows),
            "buildings_sales": len(bs_rows),
            "bedroom_benchmarks": len(bd_rows),
            "gift_transfers": len(gt_rows),
            "parking_patched": updated,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def report_top_n_by_5y(appreciations: list[dict], n: int = 10) -> None:
    enriched = [r for r in appreciations if r["appreciation_5y_pct"] is not None]
    enriched.sort(key=lambda r: -r["appreciation_5y_pct"])
    print(f"\nTop {n} areas by 5-year appreciation:")
    print(f"  {'Area':<40} {'5y%':>8} {'CAGR':>7} {'years':>6}")
    for r in enriched[:n]:
        print(
            f"  {r['area_name_norm'][:40]:<40} {r['appreciation_5y_pct']:>7.2f}% "
            f"{r['cagr_5y_pct'] or 0:>6.2f}% {r['years_of_data']:>6}"
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file",
        default=str(Path.home() / "dld-data" / "transactions_2021_2026.csv"),
    )
    parser.add_argument("--to-db", action="store_true")
    parser.add_argument("--progress-every", type=int, default=CHUNK_REPORT_DEFAULT)
    parser.add_argument("--top-n", type=int, default=10)
    args = parser.parse_args()

    started_at = dt.datetime.utcnow()
    path = Path(args.file).expanduser()
    if not path.exists():
        print(f"ERROR: file not found: {path}", flush=True)
        return 2

    bundle = aggregate(path, progress_every=args.progress_every)
    history = build_history_rows(bundle["area"])
    appreciations = build_appreciation_rows(history)
    buildings_sales = build_building_sales_rows(bundle["building"])
    bedroom_rows = build_bedroom_rows(bundle["bedroom"])
    gift_rows = build_gift_rows(bundle["gift_counts"])
    parking_updates = build_parking_updates(bundle["area"])

    print(f"\nDistinct (area, year) sale groups: {len(history):,}", flush=True)
    print(f"Areas with appreciation series: {len(appreciations):,}", flush=True)
    print(f"Building-sales entities (≥{BUILDING_MIN_TRANSACTIONS} txns): {len(buildings_sales):,}", flush=True)
    print(f"Bedroom-benchmark cells (≥{BEDROOM_MIN_SAMPLES} txns): {len(bedroom_rows):,}", flush=True)
    print(f"Gift-transfer groups: {len(gift_rows):,}", flush=True)
    print(f"Areas with parking signal: {len(parking_updates):,}", flush=True)

    report_top_n_by_5y(appreciations, n=args.top_n)

    if args.to_db:
        summary = write_to_db(
            history, appreciations, buildings_sales,
            bedroom_rows, gift_rows, parking_updates,
        )
        print(
            f"\nSummary: {summary['price_history']:,} price-history, "
            f"{summary['appreciation']:,} appreciation, "
            f"{summary['buildings_sales']:,} building-sales, "
            f"{summary['bedroom_benchmarks']:,} bedroom-benchmarks, "
            f"{summary['gift_transfers']:,} gift-transfers, "
            f"{summary['parking_patched']:,} parking patches",
            flush=True,
        )

    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
