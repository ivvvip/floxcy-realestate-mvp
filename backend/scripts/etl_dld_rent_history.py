"""DLD historical-rents ETL → dld_rent_history + dld_yield_history.

Streams a multi-year DLD Ejari rent contracts export, aggregates per
area × year, separates New vs Renew, and derives gross_yield by joining
dld_price_history. Same operating pattern as etl_dld_history.py — stdlib
csv stream, idempotent DELETE+INSERT, respects the CLAUDE.md 10.0.1.7
IP swap.

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

# Same unit-type set as transactions ETL so the yield join compares
# like-for-like (registered strata Sales-of-Unit vs Ejari Flat/Villa/Hotel
# Apartment rents).
ALLOWED_PROP_TYPES = {"Flat", "Villa", "Hotel Apartment"}


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


def stream_qualifying_rents(path: Path, progress_every: int):
    """Yield (area_norm, year, is_renew, annual_rent, rent_psf, size_sqm)."""
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
                    f"  [{total:>11,} rows scanned · {kept:>10,} kept · {pct:5.1f}% pass]",
                    flush=True,
                )
                last_report = total

            prop_type = (row.get("ejari_property_type_en") or "").strip()
            if prop_type not in ALLOWED_PROP_TYPES:
                continue

            area_norm = _norm_area(row.get("area_name_en"))
            if not area_norm:
                continue

            annual = _f(row.get("annual_amount"))
            if not annual or annual < ANNUAL_RENT_MIN or annual > ANNUAL_RENT_MAX:
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

            kept += 1
            yield (area_norm, year, is_renew, annual, rent_psf, size_sqm)

    print(
        f"  [DONE · {total:,} total rows · {kept:,} kept · "
        f"{(kept/total*100 if total else 0):.2f}% pass]",
        flush=True,
    )


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

class RentAgg:
    __slots__ = ("annuals", "rpsfs", "new_count", "renew_count")

    def __init__(self) -> None:
        self.annuals: list[float] = []
        self.rpsfs: list[float] = []
        self.new_count = 0
        self.renew_count = 0

    def add(self, is_renew: bool, annual: float, rent_psf: float) -> None:
        self.annuals.append(annual)
        self.rpsfs.append(rent_psf)
        if is_renew:
            self.renew_count += 1
        else:
            self.new_count += 1


def aggregate(path: Path, progress_every: int) -> dict[tuple[str, int], RentAgg]:
    print(f"Aggregating {path}", flush=True)
    aggs: dict[tuple[str, int], RentAgg] = collections.defaultdict(RentAgg)
    for area_norm, year, is_renew, annual, rent_psf, _ in stream_qualifying_rents(
        path, progress_every
    ):
        aggs[(area_norm, year)].add(is_renew, annual, rent_psf)
    return aggs


def build_rent_rows(aggs: dict[tuple[str, int], RentAgg]) -> list[dict]:
    rows: list[dict] = []
    for (area_norm, year), a in aggs.items():
        n = len(a.annuals)
        if n == 0:
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


def write_rent_history_and_derive_yields(rent_rows: list[dict]) -> dict:
    """Write dld_rent_history, then derive dld_yield_history in a single
    SQL pass joining against dld_price_history. Returns summary counts."""
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
                ))
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_rent_history (
                    id, dld_area_id, area_name_norm, year,
                    avg_annual_rent, median_annual_rent,
                    avg_rent_per_sqft, median_rent_per_sqft,
                    contract_count, new_count, renew_count, renewal_rate_pct
                ) VALUES %s
                """,
                rh_rows,
                page_size=500,
            )
            print(f"  inserted {len(rh_rows):,} rent-history rows", flush=True)

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

    aggs = aggregate(path, progress_every=args.progress_every)
    rows = build_rent_rows(aggs)
    print(f"\nDistinct (area, year) rent groups: {len(rows):,}", flush=True)

    if args.to_db:
        summary = write_rent_history_and_derive_yields(rows)
        print(
            f"\nSummary: {summary['rent_rows']:,} rent rows, "
            f"{summary['yield_rows']:,} yield rows, "
            f"{summary['areas_with_3y_yield']:,} areas with ≥3y yield series",
            flush=True,
        )
        report_top_yield_areas(n=args.top_n)

    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
