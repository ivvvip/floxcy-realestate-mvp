"""Compute Jan-N YTD transaction count + volume for 2025 and 2026 from
`transactions_2021_2026.csv`, write to `backend/data/ytd_aggregates.json`.

Used by `/dld/dashboard-data` so the YoY delta is a true same-period
comparison instead of a 5/12 proration of full-year 2025.

Run after each transactions CSV refresh; idempotent.
"""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _transactions_classifier import (  # noqa: E402
    TX_AMOUNT_MIN, TX_AREA_MAX_UNIT, TX_PPSF_MAX, TX_PPSF_MIN, SQM_TO_SQFT,
    classify_procedure,
)

DATA_DIR = Path(os.environ.get("DLD_DATA_DIR", str(Path.home() / "dld-data")))
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "ytd_aggregates.json"


def _passes_unit_filter(row: dict) -> tuple[bool, float]:
    """Apply the same sale-track filter etl_dld_history.py uses, so the
    YTD numbers line up with dld_price_history's transaction_count /
    total_value_aed. Returns (kept, actual_worth)."""
    _reg, track = classify_procedure(row.get("procedure_name_en"))
    if track != "sale":
        return False, 0.0
    if (row.get("property_type_en") or "").strip() != "Unit":
        return False, 0.0
    try:
        value = float(row.get("actual_worth") or 0)
    except ValueError:
        return False, 0.0
    if value < TX_AMOUNT_MIN:
        return False, 0.0
    try:
        size_sqm = float(row.get("procedure_area") or 0)
    except ValueError:
        return False, 0.0
    if size_sqm <= 0 or size_sqm > TX_AREA_MAX_UNIT:
        return False, 0.0
    ppsf = value / (size_sqm * SQM_TO_SQFT)
    if ppsf < TX_PPSF_MIN or ppsf > TX_PPSF_MAX:
        return False, 0.0
    return True, value


def main() -> None:
    src = DATA_DIR / "transactions_2021_2026.csv"
    if not src.exists():
        sys.exit(f"missing source: {src}")

    # First pass: find the latest cleared month in 2026 (Unit sales only)
    # so the same-period window for 2025 matches dld_price_history's view.
    latest_month_2026 = 0
    with open(src, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            d = (row.get("instance_date") or "")[:10]
            if not d.startswith("2026-"):
                continue
            kept, _ = _passes_unit_filter(row)
            if not kept:
                continue
            try:
                m = int(d[5:7])
            except ValueError:
                continue
            if m > latest_month_2026:
                latest_month_2026 = m

    period_end_month = latest_month_2026 if 1 <= latest_month_2026 <= 12 else 12

    # Second pass: Sum count + AED value for Jan-N of 2025 and 2026
    # (same Unit-only filter).
    totals = {2025: {"count": 0, "value": 0.0}, 2026: {"count": 0, "value": 0.0}}
    with open(src, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            d = (row.get("instance_date") or "")[:10]
            if len(d) < 7:
                continue
            year_str = d[:4]
            if year_str not in ("2025", "2026"):
                continue
            try:
                m = int(d[5:7])
            except ValueError:
                continue
            if m > period_end_month:
                continue
            kept, value = _passes_unit_filter(row)
            if not kept:
                continue
            year = int(year_str)
            totals[year]["count"] += 1
            totals[year]["value"] += value

    MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    period_label = (
        f"Jan-{MONTH_ABBR[period_end_month - 1]}"
        if 1 <= period_end_month <= 12 else "full year"
    )

    out = {
        "period_end_month": period_end_month,
        "period_label": period_label,
        "year_2025": {
            "transaction_count": totals[2025]["count"],
            "total_value_aed": round(totals[2025]["value"], 2),
        },
        "year_2026": {
            "transaction_count": totals[2026]["count"],
            "total_value_aed": round(totals[2026]["value"], 2),
        },
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    print(f"wrote {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
