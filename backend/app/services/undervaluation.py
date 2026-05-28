"""Undervalued Area Detector — the killer feature.

Identifies UAE areas trading below where their fundamentals suggest they
should. Scoring inputs:

  * Yield premium vs UAE median            (weight 0.30)
  * Price discount vs cohort median        (weight 0.25)
  * Momentum (3mo / 12mo price slope)      (weight 0.15)
  * Volume / liquidity                     (weight 0.10)
  * Demand score                           (weight 0.10)
  * Inverse risk score                     (weight 0.10)

Output per area:
  Undervaluation { score, tier, headline, reasons[], risks[], best_for[],
                   suggested_investor_type, nearby_comparison[], factors[] }
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from statistics import median
from typing import Iterable, Optional

from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot


# Fixed UAE benchmarks (can be re-derived from snapshots — kept as guardrails)
BENCHMARK_YIELD = 6.5
BENCHMARK_APPRECIATION = 6.0


@dataclass
class UndervaluationFactor:
    name: str
    weight: float
    raw: float
    contribution: float
    note: str = ""


@dataclass
class NearbyArea:
    area_id: str
    area_name: str
    distance_km: float
    score: int
    tier: str
    price_per_sqft: float
    rental_yield: float


@dataclass
class UndervaluationReport:
    area_id: str
    area_name: str
    score: int
    tier: str  # "strong" | "moderate" | "neutral" | "overpriced"
    headline: str
    reasons: list[str]
    risks: list[str]
    best_for: list[str]
    factors: list[UndervaluationFactor] = field(default_factory=list)
    # P1 extensions
    suggested_investor_type: str = "Balanced"
    nearby_comparison: list[NearbyArea] = field(default_factory=list)


# Map raw tier codes → display labels. Backend returns codes; the frontend
# is also free to map (Display-only rename per product decision).
TIER_DISPLAY: dict[str, str] = {
    "strong": "Strong Opportunity",
    "moderate": "Moderate",
    "neutral": "Fair Value",
    "overpriced": "Overvalued",
}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two lat/lng points."""
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def classify_investor_type(
    rental_yield: float,
    appreciation_1y: float | None,
    risk_score: float | None,
) -> str:
    """Pick the headline investor profile for an area.

    Categories: Income-focused | Growth-focused | Balanced | Speculative.
    """
    appr = appreciation_1y or 0.0
    risk = risk_score if risk_score is not None else 5.0

    if risk >= 6.5 and (appr >= 12 or rental_yield >= 9):
        return "Speculative"
    income_edge = rental_yield - BENCHMARK_YIELD  # pp vs benchmark
    growth_edge = appr - BENCHMARK_APPRECIATION  # pp vs benchmark
    if income_edge >= 1.0 and growth_edge < 2.0:
        return "Income-focused"
    if growth_edge >= 2.0 and income_edge < 1.0:
        return "Growth-focused"
    return "Balanced"


def _tier_for(score: float) -> str:
    if score >= 75:
        return "strong"
    if score >= 55:
        return "moderate"
    if score >= 35:
        return "neutral"
    return "overpriced"


def _tier_headline(area: str, tier: str) -> str:
    return {
        "strong": f"{area} screens as a strong opportunity",
        "moderate": f"{area} shows moderate value vs peers",
        "neutral": f"{area} is fairly priced — no clear edge",
        "overpriced": f"{area} appears overpriced versus fundamentals",
    }[tier]


def _slope(values: list[float]) -> float:
    """Simple linear slope over normalized index 0..n-1. Returns % change per step."""
    if len(values) < 2:
        return 0.0
    n = len(values)
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(values) / n
    num = sum((xs[i] - mx) * (values[i] - my) for i in range(n))
    den = sum((xs[i] - mx) ** 2 for i in range(n))
    if den == 0:
        return 0.0
    slope = num / den
    return (slope / my) * 100 if my else 0.0


