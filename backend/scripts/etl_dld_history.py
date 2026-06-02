"""DLD historical-transactions ETL → dld_price_history + dld_area_appreciation.

Streams a multi-year Sales-of-Unit DLD export, aggregates per area × year,
splits Ready vs Off-Plan, computes appreciation deltas and 5y CAGR, and
optionally writes to Postgres.

Run patterns:
    python scripts/etl_dld_history.py            # dry-run: aggregate + summary
    python scripts/etl_dld_history.py --to-db    # write to Postgres
    python scripts/etl_dld_history.py --to-db --progress-every 250000

Reads DATABASE_URL from backend/.env (asyncpg → sync psycopg2).
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

# csv default field-size limit (131072) trips on a few huge rows in DLD exports
csv.field_size_limit(sys.maxsize)

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

SQM_TO_SQFT = 10.7639
PPSF_MIN = 100.0
PPSF_MAX = 20_000.0
DEAL_VALUE_MIN = 50_000.0          # filter clearly-bogus rows
DEAL_VALUE_MAX = 500_000_000.0
YEARS = list(range(2021, 2027))    # 2021..2026 inclusive
CHUNK_REPORT_DEFAULT = 100_000


# ---------------------------------------------------------------------------
# CSV parsing
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


def stream_qualifying_rows(path: Path, progress_every: int = CHUNK_REPORT_DEFAULT):
    """Yield (area_norm, year, is_offplan, ppsf_sqft, deal_value, deal_size_sqm)
    for every row matching the filter:

      trans_group_en == 'Sales'
      property_type_en == 'Unit'
      procedure_area > 0
      actual_worth > 0
      year in [2021..2026]
    """
    total = 0
    kept = 0
    last_report = 0
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            if total - last_report >= progress_every:
                pct = (kept / total * 100) if total else 0
                print(
                    f"  [{total:>10,} rows scanned · {kept:>9,} kept · {pct:5.1f}% pass]",
                    flush=True,
                )
                last_report = total

            if (row.get("trans_group_en") or "").strip() != "Sales":
                continue
            if (row.get("property_type_en") or "").strip() != "Unit":
                continue

            area_norm = _norm_area(row.get("area_name_en"))
            if not area_norm:
                continue

            size_sqm = _f(row.get("procedure_area"))
            if not size_sqm or size_sqm <= 0:
                continue

            value = _f(row.get("actual_worth"))
            if not value or value < DEAL_VALUE_MIN or value > DEAL_VALUE_MAX:
                continue

            size_sqft = size_sqm * SQM_TO_SQFT
            ppsf = value / size_sqft
            if ppsf < PPSF_MIN or ppsf > PPSF_MAX:
                continue

            # Year from instance_date (YYYY-MM-DD)
            date_str = (row.get("instance_date") or "").strip()
            if len(date_str) < 4:
                continue
            try:
                year = int(date_str[:4])
            except ValueError:
                continue
            if year not in YEARS:
                continue

            reg = (row.get("reg_type_en") or "").strip()
            is_offplan = reg == "Off-Plan Properties"

            kept += 1
            yield (area_norm, year, is_offplan, ppsf, value, size_sqm)

    print(
        f"  [DONE · {total:,} total rows · {kept:,} kept · "
        f"{(kept/total*100 if total else 0):.2f}% pass]",
        flush=True,
    )


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

class AreaYearAgg:
    """Holds raw samples + counters for a single (area, year) group."""
    __slots__ = (
        "ppsf_all", "ppsf_ready", "ppsf_offplan",
        "values_all", "size_sqm_all",
        "count_ready", "count_offplan",
    )

    def __init__(self) -> None:
        # Sample lists for medians (kept lean — these are floats)
        self.ppsf_all: list[float] = []
        self.ppsf_ready: list[float] = []
        self.ppsf_offplan: list[float] = []
        self.values_all: list[float] = []
        self.size_sqm_all: list[float] = []
        self.count_ready = 0
        self.count_offplan = 0

    def add(self, is_offplan: bool, ppsf: float, value: float, size_sqm: float) -> None:
        self.ppsf_all.append(ppsf)
        self.values_all.append(value)
        self.size_sqm_all.append(size_sqm)
        if is_offplan:
            self.ppsf_offplan.append(ppsf)
            self.count_offplan += 1
        else:
            self.ppsf_ready.append(ppsf)
            self.count_ready += 1


def aggregate(path: Path, progress_every: int) -> dict[tuple[str, int], AreaYearAgg]:
    """Stream the file once, return {(area_norm, year): AreaYearAgg}."""
    print(f"Aggregating {path}", flush=True)
    aggs: dict[tuple[str, int], AreaYearAgg] = collections.defaultdict(AreaYearAgg)
    for area_norm, year, is_offplan, ppsf, value, size_sqm in stream_qualifying_rows(
        path, progress_every
    ):
        aggs[(area_norm, year)].add(is_offplan, ppsf, value, size_sqm)
    return aggs


def build_history_rows(
    aggs: dict[tuple[str, int], AreaYearAgg],
) -> list[dict]:
    """Compute final per-(area,year) record from raw samples."""
    rows: list[dict] = []
    for (area_norm, year), a in aggs.items():
        n = len(a.ppsf_all)
        if n == 0:
            continue
        avg_all = statistics.fmean(a.ppsf_all)
        median_all = statistics.median(a.ppsf_all)
        avg_ready = statistics.fmean(a.ppsf_ready) if a.ppsf_ready else None
        avg_offplan = statistics.fmean(a.ppsf_offplan) if a.ppsf_offplan else None
        total_value = sum(a.values_all)
        median_deal_size = statistics.median(a.values_all)
        offplan_pct = a.count_offplan / n * 100 if n else 0
        rows.append({
            "area_name_norm": area_norm,
            "year": year,
            "avg_ppsf_all": round(avg_all, 2),
            "median_ppsf_all": round(median_all, 2),
            "avg_ppsf_ready": round(avg_ready, 2) if avg_ready is not None else None,
            "avg_ppsf_offplan": round(avg_offplan, 2) if avg_offplan is not None else None,
            "transaction_count": n,
            "transaction_count_ready": a.count_ready,
            "transaction_count_offplan": a.count_offplan,
            "total_value_aed": round(total_value, 2),
            "median_deal_size": round(median_deal_size, 2),
            "offplan_pct": round(offplan_pct, 2),
        })
    return rows


# ---------------------------------------------------------------------------
# Appreciation derivation
# ---------------------------------------------------------------------------

def build_appreciation_rows(history_rows: list[dict]) -> list[dict]:
    """For each area: appreciation_1y/3y/5y + cagr_5y from the time series."""
    by_area: dict[str, dict[int, float]] = collections.defaultdict(dict)
    for r in history_rows:
        # Use avg_ppsf_all so off-plan and ready blend cleanly
        if r["avg_ppsf_all"] is not None:
            by_area[r["area_name_norm"]][r["year"]] = float(r["avg_ppsf_all"])

    rows: list[dict] = []
    for area_norm, series in by_area.items():
        if not series:
            continue
        years_sorted = sorted(series.keys())
        latest_year = years_sorted[-1]
        base_year = years_sorted[0]
        latest = series[latest_year]

        def _delta(years_back: int) -> Optional[float]:
            target = latest_year - years_back
            if target in series and series[target] > 0:
                return round((latest - series[target]) / series[target] * 100, 2)
            return None

        # CAGR over the full span (or 5y if available)
        cagr_5y = None
        target_5y = latest_year - 5
        if target_5y in series and series[target_5y] > 0:
            n_yrs = 5
            ratio = latest / series[target_5y]
            cagr_5y = round((ratio ** (1.0 / n_yrs) - 1) * 100, 2)

        rows.append({
            "area_name_norm": area_norm,
            "base_year": base_year,
            "latest_year": latest_year,
            "appreciation_1y_pct": _delta(1),
            "appreciation_3y_pct": _delta(3),
            "appreciation_5y_pct": _delta(5),
            "cagr_5y_pct": cagr_5y,
            "years_of_data": len(years_sorted),
        })
    return rows


# ---------------------------------------------------------------------------
# Postgres write
# ---------------------------------------------------------------------------

def get_sync_db_url() -> str:
    """Convert asyncpg URL from backend/.env to sync psycopg2 URL.

    Respects the CLAUDE.md "10.0.1.7 IP swap" — caller can override the host
    by patching .env before this runs.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                # psycopg2 prefers postgresql:// (no asyncpg)
                return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


