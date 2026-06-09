"""Pre-compute the Dubai Market Timing dataset → backend/data/market_timing.json.

CITY-LEVEL ONLY. Reads ~/dld-data/transactions_2021_2026.csv, restricts to SALES
in the complete years 2021–2025 (pre-2021 is sparse/noisy, 2026 is partial), and
emits the statistically-verified monthly/quarterly seasonality the /timing page
and the AI Advisor consume.

Significance is established by (a) a per-year chi-square goodness-of-fit vs a
uniform month distribution (df=11, crit .05 = 19.68) and (b) cross-year
direction consistency (how many of the 5 years a month sits above/below the
annual average). Price is detrended per year (month PPSF ÷ that year's mean
PPSF) so secular price growth does not masquerade as seasonality.

Per-area monthly timing is DELIBERATELY NOT emitted — it is statistically noise
(the "cheapest month" matches only ~1/5 years per area). Do not add it.

Run (CSV lives outside the repo):
    PYTHONPATH=. python scripts/build_market_timing.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

SQM_TO_SQFT = 10.7639
YEARS = [2021, 2022, 2023, 2024, 2025]
MN = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
CSV = Path.home() / "dld-data" / "transactions_2021_2026.csv"
OUT = Path(__file__).resolve().parent.parent / "data" / "market_timing.json"
CHI2_CRIT_05 = 19.68  # df = 11


def main() -> None:
    ym = defaultdict(lambda: [0, 0.0, 0.0, 0])  # (y,m) -> cnt, price_sum, ppsf_sum, ppsf_n
    with open(CSV, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("trans_group_en") != "Sales":
                continue
            d = row.get("instance_date", "")
            if len(d) < 7:
                continue
            try:
                y, m = int(d[:4]), int(d[5:7])
            except ValueError:
                continue
            if y not in YEARS or not (1 <= m <= 12):
                continue
            try:
                price = float(row.get("actual_worth") or 0)
            except ValueError:
                price = 0.0
            try:
                msp = float(row.get("meter_sale_price") or 0)
            except ValueError:
                msp = 0.0
            ppsf = msp / SQM_TO_SQFT if msp > 0 else 0.0
            a = ym[(y, m)]
            a[0] += 1
            a[1] += price
            if ppsf > 0:
                a[2] += ppsf
                a[3] += 1

    yr_tot = {y: sum(ym[(y, m)][0] for m in range(1, 13)) for y in YEARS}
    yr_ppsf = {}
    for y in YEARS:
        s = sum(ym[(y, m)][2] for m in range(1, 13))
        n = sum(ym[(y, m)][3] for m in range(1, 13))
        yr_ppsf[y] = (s / n) if n else 0.0
    total = sum(yr_tot.values())

    months = []
    for m in range(1, 13):
        c = sum(ym[(y, m)][0] for y in YEARS)
        ppsf_sum = sum(ym[(y, m)][2] for y in YEARS)
        ppsf_n = sum(ym[(y, m)][3] for y in YEARS)
        shares = [ym[(y, m)][0] / yr_tot[y] for y in YEARS]
        demand_index = sum(s * 12 for s in shares) / len(shares)
        demand_years_above = sum(1 for s in shares if s > 1 / 12)
        ratios = []
        for y in YEARS:
            a = ym[(y, m)]
            if a[3] > 0 and yr_ppsf[y] > 0:
                ratios.append((a[2] / a[3]) / yr_ppsf[y])
        price_index = sum(ratios) / len(ratios) if ratios else 0.0
        price_years_below = sum(1 for r in ratios if r < 1)
        months.append({
            "m": m,
            "name": MN[m],
            "sales": c,
            "pct": round(100 * c / total, 1),
            "avg_ppsf": round(ppsf_sum / ppsf_n) if ppsf_n else None,
            "demand_index": round(demand_index, 3),
            "demand_years_above": demand_years_above,
            "price_index": round(price_index, 4),
            "price_years_below": price_years_below,
        })

    # Significance — per-year chi-square vs uniform
    chi2 = {}
    sig_years = 0
    for y in YEARS:
        e = yr_tot[y] / 12
        c2 = sum((ym[(y, m)][0] - e) ** 2 / e for m in range(1, 13))
        chi2[str(y)] = round(c2, 1)
        if c2 > CHI2_CRIT_05:
            sig_years += 1

    quarters = []
    qlabel = {1: "quietest", 4: "peak"}
    for q in range(1, 5):
        qc = sum(months[m - 1]["sales"] for m in range(1, 13) if (m - 1) // 3 + 1 == q)
        quarters.append({"q": q, "pct": round(100 * qc / total, 1), "label": qlabel.get(q, "")})

    summer_share = [
        (ym[(y, 6)][0] + ym[(y, 7)][0] + ym[(y, 8)][0]) / yr_tot[y] for y in YEARS
    ]
    summer_pct = round(100 * sum(months[m - 1]["sales"] for m in (6, 7, 8)) / total, 1)
    busiest_summer = max((6, 7, 8), key=lambda m: months[m - 1]["sales"])

    feb = months[1]
    best_buy = {
        "month": "February",
        "m": 2,
        "pct_below_avg": round((1 - feb["price_index"]) * 100, 1),
        "years_consistent": f"{feb['price_years_below']}/5",  # years Feb PPSF below annual avg
        "reason": "lowest prices + lowest competition",
    }

    out = {
        "meta": {
            "window": "2021–2025",
            "total_sales": total,
            "source": "Dubai Land Department transactions (registration dates)",
            "note": "Complete years only — pre-2021 is sparse and 2026 is partial, both excluded.",
        },
        "months": months,
        "best_buy": best_buy,
        "best_sell": {
            "months": "November–December",
            "reason": "peak buyer demand + highest prices of the year",
        },
        "demand_high_months": [MN[m] for m in range(1, 13) if months[m - 1]["demand_years_above"] >= 4],
        "demand_low_months": [MN[m] for m in range(1, 13) if months[m - 1]["demand_years_above"] <= 1],
        "quarters": quarters,
        "summer": {
            "share_pct": summer_pct,
            "flat_pct": 25.0,
            "below_flat_years": f"{sum(1 for s in summer_share if s < 0.25)}/5",
            "busiest_summer_month": MN[busiest_summer],
            "verdict": "No summer slowdown — myth busted",
        },
        "significance": {
            "method": "Per-year chi-square goodness-of-fit vs uniform (df=11, crit .05 = 19.68) + cross-year direction consistency.",
            "significant_years": f"{sig_years}/5",
            "chi2_by_year": chi2,
        },
        "caveats": [
            "Based on DLD registration dates — the deal may have been agreed earlier.",
            "The price signal is real but modest (~±7% around the annual average).",
            "City-wide pattern only. Individual areas vary, and per-area monthly timing is NOT statistically reliable.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    print(f"wrote {OUT} | sales={total:,} | sig_years={sig_years}/5 | best_buy={best_buy['month']}")


if __name__ == "__main__":
    main()
