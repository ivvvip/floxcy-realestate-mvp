"""Opportunity Engine — the platform's investment-decision layer.

Ranks every tracked UAE area by a 0-100 `opportunity_score` blended from
five normalized components (yield, appreciation, value-entry, demand,
risk). Each area is also tagged with one of six `opportunity_type` labels
based on a deterministic, reordered classifier:

  1. Premium Hold        — score>=70 AND demand>=8 AND risk<=4
  2. Growth Opportunity  — appreciation_1y>10 AND appr_component>0.7
  3. Speculative         — appreciation_1y>12 AND risk>=6.5
  4. Income Opportunity  — yield>7 AND value_component>0.6
  5. Value Opportunity   — value_component>0.6 (only when other tags miss)
  6. Balanced            — fallback

Formula (each component normalized [0,1]):

  yield_c    = clamp((rental_yield      - 3) / 7)                 # 3% → 0, 10% → 1
  appr_c     = clamp((appreciation_1y + 5) / 25)                  # -5% → 0, +20% → 1
  value_c    = clamp((cohort_median_price - price) / cohort_median_price + 0.5)
               # 0 if 50% premium to median, 0.5 at median, 1 if free
  demand_c   = clamp(0.6 * occupancy/100 + 0.4 * min(1, volume/1500))
  risk_c     = clamp((10 - risk_score) / 10)

  score = 100 * (0.30*yield_c + 0.25*appr_c + 0.25*value_c +
                 0.10*demand_c + 0.10*risk_c)
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


COMPONENT_WEIGHTS = {
    "yield": 0.30,
    "appreciation": 0.25,
    "value": 0.25,
    "demand": 0.10,
    "risk": 0.10,
}

# Opportunity-type taxonomy (display labels).
OPPORTUNITY_TYPES = [
    "Premium Hold",
    "Growth Opportunity",
    "Speculative",
    "Income Opportunity",
    "Value Opportunity",
    "Balanced",
]


@dataclass
class OpportunityComponents:
    yield_c: float
    appr_c: float
    value_c: float
    demand_c: float
    risk_c: float


@dataclass
class NearbyArea:
    area_id: str
    area_name: str
    distance_km: float
    opportunity_score: int
    opportunity_type: str
    price_per_sqft: float
    rental_yield: float


@dataclass
class KeyMetrics:
    rental_yield: Optional[float]
    price_per_sqft: Optional[float]
    appreciation_1y: Optional[float]
    appreciation_3y: Optional[float]
    investment_score: Optional[float]
    risk_score: Optional[float]
    demand_score: Optional[float]
    transaction_volume: Optional[int]
    occupancy_rate: Optional[float]


@dataclass
class OpportunityReport:
    area_id: str
    area_name: str
    area_name_arabic: Optional[str]
    area_type: str
    opportunity_score: int
    opportunity_type: str
    confidence_level: float
    components: OpportunityComponents
    key_metrics: KeyMetrics
    why: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    best_for: str = ""
    strategy: str = ""
    nearby_comparison: list[NearbyArea] = field(default_factory=list)
    snapshot_date: Optional[str] = None
    last_updated: Optional[str] = None


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
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


def compute_components(
    *,
    rental_yield: float,
    appreciation_1y: Optional[float],
    price_per_sqft: float,
    cohort_median_price: float,
    occupancy_rate: Optional[float],
    transaction_volume: Optional[int],
    risk_score: Optional[float],
) -> OpportunityComponents:
    """Normalize raw metrics to [0,1] components."""
    yield_c = _clamp((float(rental_yield) - 3.0) / 7.0)
    appr = float(appreciation_1y) if appreciation_1y is not None else 0.0
    appr_c = _clamp((appr + 5.0) / 25.0)
    value_c = _clamp(
        (float(cohort_median_price) - float(price_per_sqft)) / float(cohort_median_price) + 0.5
        if cohort_median_price
        else 0.5
    )
    occ = float(occupancy_rate) / 100.0 if occupancy_rate is not None else 0.85
    vol = int(transaction_volume or 0)
    demand_c = _clamp(0.6 * occ + 0.4 * min(1.0, vol / 1500.0))
    risk = float(risk_score) if risk_score is not None else 5.0
    risk_c = _clamp((10.0 - risk) / 10.0)
    return OpportunityComponents(yield_c, appr_c, value_c, demand_c, risk_c)


def score_from_components(c: OpportunityComponents) -> int:
    """Weighted blend → 0-100 integer."""
    raw = 100.0 * (
        COMPONENT_WEIGHTS["yield"] * c.yield_c
        + COMPONENT_WEIGHTS["appreciation"] * c.appr_c
        + COMPONENT_WEIGHTS["value"] * c.value_c
        + COMPONENT_WEIGHTS["demand"] * c.demand_c
        + COMPONENT_WEIGHTS["risk"] * c.risk_c
    )
    return int(round(_clamp(raw, 0.0, 100.0)))


def classify_type(
    *,
    score: int,
    rental_yield: float,
    appreciation_1y: Optional[float],
    components: OpportunityComponents,
    demand_score: Optional[float],
    risk_score: Optional[float],
) -> str:
    """First-match classifier, reordered to surface Premium → Growth → Speculative."""
    appr = float(appreciation_1y) if appreciation_1y is not None else 0.0
    demand = float(demand_score) if demand_score is not None else 5.0
    risk = float(risk_score) if risk_score is not None else 5.0
    y = float(rental_yield)

    # 1. Premium Hold — solid score with strong demand and safe risk
    if score >= 70 and demand >= 8.0 and risk <= 4.0:
        return "Premium Hold"
    # 2. Growth Opportunity — strong appreciation
    if appr > 10 and components.appr_c > 0.7:
        return "Growth Opportunity"
    # 3. Speculative — high appreciation AND high risk
    if appr > 12 and risk >= 6.5:
        return "Speculative"
    # 4. Income Opportunity — yield-led + value entry
    if y > 7 and components.value_c > 0.6:
        return "Income Opportunity"
    # 5. Value Opportunity — value entry without strong yield
    if components.value_c > 0.6:
        return "Value Opportunity"
    return "Balanced"


def _confidence_from_components(c: OpportunityComponents, demand_c: float) -> float:
    """Map component spread into a 0-1 confidence proxy.

    Strong, mutually-reinforcing components → higher confidence.
    Single dominant component or near-tie → lower confidence.
    """
    vals = [c.yield_c, c.appr_c, c.value_c, c.demand_c, c.risk_c]
    avg = sum(vals) / len(vals)
    # Dispersion (lower = more uniform → higher confidence)
    spread = sum(abs(v - avg) for v in vals) / len(vals)
    base = 0.55 + 0.45 * (1.0 - min(0.5, spread) / 0.5)
    # Bonus for high average
    base += 0.10 * max(0.0, avg - 0.5)
    return round(_clamp(base, 0.0, 0.99), 2)


def _build_why_risks_bestfor_strategy(
    *,
    area_name: str,
    opp_type: str,
    components: OpportunityComponents,
    rental_yield: float,
    appreciation_1y: Optional[float],
    price_per_sqft: float,
    cohort_median_price: float,
    risk_score: Optional[float],
    demand_score: Optional[float],
    occupancy_rate: Optional[float],
    transaction_volume: Optional[int],
) -> tuple[list[str], list[str], str, str]:
    """Rules-based explanation. Used as fallback when LLM unavailable."""
    appr = float(appreciation_1y) if appreciation_1y is not None else 0.0
    risk = float(risk_score) if risk_score is not None else 5.0
    vol = int(transaction_volume or 0)
    occ = float(occupancy_rate) if occupancy_rate is not None else 85.0

    yield_edge = float(rental_yield) - 6.5  # UAE benchmark yield
    discount_pct = (
        (float(cohort_median_price) - float(price_per_sqft)) / float(cohort_median_price) * 100.0
        if cohort_median_price
        else 0.0
    )

    why: list[str] = []
    if yield_edge > 0.5:
        why.append(
            f"Rental yield {float(rental_yield):.2f}% sits {yield_edge:+.1f}pp above the UAE benchmark of 6.5%."
        )
    if appr > 6.0:
        why.append(
            f"1Y appreciation {appr:+.1f}% beats the UAE average of ~6% YoY."
        )
    if discount_pct > 10:
        why.append(
            f"AED/sqft trades at a {discount_pct:.0f}% discount to the cohort median."
        )
    if vol >= 500:
        why.append(
            f"Healthy liquidity: {vol:,} transactions in the latest snapshot."
        )
    if not why:
        why.append("Metrics broadly track the UAE average — no standout edge.")

    risks: list[str] = []
    if risk >= 6.5:
        risks.append(
            f"Risk score {risk:.1f}/10 — historically higher volatility; size positions accordingly."
        )
    if vol < 200:
        risks.append(
            f"Thin liquidity ({vol:,} tx) — exit timing matters."
        )
    if appr < 0:
        risks.append(
            f"1Y appreciation is negative ({appr:+.2f}%) — confirm trend reversal before entry."
        )
    if discount_pct < -10:
        risks.append(
            f"Premium pricing ({-discount_pct:.0f}% above cohort) — growth may already be priced in."
        )
    if not risks:
        risks.append(
            "Standard market risk applies. Supply pipeline and macro liquidity remain monitor-worthy."
        )

    # Best-for + strategy per type
    best_for, strategy = {
        "Premium Hold": (
            "Conservative capital seeking blue-chip exposure with stable cash flow.",
            "Long-hold core position. Acquire on dips; expect modest yield with capital preservation.",
        ),
        "Growth Opportunity": (
            "Growth-oriented investors comfortable with cyclical exposure.",
            "Multi-year hold targeting capital appreciation. Stagger entry across handover phases.",
        ),
        "Speculative": (
            "Opportunistic capital with high conviction and longer hold horizon.",
            "Position-size carefully. Strong stop-loss discipline. Best in off-plan / early-cycle phases.",
        ),
        "Income Opportunity": (
            "Rental-income investors prioritizing cash flow and yield.",
            "Buy-to-let with active management. Target studios/1-beds for top-quartile gross yield.",
        ),
        "Value Opportunity": (
            "Value investors seeking discounted entry with margin of safety.",
            "Wait for clear catalyst (infrastructure, supply absorption) before scaling exposure.",
        ),
        "Balanced": (
            "Diversified portfolios using this area for breadth, not concentration.",
            "Use as portfolio diversifier. Size at 5-10% of total allocation.",
        ),
    }[opp_type]

    return why, risks, best_for, strategy


def attach_nearby(reports: list[OpportunityReport], areas_by_id: dict, k: int = 3) -> None:
    """Mutates each report's nearby_comparison with k closest peers by haversine."""
    coords = [
        (r.area_id, areas_by_id[r.area_id], r)
        for r in reports
        if r.area_id in areas_by_id
        and areas_by_id[r.area_id].latitude is not None
        and areas_by_id[r.area_id].longitude is not None
    ]
    for r in reports:
        target = areas_by_id.get(r.area_id)
        if target is None or target.latitude is None or target.longitude is None:
            continue
        cands = []
        for other_id, other_area, other_report in coords:
            if other_id == r.area_id:
                continue
            d = haversine_km(
                target.latitude, target.longitude,
                other_area.latitude, other_area.longitude,
            )
            cands.append((d, other_report))
        cands.sort(key=lambda x: x[0])
        r.nearby_comparison = [
            NearbyArea(
                area_id=o.area_id,
                area_name=o.area_name,
                distance_km=round(d, 2),
                opportunity_score=o.opportunity_score,
                opportunity_type=o.opportunity_type,
                price_per_sqft=o.key_metrics.price_per_sqft,
                rental_yield=o.key_metrics.rental_yield,
            )
            for d, o in cands[:k]
        ]


