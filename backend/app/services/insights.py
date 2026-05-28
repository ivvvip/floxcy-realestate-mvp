"""LLM-backed narrative insights.

Two surfaces today:
  * area_explanation(area, undervaluation) — short markdown explainer for a
    single area's opportunity profile. Lazy-cached per area for 24h.

P2 will add market_brief() and trends() in this module.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Optional

from app.config import settings
from app.redis_client import redis_client
from app.services.openrouter_service import chat as openrouter_chat


logger = logging.getLogger("floxcy.insights")


AREA_EXPLAIN_TTL_S = 24 * 3600


AREA_EXPLAIN_SYSTEM = """You are Floxcy's UAE real-estate analyst.

You produce concise, evidence-grounded explanations of why a specific area
has its current undervaluation score. Audience: property investors. Tone:
institutional, calm, never hyped.

OPERATING RULES
- ≤180 words total. Markdown only.
- Cite specific numbers from the data passed in the user message.
- Lead with the headline (one sentence), then briefly explain WHY it scores
  the way it does, then ONE sentence flagging the most material risk.
- Do not invent figures. Do not recommend buying or selling.
- End with a single disclaimer line.

OUTPUT FORMAT (markdown — exactly these sections, in order)

**Why this score**
1–2 sentences interpreting the score. Cite at least 2 numbers from the data.

**Material driver**
The single strongest reason (yield premium / discount / momentum / etc.)
with the actual number.

**Watch this risk**
The single biggest risk to monitor.

_Not investment advice. Generated from public-source market data._
"""


def _cache_key(area_id: str, score: int, tier: str) -> str:
    # Score+tier in the key so explanations invalidate if the data changes
    # materially between days.
    blob = f"{area_id}|{score}|{tier}".encode()
    return "ai:area_explain:" + hashlib.sha256(blob).hexdigest()


async def area_explanation(
    *,
    area_id: str,
    area_name: str,
    score: int,
    tier: str,
    rental_yield: float,
    price_per_sqft: float,
    appreciation_1y: float | None,
    risk_score: float | None,
    demand_score: float | None,
    transaction_volume: int | None,
    cohort_yield_median: float,
    cohort_price_median: float,
    reasons: list[str],
    risks: list[str],
) -> Optional[dict]:
    """Return {markdown, model, tokens, cached, latency_ms} or None on error."""
    if not settings.OPENROUTER_API_KEY:
        return None

    ck = _cache_key(area_id, score, tier)
    try:
        cached_blob = await redis_client.get(ck)
    except Exception:
        cached_blob = None
    if cached_blob:
        try:
            payload = json.loads(cached_blob)
            payload["cached"] = True
            return payload
        except Exception:
            pass

    user_msg = (
        f"Area: {area_name}\n"
        f"Undervaluation score: {score}/100 (tier: {tier})\n"
        f"Latest rental yield: {rental_yield:.2f}%\n"
        f"Price per sqft: AED {price_per_sqft:,.0f}\n"
        f"1Y appreciation: "
        f"{(appreciation_1y if appreciation_1y is not None else 0):.2f}%\n"
        f"Risk score: "
        f"{(risk_score if risk_score is not None else 0):.1f}/10 (lower is safer)\n"
        f"Demand score: "
        f"{(demand_score if demand_score is not None else 0):.1f}/10\n"
        f"Transaction volume (latest snapshot): "
        f"{transaction_volume or 0}\n"
        f"Cohort median yield: {cohort_yield_median:.2f}%\n"
        f"Cohort median AED/sqft: {cohort_price_median:,.0f}\n"
        f"\n"
        f"Rules-derived drivers: " + " | ".join(reasons) + "\n"
        f"Rules-derived risks: " + " | ".join(risks) + "\n"
    )

    result = await openrouter_chat(
        system=AREA_EXPLAIN_SYSTEM,
        user=user_msg,
        max_tokens=400,
        temperature=0.2,
    )
    if not result.ok:
        return None

    payload = {
        "markdown": result.content,
        "model": result.model,
        "tokens": result.total_tokens,
        "cost_usd": result.cost_usd,
        "latency_ms": result.latency_ms,
        "fallback_used": result.fallback_used,
        "cached": False,
    }
    try:
        await redis_client.setex(ck, AREA_EXPLAIN_TTL_S, json.dumps(payload))
    except Exception:
        pass
    return payload
