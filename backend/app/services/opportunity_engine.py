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
from statistics import median
from typing import Optional

from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot


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
    rental_yield: float
    price_per_sqft: float
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


def build_report(
    *,
    area: Area,
    latest: MarketSnapshot,
    history: list[MarketSnapshot],
    cohort_median_price: float,
) -> OpportunityReport:
    """Score one area against the cohort. Caller provides median for value component."""
    components = compute_components(
        rental_yield=float(latest.rental_yield),
        appreciation_1y=float(latest.appreciation_1y) if latest.appreciation_1y else None,
        price_per_sqft=float(latest.avg_price_per_sqft),
        cohort_median_price=cohort_median_price,
        occupancy_rate=float(latest.occupancy_rate) if latest.occupancy_rate else None,
        transaction_volume=latest.transaction_volume,
        risk_score=float(latest.risk_score) if latest.risk_score else None,
    )
    score = score_from_components(components)
    opp_type = classify_type(
        score=score,
        rental_yield=float(latest.rental_yield),
        appreciation_1y=float(latest.appreciation_1y) if latest.appreciation_1y else None,
        components=components,
        demand_score=float(latest.demand_score) if latest.demand_score else None,
        risk_score=float(latest.risk_score) if latest.risk_score else None,
    )
    confidence = _confidence_from_components(components, components.demand_c)

    why, risks, best_for, strategy = _build_why_risks_bestfor_strategy(
        area_name=area.name,
        opp_type=opp_type,
        components=components,
        rental_yield=float(latest.rental_yield),
        appreciation_1y=float(latest.appreciation_1y) if latest.appreciation_1y else None,
        price_per_sqft=float(latest.avg_price_per_sqft),
        cohort_median_price=cohort_median_price,
        risk_score=float(latest.risk_score) if latest.risk_score else None,
        demand_score=float(latest.demand_score) if latest.demand_score else None,
        occupancy_rate=float(latest.occupancy_rate) if latest.occupancy_rate else None,
        transaction_volume=latest.transaction_volume,
    )

    return OpportunityReport(
        area_id=str(area.id),
        area_name=area.name,
        area_name_arabic=area.name_arabic,
        area_type=area.area_type,
        opportunity_score=score,
        opportunity_type=opp_type,
        confidence_level=confidence,
        components=components,
        key_metrics=KeyMetrics(
            rental_yield=float(latest.rental_yield),
            price_per_sqft=float(latest.avg_price_per_sqft),
            appreciation_1y=float(latest.appreciation_1y) if latest.appreciation_1y else None,
            appreciation_3y=float(latest.appreciation_3y) if latest.appreciation_3y else None,
            investment_score=float(latest.investment_score) if latest.investment_score else None,
            risk_score=float(latest.risk_score) if latest.risk_score else None,
            demand_score=float(latest.demand_score) if latest.demand_score else None,
            transaction_volume=latest.transaction_volume,
            occupancy_rate=float(latest.occupancy_rate) if latest.occupancy_rate else None,
        ),
        why=why,
        risks=risks,
        best_for=best_for,
        strategy=strategy,
        snapshot_date=latest.snapshot_date.isoformat(),
        last_updated=datetime.now(timezone.utc).isoformat(),
    )


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


def compute_cohort_median(snapshots: list[MarketSnapshot]) -> float:
    prices = [float(s.avg_price_per_sqft) for s in snapshots]
    if not prices:
        return 1500.0
    return float(median(prices))