def _zscore(value: float, peers: list[float]) -> float:
    if not peers:
        return 0.0
    mu = sum(peers) / len(peers)
    var = sum((p - mu) ** 2 for p in peers) / len(peers)
    sd = var ** 0.5
    if sd == 0:
        return 0.0
    return (value - mu) / sd


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def detect_undervaluation(
    area: Area,
    latest: MarketSnapshot,
    history: list[MarketSnapshot],
    cohort_prices: list[float],
    cohort_yields: list[float],
) -> UndervaluationReport:
    """Compute the undervaluation report for a single area.

    cohort_* are the universe of (other) areas this area should be compared
    against — usually the full set of tracked UAE residential/commercial areas.
    """
    # ---- 1. Yield premium vs cohort median ----
    yield_now = float(latest.rental_yield)
    cohort_yield_med = median(cohort_yields) if cohort_yields else BENCHMARK_YIELD
    yield_edge = yield_now - cohort_yield_med  # pp
    # Map: +2pp -> 90, +1pp -> 75, 0 -> 50, -1pp -> 25, -2pp -> 10
    yield_score = _clamp(50 + yield_edge * 20, 0, 100)

    # ---- 2. Price discount vs cohort median ----
    price_now = float(latest.avg_price_per_sqft)
    cohort_price_med = median(cohort_prices) if cohort_prices else price_now
    discount = (cohort_price_med - price_now) / cohort_price_med if cohort_price_med else 0
    # +20% discount -> 90, 0 -> 50, -20% premium -> 10
    price_score = _clamp(50 + discount * 200, 0, 100)

    # ---- 3. Momentum (slope over last 12 snapshots, %/month) ----
    history_prices = [float(s.avg_price_per_sqft) for s in history[-12:]] if history else []
    momentum_pm = _slope(history_prices) if len(history_prices) >= 3 else 0.0
    # Positive momentum is good but not too hot. 1.5%/mo -> 90, 0 -> 50, -1.5% -> 10
    momentum_score = _clamp(50 + momentum_pm * 27, 0, 100)

    # ---- 4. Volume / liquidity ----
    volume = latest.transaction_volume or 0
    # 1500+ -> 90, 500 -> 70, 100 -> 40, 0 -> 10
    if volume <= 0:
        volume_score = 10.0
    elif volume < 100:
        volume_score = 30.0
    elif volume < 300:
        volume_score = 55.0
    elif volume < 600:
        volume_score = 70.0
    elif volume < 1000:
        volume_score = 80.0
    else:
        volume_score = 90.0

    # ---- 5. Demand score (already 0-10, scale to 0-100) ----
    demand = float(latest.demand_score or 5.0)
    demand_score = _clamp(demand * 10, 0, 100)

    # ---- 6. Inverse risk score (lower risk = better) ----
    risk = float(latest.risk_score or 5.0)
    inv_risk_score = _clamp((10 - risk) * 10, 0, 100)

    weights = {
        "yield": 0.30,
        "price": 0.25,
        "momentum": 0.15,
        "volume": 0.10,
        "demand": 0.10,
        "inv_risk": 0.10,
    }
    factors = [
        UndervaluationFactor(
            "yield_premium",
            weights["yield"],
            yield_now,
            round(weights["yield"] * yield_score, 1),
            f"{yield_now:.2f}% vs UAE cohort median {cohort_yield_med:.2f}%",
        ),
        UndervaluationFactor(
            "price_discount",
            weights["price"],
            price_now,
            round(weights["price"] * price_score, 1),
            f"AED {price_now:,.0f}/sqft vs cohort median AED {cohort_price_med:,.0f}",
        ),
        UndervaluationFactor(
            "momentum",
            weights["momentum"],
            momentum_pm,
            round(weights["momentum"] * momentum_score, 1),
            f"slope {momentum_pm:+.2f}%/month over last {len(history_prices)} snapshots",
        ),
        UndervaluationFactor(
            "volume",
            weights["volume"],
            volume,
            round(weights["volume"] * volume_score, 1),
            f"{volume:,} transactions in latest snapshot",
        ),
        UndervaluationFactor(
            "demand",
            weights["demand"],
            demand,
            round(weights["demand"] * demand_score, 1),
            f"demand score {demand:.1f}/10",
        ),
        UndervaluationFactor(
            "inv_risk",
            weights["inv_risk"],
            risk,
            round(weights["inv_risk"] * inv_risk_score, 1),
            f"risk {risk:.1f}/10 (lower is better)",
        ),
    ]
    total = sum(f.contribution for f in factors)
    score = int(round(_clamp(total)))
    tier = _tier_for(score)

    reasons: list[str] = []
    if yield_edge > 0.5:
        reasons.append(
            f"Rental yield {yield_now:.2f}% sits {yield_edge:+.1f}pp above the UAE cohort median."
        )
    if discount > 0.08:
        reasons.append(
            f"AED/sqft trades at a {discount * 100:.0f}% discount to cohort median pricing."
        )
    if momentum_pm > 0.5:
        reasons.append(
            f"Price momentum is positive at {momentum_pm:+.2f}%/month over the trailing window."
        )
    if demand >= 7.5:
        reasons.append("Demand score is in the top quartile of tracked areas.")
    if volume >= 600:
        reasons.append(
            f"Liquidity is healthy — {volume:,} transactions in the latest snapshot."
        )
    if not reasons:
        reasons.append(
            "No standout edge identified — metrics cluster around the UAE cohort median."
        )

    risks: list[str] = []
    if risk >= 7:
        risks.append(
            f"Risk score is elevated ({risk:.1f}/10) — historically higher volatility."
        )
    if volume < 200:
        risks.append(
            f"Liquidity is thin ({volume:,} transactions); exit timing matters."
        )
    if momentum_pm < -0.3:
        risks.append(
            f"Recent momentum is negative ({momentum_pm:+.2f}%/month) — confirm trend reversal before entry."
        )
    if discount < -0.08:
        risks.append("Prices sit above cohort median; expansion may already be priced in.")
    if (latest.appreciation_1y or 0) < 0 and (latest.appreciation_3y or 0) < 0:
        risks.append("Both 1Y and 3Y appreciation are negative — multi-period drawdown.")
    if not risks:
        risks.append(
            "Standard market risk applies. Supply pipeline and macro liquidity remain monitor-worthy."
        )

    # Investor-profile match
    best_for: list[str] = []
    if yield_now >= cohort_yield_med + 1:
        best_for.append("Rental-income investors prioritizing cash flow")
    if (latest.appreciation_1y or 0) > BENCHMARK_APPRECIATION + 1:
        best_for.append("Growth-oriented investors comfortable with cyclicality")
    if risk <= 4 and volume >= 400:
        best_for.append("Conservative capital — blue-chip allocation")
    if risk >= 7:
        best_for.append("High-conviction, opportunistic capital with longer hold")
    if not best_for:
        best_for.append("Balanced portfolios; suitable for diversification, not concentration")

    investor_type = classify_investor_type(
        rental_yield=yield_now,
        appreciation_1y=latest.appreciation_1y,
        risk_score=latest.risk_score,
    )

    return UndervaluationReport(
        area_id=str(area.id),
        area_name=area.name,
        score=score,
        tier=tier,
        headline=_tier_headline(area.name, tier),
        reasons=reasons,
        risks=risks,
        best_for=best_for,
        factors=factors,
        suggested_investor_type=investor_type,
    )


def report_to_dict(r: UndervaluationReport) -> dict:
    out = asdict(r)
    return out