def write_to_db(history: list[dict], appreciations: list[dict]) -> None:
    import psycopg2
    import psycopg2.extras

    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            # Resolve dld_area_id from area_name_norm for both tables
            cur.execute("SELECT name_norm, id FROM dld_areas")
            area_ids = {n: i for n, i in cur.fetchall()}
            print(f"  {len(area_ids):,} known dld_areas", flush=True)

            # Idempotent rebuild
            cur.execute("DELETE FROM dld_price_history")
            cur.execute("DELETE FROM dld_area_appreciation")

            ph_rows = []
            for r in history:
                ph_rows.append((
                    str(uuid.uuid4()),
                    area_ids.get(r["area_name_norm"]),
                    r["area_name_norm"],
                    r["year"],
                    r["avg_ppsf_ready"],
                    r["avg_ppsf_offplan"],
                    r["avg_ppsf_all"],
                    r["median_ppsf_all"],
                    r["transaction_count"],
                    r["transaction_count_ready"],
                    r["transaction_count_offplan"],
                    r["total_value_aed"],
                    r["median_deal_size"],
                    r["offplan_pct"],
                ))
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

            ap_rows = []
            for r in appreciations:
                ap_rows.append((
                    str(uuid.uuid4()),
                    area_ids.get(r["area_name_norm"]),
                    r["area_name_norm"],
                    r["base_year"],
                    r["latest_year"],
                    r["appreciation_1y_pct"],
                    r["appreciation_3y_pct"],
                    r["appreciation_5y_pct"],
                    r["cagr_5y_pct"],
                    r["years_of_data"],
                ))
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_area_appreciation (
                    id, dld_area_id, area_name_norm, base_year, latest_year,
                    appreciation_1y_pct, appreciation_3y_pct, appreciation_5y_pct,
                    cagr_5y_pct, years_of_data
                ) VALUES %s
                """,
                ap_rows,
                page_size=500,
            )
            print(f"  inserted {len(ap_rows):,} appreciation rows", flush=True)

        conn.commit()
        print("✓ committed", flush=True)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Top-N report
# ---------------------------------------------------------------------------

def report_top_n_by_5y(appreciations: list[dict], n: int = 10) -> None:
    enriched = [r for r in appreciations if r["appreciation_5y_pct"] is not None]
    # Require at least 50 transactions across the 5y span to filter noise
    print(
        f"\nTop {n} areas by 5-year appreciation (full 5y series, "
        f"any volume):", flush=True,
    )
    enriched.sort(key=lambda r: r["appreciation_5y_pct"], reverse=True)
    print(f"  {'Area':<40} {'5y app':>10} {'CAGR 5y':>10} {'1y':>8} {'3y':>8}")
    for r in enriched[:n]:
        print(
            f"  {r['area_name_norm'][:40]:<40} "
            f"{r['appreciation_5y_pct']:>9.1f}% "
            f"{r['cagr_5y_pct']:>9.1f}% "
            f"{(r['appreciation_1y_pct'] or 0):>7.1f}% "
            f"{(r['appreciation_3y_pct'] or 0):>7.1f}%"
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
    parser.add_argument(
        "--progress-every", type=int, default=CHUNK_REPORT_DEFAULT,
        help="Print a progress line every N rows scanned",
    )
    parser.add_argument("--top-n", type=int, default=10)
    args = parser.parse_args()

    started_at = dt.datetime.utcnow()
    path = Path(args.file).expanduser()
    if not path.exists():
        print(f"ERROR: file not found: {path}", flush=True)
        return 2

    aggs = aggregate(path, progress_every=args.progress_every)
    history = build_history_rows(aggs)
    print(f"\nDistinct (area, year) groups: {len(history):,}", flush=True)
    appreciations = build_appreciation_rows(history)
    print(f"Distinct areas with appreciation: {len(appreciations):,}", flush=True)

    if args.to_db:
        write_to_db(history, appreciations)

    report_top_n_by_5y(appreciations, n=args.top_n)

    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
