"""Rules-based AI advisor.

Scores each area against the user's goal/risk preference and returns the top 3.
No LLM calls — deterministic scoring.
"""
from typing import List, Tuple
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


def score_area(
    snapshot: dict,
    goal: str,
    risk: str,
    budget: float,
) -> Tuple[float, List[str]]:
    """Score one area; return (score 0-100, reasoning bullets)."""
    yield_w, apprec_w, invest_w, risk_w = GOAL_WEIGHTS[goal]
    risk_cap = RISK_CAPS[risk]

    yield_norm = _normalize(snapshot["rental_yield"], 4.0, 10.0)
    apprec_norm = _normalize(snapshot.get("appreciation_1y") or 0, 3.0, 14.0)
    invest_norm = _normalize(snapshot.get("investment_score") or 7.0, 6.0, 10.0)
    risk_score_val = snapshot.get("risk_score") or 5.0

    # Risk penalty (higher risk = lower score)
    risk_penalty = _normalize(risk_score_val, 0, 10)

    raw = (
        yield_w * yield_norm
        + apprec_w * apprec_norm
        + invest_w * invest_norm
        - risk_w * risk_penalty
    )
    # Hard filter: if risk exceeds cap, heavy penalty
    if risk_score_val > risk_cap:
        raw -= 0.25

    score = round(max(0, min(1, raw + 0.25)) * 100, 1)  # shift to 0-100 range

    # Build reasoning
    reasoning = []
    if snapshot["rental_yield"] >= 7.5:
        reasoning.append(f"Strong rental yield of {snapshot['rental_yield']:.1f}% — top-tier income")
    elif snapshot["rental_yield"] >= 6:
        reasoning.append(f"Solid rental yield of {snapshot['rental_yield']:.1f}%")
    else:
        reasoning.append(f"Modest rental yield of {snapshot['rental_yield']:.1f}% — appreciation play")

    if snapshot.get("appreciation_1y", 0) >= 10:
        reasoning.append(f"Strong 1y appreciation of {snapshot['appreciation_1y']:.1f}%")
    elif snapshot.get("appreciation_1y", 0) >= 7:
        reasoning.append(f"Healthy 1y appreciation of {snapshot['appreciation_1y']:.1f}%")

    if risk_score_val <= 4:
        reasoning.append(f"Low risk profile (score {risk_score_val:.1f}/10)")
    elif risk_score_val > risk_cap:
        reasoning.append(f"Risk score {risk_score_val:.1f}/10 exceeds your '{risk}' tolerance")

    # Affordability
    affordable_sqft = budget / snapshot["avg_price_per_sqft"]
    if affordable_sqft < 400:
        reasoning.append(f"Budget covers ~{affordable_sqft:.0f} sqft — small unit only")
    elif affordable_sqft >= 1000:
        reasoning.append(f"Budget comfortably affords ~{affordable_sqft:.0f} sqft")

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
        )
        for i, item in enumerate(top)
    ]

    return AdvisorQueryResponse(
        goal=request.goal,
        risk=request.risk,
        budget_aed=request.budget_aed,
        recommendations=recommendations,
    )
