"""Rules-based AI advisor.

Scores each area against the user's goal/risk preference and returns the top 3.
No LLM calls — deterministic scoring.

The score blends curated MarketSnapshot signals with DLD-grounded facts
(`gross_yield_pct`, `rent_growth_yoy_pct`, `appreciation_5y_pct`,
`supply_risk`) whenever they're present on the snapshot dict. The
reasoning bullets always prefer DLD numbers with explicit attribution
("DLD Ejari", "DLD sales 2021→2026") over generic phrasings — that's the
whole point of this rewire: replace vague summaries with cited facts.
"""
from typing import List, Optional, Tuple
from app.schemas.advisor import (
    AdvisorQueryRequest,
    AdvisorQueryResponse,
    AdvisorRecommendation,
)


# Risk tolerance -> max acceptable risk_score (0-10 scale, higher = riskier)
RISK_CAPS = {"low": 4.5, "med": 6.5, "high": 10.0}

# Goal weights (yield, appreciation, investment_score, risk_penalty)
GOAL_WEIGHTS = {
    "yield":        (0.55, 0.15, 0.20, 0.10),
    "appreciation": (0.15, 0.55, 0.20, 0.10),
    "balanced":     (0.30, 0.30, 0.30, 0.10),
}


def _normalize(value: float, lo: float, hi: float) -> float:
    if hi == lo:
        return 0.0
    return max(0.0, min(1.0, (value - lo) / (hi - lo)))


def classify_supply_risk(offplan_pct: Optional[float]) -> Optional[str]:
    """Off-plan share → supply pressure bucket.

    A high off-plan share in the latest year's sales means a large pipeline
    of units will hand over in the next 2-3 years, which typically softens
    rents and dilutes price growth as inventory floods the market.
    """
    if offplan_pct is None:
        return None
    if offplan_pct < 30:
        return "low"
    if offplan_pct < 60:
        return "medium"
    return "high"


def score_area(
    snapshot: dict,
    goal: str,
    risk: str,
    budget: float,
) -> Tuple[float, List[str]]:
    """Score one area; return (score 0-100, reasoning bullets cited to DLD)."""
    yield_w, apprec_w, invest_w, risk_w = GOAL_WEIGHTS[goal]
    risk_cap = RISK_CAPS[risk]

    # Prefer DLD signals when present.
    # gross_yield_pct is the same column as rental_yield (already capped at
    # the route layer) — we read both so older callers still work.
    yld = snapshot.get("gross_yield_pct") or snapshot["rental_yield"]
    # Prefer 5y CAGR over curated 1y appreciation when available — it's a
    # more stable signal and the user explicitly asked for the 5y view.
    cagr_5y = snapshot.get("cagr_5y_pct")
    apprec_1y = snapshot.get("appreciation_1y") or 0
    apprec_signal = cagr_5y if cagr_5y is not None else apprec_1y
    invest_signal = snapshot.get("investment_score") or 7.0
    risk_score_val = snapshot.get("risk_score") or 5.0

    yield_norm = _normalize(yld, 4.0, 10.0)
    # 5y CAGR norm range: 3% (weak) to 25% (top decile across Dubai)
    apprec_norm = _normalize(apprec_signal, 3.0, 25.0 if cagr_5y is not None else 14.0)
    invest_norm = _normalize(invest_signal, 6.0, 10.0)
    risk_penalty = _normalize(risk_score_val, 0, 10)

    raw = (
        yield_w * yield_norm
        + apprec_w * apprec_norm
        + invest_w * invest_norm
        - risk_w * risk_penalty
    )

    # Supply-risk modifier: HIGH off-plan share = downward rent pressure soon.
    # Heavier hit for yield-seekers (their income gets diluted) than for
    # growth investors (the new supply also signals confidence + demand).
    supply_risk = snapshot.get("supply_risk")
    if supply_risk == "high":
        raw -= 0.08 if goal == "yield" else 0.04
    elif supply_risk == "low":
        # Reward established, stable areas with limited new supply
        raw += 0.03 if goal == "yield" else 0.01

    # Rent-growth nudge: positive YoY rent growth is a strong leading
    # indicator for income strategies; negative growth is a real risk.
    rgrowth = snapshot.get("rent_growth_yoy_pct")
    if rgrowth is not None and goal != "appreciation":
        if rgrowth >= 8:
            raw += 0.05
        elif rgrowth <= -3:
            raw -= 0.05

    if risk_score_val > risk_cap:
        raw -= 0.25

    score = round(max(0, min(1, raw + 0.25)) * 100, 1)

    # ---- Reasoning bullets — specific facts with DLD attribution ----
    reasoning: List[str] = []

    # Yield bullet — always cite the underlying number + period
    if snapshot.get("gross_yield_pct") is not None:
        reasoning.append(
            f"Gross yield {yld:.2f}% (DLD 2026 YTD: rent-per-sqft ÷ sale-ppsf)"
        )
    else:
        reasoning.append(f"Rental yield {yld:.2f}% (curated snapshot)")

    # Rent growth — only if we have the real DLD number
    if rgrowth is not None:
        direction = "up" if rgrowth >= 0 else "down"
        reasoning.append(
            f"Median rent {direction} {abs(rgrowth):+.1f}% YoY "
            f"(DLD Ejari, 2025→2026)"
        )

    # 5y appreciation — cite both cumulative and annualized
    apprec_5y = snapshot.get("appreciation_5y_pct")
    if apprec_5y is not None and cagr_5y is not None:
        latest = snapshot.get("dld_year_latest") or 2026
        reasoning.append(
            f"Sale ppsf {apprec_5y:+.1f}% over 5y "
            f"(CAGR {cagr_5y:+.1f}%, DLD 2021→{latest})"
        )
    elif apprec_1y >= 7:
        reasoning.append(f"1y appreciation {apprec_1y:+.1f}% (curated)")

    # Supply risk — explicit, cited
    if supply_risk:
        offplan = snapshot.get("supply_risk_offplan_pct")
        if offplan is not None:
            reasoning.append(
                f"Supply risk: {supply_risk.upper()} "
                f"({offplan:.0f}% of latest-year DLD sales were off-plan)"
            )

    # Risk score (curated; only mention if it matters to the user's tolerance)
    if risk_score_val <= 4:
        reasoning.append(f"Low curated risk score ({risk_score_val:.1f}/10)")
    elif risk_score_val > risk_cap:
        reasoning.append(
            f"Curated risk score {risk_score_val:.1f}/10 exceeds your "
            f"'{risk}' tolerance — flagged"
        )

    # Affordability — practical context
    affordable_sqft = budget / snapshot["avg_price_per_sqft"]
    if affordable_sqft < 400:
        reasoning.append(
            f"Budget covers ~{affordable_sqft:.0f} sqft at {snapshot['avg_price_per_sqft']:.0f} "
            f"AED/sqft — small unit only"
        )
    elif affordable_sqft >= 1000:
        reasoning.append(
            f"Budget comfortably affords ~{affordable_sqft:.0f} sqft at "
            f"{snapshot['avg_price_per_sqft']:.0f} AED/sqft"
        )

    return score, reasoning


