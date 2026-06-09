"""Pre-compute UAE residence-visa eligibility by area → data/visa_eligibility.json.

PURE RULES against our existing DLD transactions — no external data. UAE grants
residence by property value (2026 thresholds):
  - AED 750,000+  → 2-year investor (renewable) visa
  - AED 2,000,000+ → 10-year Golden Visa (family sponsorship)

Per area we compute, over residential (Flat/Villa) sales 2021–2026:
  - median sale price
  - % of sales at/above each threshold
…so the area page can show "X% of sales here qualify for a Golden Visa".

Rules may change — every surface that uses this must carry a "verify with
DLD/ICP" caveat.

Run (CSV lives outside the repo):
    PYTHONPATH=. python scripts/build_visa_eligibility.py
"""
import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

INVESTOR_VISA_AED = 750_000
GOLDEN_VISA_AED = 2_000_000
YEARS = {2021, 2022, 2023, 2024, 2025, 2026}
MIN_SALES = 30  # areas below this are too thin to quote a distribution

CSV = Path.home() / "dld-data" / "transactions_2021_2026.csv"
OUT = Path(__file__).resolve().parent.parent / "data" / "visa_eligibility.json"


def main() -> None:
    prices: dict[str, list[float]] = defaultdict(list)
    names: dict[str, str] = {}
    g_total = g_750 = g_2m = 0

    with open(CSV, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("trans_group_en") != "Sales":
                continue
            if (row.get("property_sub_type_en") or "") not in ("Flat", "Villa"):
                continue
            d = row.get("instance_date", "")
            if len(d) < 4:
                continue
            try:
                y = int(d[:4])
            except ValueError:
                continue
            if y not in YEARS:
                continue
            try:
                price = float(row.get("actual_worth") or 0)
            except ValueError:
                price = 0.0
            if price <= 0:
                continue
            area = row.get("area_name_en") or ""
            if not area:
                continue
            norm = area.strip().lower()
            prices[norm].append(price)
            names[norm] = area.strip()
            g_total += 1
            if price >= INVESTOR_VISA_AED:
                g_750 += 1
            if price >= GOLDEN_VISA_AED:
                g_2m += 1

    areas = []
    for norm, ps in prices.items():
        n = len(ps)
        if n < MIN_SALES:
            continue
        pct750 = round(100 * sum(1 for p in ps if p >= INVESTOR_VISA_AED) / n, 1)
        pct2m = round(100 * sum(1 for p in ps if p >= GOLDEN_VISA_AED) / n, 1)
        areas.append({
            "name_norm": norm,
            "name": names[norm],
            "sales": n,
            "median_price": round(statistics.median(ps)),
            "pct_investor_visa": pct750,   # ≥750K
            "pct_golden_visa": pct2m,      # ≥2M
        })
    areas.sort(key=lambda a: a["pct_golden_visa"], reverse=True)

    out = {
        "meta": {
            "window": "2021–2026",
            "total_residential_sales": g_total,
            "source": "Dubai Land Department transactions (residential Flat/Villa sales)",
            "note": "Eligibility is rule-based on property value. Rules may change — verify with DLD/ICP/GDRFA.",
        },
        "thresholds": {
            "investor_visa_aed": INVESTOR_VISA_AED,
            "golden_visa_aed": GOLDEN_VISA_AED,
        },
        "global": {
            "pct_investor_visa": round(100 * g_750 / g_total, 1) if g_total else 0,
            "pct_golden_visa": round(100 * g_2m / g_total, 1) if g_total else 0,
        },
        "areas": areas,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    print(f"wrote {OUT} | residential_sales={g_total:,} | areas={len(areas)} | "
          f"global ≥750K={out['global']['pct_investor_visa']}% ≥2M={out['global']['pct_golden_visa']}%")


if __name__ == "__main__":
    main()