def report_to_dict(r: OpportunityReport) -> dict:
    return {
        "area_id": r.area_id,
        "area_name": r.area_name,
        "area_name_arabic": r.area_name_arabic,
        "area_type": r.area_type,
        "opportunity_score": r.opportunity_score,
        "opportunity_type": r.opportunity_type,
        "confidence_level": r.confidence_level,
        "components": {
            "yield": round(r.components.yield_c, 3),
            "appreciation": round(r.components.appr_c, 3),
            "value": round(r.components.value_c, 3),
            "demand": round(r.components.demand_c, 3),
            "risk": round(r.components.risk_c, 3),
        },
        "key_metrics": {
            "rental_yield": r.key_metrics.rental_yield,
            "price_per_sqft": r.key_metrics.price_per_sqft,
            "appreciation_1y": r.key_metrics.appreciation_1y,
            "appreciation_3y": r.key_metrics.appreciation_3y,
            "investment_score": r.key_metrics.investment_score,
            "risk_score": r.key_metrics.risk_score,
            "demand_score": r.key_metrics.demand_score,
            "transaction_volume": r.key_metrics.transaction_volume,
            "occupancy_rate": r.key_metrics.occupancy_rate,
        },
        "why": r.why,
        "risks": r.risks,
        "best_for": r.best_for,
        "strategy": r.strategy,
        "nearby_comparison": [
            {
                "area_id": n.area_id,
                "area_name": n.area_name,
                "distance_km": n.distance_km,
                "opportunity_score": n.opportunity_score,
                "opportunity_type": n.opportunity_type,
                "price_per_sqft": n.price_per_sqft,
                "rental_yield": n.rental_yield,
            }
            for n in r.nearby_comparison
        ],
        "snapshot_date": r.snapshot_date,
        "last_updated": r.last_updated,
    }


