"""Scoring for broker-submitted ``InvestmentOpportunity`` rows.

Distinct from ``opportunity_engine`` (which scores areas). Deal scoring uses
a parallel formula tuned for unit-level submissions: yield comes from the
broker's expected gross yield, value-entry from comparing the deal's
price-per-sqft to the area / cohort median, area context borrows the
existing ``investment_score`` from the matched area's latest snapshot.

Weights (per Phase 4 spec)::

    yield 30  | value 25  | area 25  | confidence 10  | risk 10

Score = 100 * sum(weight_i * component_i), with each component in [0, 1].
Returns a plain-language explanation alongside the score.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from statistics import median
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.area import Area
from app.models.investment_opportunity import InvestmentOpportunity


WEIGHTS = {
    "yield": 0.30,
    "value": 0.25,
    "area": 0.25,
    "confidence": 0.10,
    "risk": 0.10,
}


@dataclass
class AreaContext:
    """Market context used to score a single deal.

    ``area_pps`` / ``area_investment_score`` come from the matched area's latest
    snapshot (``None`` when no area matches). ``cohort_median_pps`` is the
    median latest-PPS across all tracked areas — used as a fallback baseline.
    """

    cohort_median_pps: float
    area_pps: Optional[float] = None
    area_investment_score: Optional[float] = None
    area_momentum: Optional[float] = None  # appreciation_1y proxy, 0–1
    matched_area_name: Optional[str] = None


@dataclass
class DealScore:
    score: float  # 0–100
    explanation: str
    components: dict[str, float] = field(default_factory=dict)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


RISK_TO_COMPONENT = {"low": 1.0, "medium": 0.5, "high": 0.0}


def score_deal(deal: InvestmentOpportunity, ctx: AreaContext) -> DealScore:
    """Compute the 0–100 opportunity score for a broker-submitted deal."""
    # ---- yield (30%) ----
    # 3% -> 0, 10% -> 1. Same anchor points as opportunity_engine.
    if deal.expected_gross_yield is not None:
        yield_c = _clamp((float(deal.expected_gross_yield) - 3.0) / 7.0)
    else:
        yield_c = 0.5  # neutral when broker omitted yield

    # ---- value entry (25%) ----
    # Compare deal PPS to area PPS (preferred) or cohort median (fallback).
    baseline = ctx.area_pps or ctx.cohort_median_pps
    if deal.price_per_sqft and baseline > 0:
        ratio = float(deal.price_per_sqft) / baseline
        # 0.6x baseline -> 1.0, 1.0x baseline -> 0.5, 1.4x baseline -> 0.0
        value_c = _clamp(1.0 - (ratio - 0.6) / 0.8)
    else:
        value_c = 0.5

    # ---- area quality (25%) ----
    if ctx.area_investment_score is not None:
        area_c = _clamp(float(ctx.area_investment_score) / 100.0)
        if ctx.area_momentum is not None:
            # Lift area component slightly by momentum (cap 1.0).
            area_c = _clamp(area_c * 0.85 + float(ctx.area_momentum) * 0.15)
    else:
        area_c = 0.5

    # ---- confidence (10%) ----
    if deal.confidence_score is not None:
        conf_c = _clamp(float(deal.confidence_score) / 100.0)
    else:
        conf_c = 0.6  # default to slight optimism when broker didn't self-rate

    # ---- risk adjustment (10%) ----
    risk_c = RISK_TO_COMPONENT.get(deal.risk_level, 0.5)

    score = 100.0 * (
        WEIGHTS["yield"] * yield_c
        + WEIGHTS["value"] * value_c
        + WEIGHTS["area"] * area_c
        + WEIGHTS["confidence"] * conf_c
        + WEIGHTS["risk"] * risk_c
    )

    return DealScore(
        score=round(score, 1),
        explanation=_explain(yield_c, value_c, area_c, risk_c, score, ctx),
        components={
            "yield": round(yield_c, 3),
            "value": round(value_c, 3),
            "area": round(area_c, 3),
            "confidence": round(conf_c, 3),
            "risk": round(risk_c, 3),
        },
    )


def _explain(
    yield_c: float,
    value_c: float,
    area_c: float,
    risk_c: float,
    score: float,
    ctx: AreaContext,
) -> str:
    band = "high" if score >= 70 else "moderate" if score >= 50 else "low"
    reasons: list[str] = []
    if yield_c > 0.7:
        reasons.append("expected yield is above area average")
    elif yield_c < 0.3:
        reasons.append("expected yield is below typical for the area")
    if value_c > 0.7:
        anchor = (
            f"the matched area in {ctx.matched_area_name}"
            if ctx.matched_area_name
            else "comparable districts"
        )
        reasons.append(f"entry price is below {anchor}")
    elif value_c < 0.3:
        reasons.append("entry price is above comparable districts")
    if area_c > 0.7:
        reasons.append("the matched area scores strongly on investment fundamentals")
    if risk_c > 0.7:
        reasons.append("risk is rated low")
    elif risk_c < 0.3:
        reasons.append("risk is rated high")

    if not reasons:
        return (
            f"This opportunity scores {band} ({score:.0f}/100) because its "
            "yield, value, area quality and risk balance around the cohort norm."
        )
    return (
        f"This opportunity scores {band} ({score:.0f}/100) because "
        + " and ".join(reasons)
        + "."
    )


async def load_area_context(db: AsyncSession, area_name: str) -> AreaContext:
    """Build an ``AreaContext`` for the supplied free-text area name.

    Falls back gracefully when the broker types an area name that doesn't
    match any tracked Floxcy area.
    """
    # Match areas (case-insensitive). Try exact first, then substring.
    res = await db.execute(select(Area).where(Area.name.ilike(area_name)))
    area = res.scalar_one_or_none()
    if area is None:
        res = await db.execute(
            select(Area).where(Area.name.ilike(f"%{area_name}%")).limit(1)
        )
        area = res.scalar_one_or_none()

    # Cohort median PPS — Dubai-wide median of real DLD area median-ppsf
    # (World B retired; no more seeded snapshots).
    from app.models.dld import DldAreaMetrics
    from app.api.routes.opportunities import (
        _load_universe_dld, _score_all_dld, _resolve_dld_area_id,
    )
    prices = (
        await db.execute(
            select(DldAreaMetrics.median_price_per_sqft).where(
                DldAreaMetrics.period == "2026-ytd",
                DldAreaMetrics.median_price_per_sqft.isnot(None),
            )
        )
    ).scalars().all()
    cohort_median = float(median([float(p) for p in prices])) if prices else 1500.0

    area_pps: Optional[float] = None
    area_investment_score: Optional[float] = None
    area_momentum: Optional[float] = None
    if area is not None:
        dld_id = await _resolve_dld_area_id(db, area.id)
        if dld_id:
            reps = {r.area_id: r for r in _score_all_dld(await _load_universe_dld(db))}
            rep = reps.get(dld_id)
            if rep:
                area_pps = rep.key_metrics.price_per_sqft
                area_investment_score = rep.key_metrics.investment_score
                if rep.key_metrics.appreciation_1y is not None:
                    appr = float(rep.key_metrics.appreciation_1y)
                    area_momentum = max(0.0, min(1.0, (appr + 5.0) / 25.0))

    return AreaContext(
        cohort_median_pps=cohort_median,
        area_pps=area_pps,
        area_investment_score=area_investment_score,
        area_momentum=area_momentum,
        matched_area_name=area.name if area else None,
    )


async def score_and_apply(
    db: AsyncSession, deal: InvestmentOpportunity
) -> DealScore:
    """Convenience: compute and persist score + explanation on the deal row."""
    ctx = await load_area_context(db, deal.area)
    result = score_deal(deal, ctx)
    deal.opportunity_score = result.score
    # Store explanation in why_opportunity if broker left it blank (rare; the
    # API requires it). More commonly we just persist the score.
    return result