def build_recommendations(
    request: AdvisorQueryRequest,
    area_snapshots: List[dict],
) -> AdvisorQueryResponse:
    """Score all areas and return top 3."""
    scored = []
    for snap in area_snapshots:
        score, reasoning = score_area(snap, request.goal, request.risk, request.budget_aed)
        affordable_sqft = round(request.budget_aed / snap["avg_price_per_sqft"], 0)
        scored.append({
            "snap": snap,
            "score": score,
            "reasoning": reasoning,
            "affordable_sqft": affordable_sqft,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:3]

    recommendations = [
        AdvisorRecommendation(
            rank=i + 1,
            area_id=str(item["snap"]["area_id"]),
            area_name=item["snap"]["area_name"],
            area_name_arabic=item["snap"].get("area_name_arabic"),
            score=item["score"],
            avg_price_per_sqft=item["snap"]["avg_price_per_sqft"],
            rental_yield=item["snap"]["rental_yield"],
            appreciation_1y=item["snap"].get("appreciation_1y"),
            risk_score=item["snap"].get("risk_score"),
            investment_score=item["snap"].get("investment_score"),
            estimated_affordable_sqft=item["affordable_sqft"],
            reasoning=item["reasoning"],
            # DLD-grounded signals — pass through to the API response
            gross_yield_pct=item["snap"].get("gross_yield_pct"),
            rent_growth_yoy_pct=item["snap"].get("rent_growth_yoy_pct"),
            appreciation_5y_pct=item["snap"].get("appreciation_5y_pct"),
            cagr_5y_pct=item["snap"].get("cagr_5y_pct"),
            supply_risk=item["snap"].get("supply_risk"),
            supply_risk_offplan_pct=item["snap"].get("supply_risk_offplan_pct"),
            dld_year_latest=item["snap"].get("dld_year_latest"),
        )
        for i, item in enumerate(top)
    ]

    return AdvisorQueryResponse(
        goal=request.goal,
        risk=request.risk,
        budget_aed=request.budget_aed,
        recommendations=recommendations,
    )