# =============================================================================
# DLD-native scoring (Phase 1 — World B retired).
#
# The legacy path above scored the 70 curated areas off `market_snapshots`,
# whose appreciation/risk/demand/occupancy columns were NULL (→ hardcoded
# fallbacks of 0/5.0/0.85) or seeded ("Aggregated public sources Q1 2026").
# Everything below scores the real DLD universe (~230 areas with a median
# price + meaningful activity) entirely from `dld_area_metrics` +
# `dld_area_appreciation` + `dld_price_history.offplan_pct`. No synthetic
# fills: a component whose source data is genuinely absent is DROPPED and the
# remaining weights are renormalized, so every number traces to DLD.
#   - yield       → dld_area_metrics.rental_yield_pct (≥30 sales & ≥30 rents, capped)
#   - appreciation→ dld_area_appreciation.appreciation_1y_pct
#   - value       → median price vs cohort (Dubai) median
#   - demand      → dld_area_metrics.sales_count + rent_count_2026 (real volume)
#   - risk        → dld_price_history.offplan_pct (supply pipeline) + liquidity
# =============================================================================

UAE_BENCHMARK_YIELD = 6.5


@dataclass
class DldAreaInput:
    area_id: str
    area_name: str
    area_name_arabic: Optional[str]
    area_type: str
    latitude: Optional[float]
    longitude: Optional[float]
    rental_yield: Optional[float]     # gated + capped, or None
    price_per_sqft: Optional[float]   # median ppsf (2026 YTD)
    appreciation_1y: Optional[float]  # real, or None
    appreciation_3y: Optional[float]
    sales_count: int
    rent_count: int
    offplan_pct: Optional[float]      # latest year, or None


