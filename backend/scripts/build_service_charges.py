"""Pre-compute per-area service-charge ESTIMATES → data/service_charges.json.

These are estimates classified from DLD-published service-charge ranges by the
area's average price/sqft, with a villa override (villas carry far lower service
charges than apartment towers). They are the DEFAULT in the editable Net-Yield
widget — users adjust per their building, and every surface is labelled
"estimate — verify via DLD Service Charge Index / Mollak".

Bands (AED/sqft/yr):
  villa-dominant area            → 5
  avg ppsf < 1,200 (budget)      → 14
  avg ppsf 1,200–2,000 (mid)     → 18
  avg ppsf > 2,000 (luxury)      → 28

Run (CSV lives outside the repo):
    PYTHONPATH=. python scripts/build_service_charges.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

SQM_TO_SQFT = 10.7639
YEARS = {2021, 2022, 2023, 2024, 2025, 2026}
MIN_SALES = 30

CSV = Path.home() / "dld-data" / "transactions_2021_2026.csv"
OUT = Path(__file__).resolve().parent.parent / "data" / "service_charges.json"


def rate_for(avg_ppsf: float, villa_share: float) -> int:
    if villa_share > 0.5:
        return 5
    if avg_ppsf < 1200:
        return 14
    if avg_ppsf <= 2000:
        return 18
    return 28


def main() -> None:
    ppsf_sum = defaultdict(float)
    ppsf_n = defaultdict(int)
    flat = defaultdict(int)
    villa = defaultdict(int)
    names = {}

    with open(CSV, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("trans_group_en") != "Sales":
                continue
            sub = row.get("property_sub_type_en") or ""
            if sub not in ("Flat", "Villa"):
                continue
            d = row.get("instance_date", "")
            try:
                if int(d[:4]) not in YEARS:
                    continue
            except (ValueError, IndexError):
                continue
            area = (row.get("area_name_en") or "").strip()
            if not area:
                continue
            norm = area.lower()
            names[norm] = area
            if sub == "Villa":
                villa[norm] += 1
            else:
                flat[norm] += 1
            try:
                msp = float(row.get("meter_sale_price") or 0)
            except ValueError:
                msp = 0.0
            if msp > 0:
                ppsf_sum[norm] += msp / SQM_TO_SQFT
                ppsf_n[norm] += 1

    areas = []
    for norm in names:
        n = flat[norm] + villa[norm]
        if n < MIN_SALES or ppsf_n[norm] == 0:
            continue
        avg_ppsf = round(ppsf_sum[norm] / ppsf_n[norm])
        villa_share = round(villa[norm] / n, 3)
        areas.append({
            "name_norm": norm,
            "name": names[norm],
            "avg_ppsf": avg_ppsf,
            "villa_share": villa_share,
            "service_rate": rate_for(avg_ppsf, villa_share),
        })
    areas.sort(key=lambda a: a["name"])

    out = {
        "meta": {
            "window": "2021–2026",
            "source": "Estimated from DLD-published service-charge ranges, classified by area avg price/sqft (villa override).",
            "note": "Service charges vary by building. Estimate only — verify exact figures via the DLD Service Charge Index / Mollak.",
        },
        "bands": {
            "villa": 5, "budget_lt_1200": 14, "mid_1200_2000": 18, "luxury_gt_2000": 28,
        },
        "default_rate": 18,
        "vacancy_pct": 5,
        "areas": areas,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    villa_areas = sum(1 for a in areas if a["villa_share"] > 0.5)
    print(f"wrote {OUT} | areas={len(areas)} | villa-dominant={villa_areas}")


if __name__ == "__main__":
    main()
