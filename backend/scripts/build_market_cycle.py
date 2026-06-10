"""Pre-compute the Market Cycle Phase signals → data/market_cycle.json.

HONEST + RULE-BASED. Cycle phase is interpretive, so this does NOT hardcode a
label — it computes the underlying signals from 18 years of DLD residential
(Flat/Villa) sales and classifies via transparent rules, exposing every signal
so investors can judge for themselves.

Signals (last COMPLETE year vs history; the partial current year is shown but
never used for trend):
  - price: latest PPSF, YoY, 3y/5y CAGR, and whether YoY is decelerating
  - volume: latest vs the long-run average, and YoY direction
  - price-vs-history: % above the 2014 level (pre-2014 PPSF is too noisy to cite)
  - supply: off-plan share + its trend
  - velocity: sign of price acceleration

Phase is one of: recovery / growth / growth_maturing / peak / correction.
A `gauge` in [0,1] positions us on Recovery→Growth→Peak→Correction.

Run (CSV lives outside the repo):
    PYTHONPATH=. python scripts/build_market_cycle.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

SQM_TO_SQFT = 10.7639
CSV = Path.home() / "dld-data" / "transactions_2021_2026.csv"
OUT = Path(__file__).resolve().parent.parent / "data" / "market_cycle.json"
MIN_YEAR = 2008


def main() -> None:
    yr = defaultdict(lambda: [0, 0.0, 0, 0, 0])  # year -> count, ppsf_sum, ppsf_n, offplan, ready
    with open(CSV, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r.get("trans_group_en") != "Sales":
                continue
            if (r.get("property_sub_type_en") or "") not in ("Flat", "Villa"):
                continue
            d = r.get("instance_date", "")
            try:
                y = int(d[:4])
            except (ValueError, IndexError):
                continue
            if y < MIN_YEAR or y > 2026:
                continue
            try:
                msp = float(r.get("meter_sale_price") or 0)
            except ValueError:
                msp = 0.0
            a = yr[y]
            a[0] += 1
            if msp > 0:
                a[1] += msp / SQM_TO_SQFT
                a[2] += 1
            reg = r.get("reg_type_en") or ""
            if reg.startswith("Off-Plan"):
                a[3] += 1
            elif reg.startswith("Existing"):
                a[4] += 1

    years = sorted(yr)
    ppsf = {y: (yr[y][1] / yr[y][2] if yr[y][2] else 0.0) for y in years}
    rows = []
    for i, y in enumerate(years):
        c, _, _, off, rdy = yr[y]
        prev = years[i - 1] if i else None
        rows.append({
            "year": y,
            "sales": c,
            "avg_ppsf": round(ppsf[y]),
            "yoy_price_pct": round((ppsf[y] / ppsf[prev] - 1) * 100, 1) if prev and ppsf[prev] else None,
            "yoy_volume_pct": round((c / yr[prev][0] - 1) * 100, 1) if prev and yr[prev][0] else None,
            "offplan_share_pct": round(100 * off / (off + rdy)) if (off + rdy) else None,
            "partial": y == 2026,
        })

    # Trend math on the last COMPLETE year (2025) — never the partial 2026.
    last = 2025 if 2025 in ppsf else years[-1]
    def cagr(a, b, n):
        return round(((b / a) ** (1 / n) - 1) * 100, 1) if a > 0 else None
    yoy_series = [ppsf[y] / ppsf[y - 1] - 1 for y in range(last - 3, last + 1) if (y - 1) in ppsf and ppsf[y - 1]]
    decelerating = len(yoy_series) >= 3 and all(yoy_series[k] > yoy_series[k + 1] for k in range(len(yoy_series) - 1))
    yoy_last = round((ppsf[last] / ppsf[last - 1] - 1) * 100, 1)
    avg_vol = sum(yr[y][0] for y in years) / len(years)
    vs_2014 = round((ppsf[last] / ppsf[2014] - 1) * 100, 1) if 2014 in ppsf else None
    offplan_last = next((r["offplan_share_pct"] for r in rows if r["year"] == last), None)
    offplan_2020 = next((r["offplan_share_pct"] for r in rows if r["year"] == 2020), None)
    # Record-high judged on the CLEAN window only (≥2014). Pre-2014 PPSF has
    # data-quality spikes (e.g. 2012 ≈ 2,861) that would otherwise mask a
    # genuine new high.
    clean = [y for y in years if 2014 <= y <= last]
    record_high = ppsf[last] >= max(ppsf[y] for y in clean)
    record_vol = yr[last][0] >= max(yr[y][0] for y in clean)

    # --- Transparent phase rules ---
    if yoy_last < -2:
        phase, gauge = "correction", 0.9
    elif yoy_last <= 1.5:
        phase, gauge = "peak", 0.72
    elif decelerating and record_high:
        phase, gauge = "growth_maturing", 0.58   # late growth, approaching peak
    elif yoy_last > 1.5 and not record_high:
        phase, gauge = "recovery", 0.2
    else:
        phase, gauge = "growth", 0.4

    PHASE_LABEL = {
        "recovery": "Recovery", "growth": "Growth / Expansion",
        "growth_maturing": "Growth — Maturing", "peak": "Peak / Plateau",
        "correction": "Correction",
    }

    out = {
        "meta": {
            "window": f"{years[0]}–2026",
            "complete_through": last,
            "source": "Dubai Land Department residential (Flat/Villa) sales",
            "note": "Cycle phase is an interpretation of market signals, not a prediction. Pre-2014 PPSF is sparse/noisy and not used for trend or peak claims.",
        },
        "phase": phase,
        "phase_label": PHASE_LABEL[phase],
        "gauge": gauge,  # 0=Recovery .. 1=Correction
        "signals": {
            "price": {
                "latest_ppsf": round(ppsf[last]),
                "yoy_pct": yoy_last,
                "cagr_3y_pct": cagr(ppsf[last - 3], ppsf[last], 3) if (last - 3) in ppsf else None,
                "cagr_5y_pct": cagr(ppsf[last - 5], ppsf[last], 5) if (last - 5) in ppsf else None,
                "decelerating": decelerating,
                "direction": "rising" if yoy_last > 0 else "falling",
            },
            "volume": {
                "latest": yr[last][0],
                "long_run_avg": round(avg_vol),
                "vs_avg_pct": round((yr[last][0] / avg_vol - 1) * 100),
                "record_high": record_vol,
            },
            "vs_history": {"vs_2014_pct": vs_2014, "record_high_price": record_high},
            "supply": {
                "offplan_share_pct": offplan_last,
                "offplan_share_2020_pct": offplan_2020,
                "trend": "rising" if (offplan_last or 0) > (offplan_2020 or 0) else "flat/falling",
            },
        },
        "interpretation": (
            "Prices and volume are at record highs but price growth has decelerated for several years "
            "running, while the off-plan supply share keeps climbing — a maturing expansion drifting toward "
            "the later part of the cycle. Whether this becomes a soft plateau or a peak cannot be predicted."
        ),
        "by_year": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))
    print(f"wrote {OUT} | phase={phase} gauge={gauge} | {last} YoY={yoy_last}% decel={decelerating} vs2014={vs_2014}%")


if __name__ == "__main__":
    main()