def _derive_demand(sales: int, rents: int) -> float:
    """0..1 liquidity/demand from real DLD transaction + rent-contract volume."""
    d_sales = min(1.0, sales / 1000.0)
    d_rents = min(1.0, rents / 3000.0)
    return _clamp(0.5 * d_sales + 0.5 * d_rents)


def _derive_risk(offplan_pct: float, sales: int) -> float:
    """0..1 risk from real DLD signals: off-plan supply share + thin liquidity.

    Higher off-plan share = more handover/supply pressure; thinner liquidity =
    harder exit. Caller only invokes this when off-plan data exists — there is
    no neutral default, and an area with no supply signal simply drops the risk
    component (renormalized) rather than being scored as "zero risk".
    """
    r_liq = 1.0 - min(1.0, sales / 300.0)
    r_supply = _clamp(float(offplan_pct) / 100.0)
    return _clamp(0.6 * r_supply + 0.4 * r_liq)


def build_report_dld(inp: DldAreaInput, cohort_median_price: float) -> OpportunityReport:
    """Score one area from real DLD inputs, renormalizing over present components."""
    # --- components (None where the real source is absent) ---
    yield_c = _clamp((float(inp.rental_yield) - 3.0) / 7.0) if inp.rental_yield is not None else None
    appr_c = _clamp((float(inp.appreciation_1y) + 5.0) / 25.0) if inp.appreciation_1y is not None else None
    value_c = (
        _clamp((cohort_median_price - float(inp.price_per_sqft)) / cohort_median_price + 0.5)
        if cohort_median_price and inp.price_per_sqft is not None
        else None
    )
    demand01 = _derive_demand(inp.sales_count, inp.rent_count)
    # Risk is real only when off-plan supply data exists (the user-specified
    # source). No supply signal → drop the risk component (renormalized);
    # never fabricate a neutral 5.0 or a misleading "zero risk".
    if inp.offplan_pct is not None:
        risk01 = _derive_risk(inp.offplan_pct, inp.sales_count)
        risk_c = _clamp(1.0 - risk01)
        risk_score = round(10.0 * risk01, 1)
    else:
        risk01 = None
        risk_c = None
        risk_score = None

    present: dict[str, float] = {"demand": demand01}
    if value_c is not None:
        present["value"] = value_c
    if yield_c is not None:
        present["yield"] = yield_c
    if appr_c is not None:
        present["appreciation"] = appr_c
    if risk_c is not None:
        present["risk"] = risk_c

    total_w = sum(COMPONENT_WEIGHTS[k] for k in present) or 1.0
    raw = 100.0 * sum(COMPONENT_WEIGHTS[k] * present[k] for k in present) / total_w
    score = int(round(_clamp(raw, 0.0, 100.0)))

    components = OpportunityComponents(
        yield_c=yield_c if yield_c is not None else 0.0,
        appr_c=appr_c if appr_c is not None else 0.0,
        value_c=value_c if value_c is not None else 0.0,
        demand_c=demand01,
        risk_c=risk_c if risk_c is not None else 0.0,
    )

    demand_score = round(10.0 * demand01, 1)

    opp_type = classify_type(
        score=score,
        rental_yield=float(inp.rental_yield) if inp.rental_yield is not None else 0.0,
        appreciation_1y=inp.appreciation_1y,
        components=components,
        demand_score=demand_score,
        risk_score=risk_score,
    )

    # confidence: data completeness (how much of the 1.0 weight was real) +
    # sample size. No synthetic component contributes.
    completeness = total_w  # 0..1 (weights sum to 1.0 when all present)
    sample = min(1.0, (inp.sales_count + inp.rent_count) / 1000.0)
    confidence = round(_clamp(0.40 + 0.40 * completeness + 0.20 * sample, 0.0, 0.99), 2)

    why, risks, best_for, strategy = _build_why_risks_bestfor_strategy(
        area_name=inp.area_name,
        opp_type=opp_type,
        components=components,
        rental_yield=float(inp.rental_yield) if inp.rental_yield is not None else 0.0,
        appreciation_1y=inp.appreciation_1y,
        price_per_sqft=float(inp.price_per_sqft) if inp.price_per_sqft is not None else 0.0,
        cohort_median_price=cohort_median_price,
        risk_score=risk_score,
        demand_score=demand_score,
        occupancy_rate=None,
        transaction_volume=inp.sales_count,
    )
    if inp.offplan_pct is not None and float(inp.offplan_pct) >= 60.0:
        risks.append(
            f"High off-plan share ({float(inp.offplan_pct):.0f}%) — handover supply "
            f"could pressure rents/prices over the next 24 months."
        )

    return OpportunityReport(
        area_id=inp.area_id,
        area_name=inp.area_name,
        area_name_arabic=inp.area_name_arabic,
        area_type=inp.area_type,
        opportunity_score=score,
        opportunity_type=opp_type,
        confidence_level=confidence,
        components=components,
        key_metrics=KeyMetrics(
            rental_yield=float(inp.rental_yield) if inp.rental_yield is not None else None,
            price_per_sqft=float(inp.price_per_sqft) if inp.price_per_sqft is not None else None,
            appreciation_1y=inp.appreciation_1y,
            appreciation_3y=inp.appreciation_3y,
            investment_score=round(score / 10.0, 1),
            risk_score=risk_score,
            demand_score=demand_score,
            transaction_volume=inp.sales_count,
            occupancy_rate=None,
        ),
        why=why,
        risks=risks,
        best_for=best_for,
        strategy=strategy,
        snapshot_date="2026-06-01",
        last_updated=datetime.now(timezone.utc).isoformat(),
    )
