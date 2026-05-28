"""LLM-backed narrative insights.

Surfaces:
  * area_explanation()        — markdown explainer for one area (P1)
  * structured_area_insight() — JSON-structured per-area insight (P2)
  * market_brief()            — 3-5 daily bullets across the market (P2)
  * compute_trends()          — top movers + LLM commentary (P2)

All LLM calls go through openrouter_service. Daily-refreshed surfaces are
cached in Redis with a TTL — first request after expiry triggers a fresh
generation (lazy cron pattern).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from app.config import settings
from app.redis_client import redis_client
from app.services.openrouter_service import chat as openrouter_chat


logger = logging.getLogger("floxcy.insights")


AREA_EXPLAIN_TTL_S = 24 * 3600
MARKET_BRIEF_TTL_S = 24 * 3600
AREA_INSIGHT_TTL_S = 24 * 3600
TRENDS_TTL_S = 24 * 3600


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


# ---------------------------------------------------------------------------
# P2: STRUCTURED AREA INSIGHT (JSON)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# P1B: STRUCTURED OPPORTUNITY EXPLANATION
# ---------------------------------------------------------------------------

OPPORTUNITY_EXPLAIN_SYSTEM = """You are Floxcy's UAE real-estate analyst.

You return STRICT JSON (no prose, no markdown fences) explaining an
investment opportunity. Audience: property investors. Tone: institutional.

OPERATING RULES
- Ground every sentence in the numbers passed in the user message. Never
  invent figures.
- 3-4 bullets for "why", 1-2 bullets for "risks", one short sentence each
  for "best_for" and "strategy".
- Output a single JSON object with EXACTLY these keys:
  {
    "why": ["bullet 1", "bullet 2", "bullet 3", ...],
    "risks": ["risk 1", "risk 2"],
    "best_for": "investor profile description (one sentence)",
    "strategy": "suggested investment strategy (one sentence)"
  }
- Do NOT include any wrapper, key, or comment outside that JSON.
- Maximum 150 words across all fields combined.
"""


async def opportunity_explanation(
    *,
    area_id: str,
    area_name: str,
    opportunity_score: int,
    opportunity_type: str,
    rental_yield: float,
    price_per_sqft: float,
    appreciation_1y: float | None,
    risk_score: float | None,
    demand_score: float | None,
    transaction_volume: int | None,
    cohort_median_price: float,
    why_rules: list[str],
    risks_rules: list[str],
) -> Optional[dict]:
    """Return structured JSON {why, risks, best_for, strategy, model, tokens, cached}.
    None on failure (caller should fall back to rules-based explanation)."""
    if not settings.OPENROUTER_API_KEY:
        return None

    blob = f"opp|{area_id}|{opportunity_score}|{opportunity_type}".encode()
    ck = "ai:opp_explain:" + hashlib.sha256(blob).hexdigest()
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
        f"Opportunity score: {opportunity_score}/100\n"
        f"Opportunity type: {opportunity_type}\n"
        f"Rental yield: {rental_yield:.2f}%\n"
        f"Price per sqft: AED {price_per_sqft:,.0f} "
        f"(cohort median: AED {cohort_median_price:,.0f})\n"
        f"1Y appreciation: "
        f"{(appreciation_1y if appreciation_1y is not None else 0):+.2f}%\n"
        f"Risk score: "
        f"{(risk_score if risk_score is not None else 5):.1f}/10 (lower is safer)\n"
        f"Demand score: "
        f"{(demand_score if demand_score is not None else 5):.1f}/10\n"
        f"Transaction volume (latest): {transaction_volume or 0}\n"
        f"\n"
        f"Rules-derived drivers: " + " | ".join(why_rules) + "\n"
        f"Rules-derived risks: " + " | ".join(risks_rules) + "\n"
    )

    result = await openrouter_chat(
        system=OPPORTUNITY_EXPLAIN_SYSTEM,
        user=user_msg,
        max_tokens=400,
        temperature=0.2,
    )
    if not result.ok:
        return None
    parsed = _extract_json_block(result.content)
    if not parsed or not isinstance(parsed.get("why"), list):
        return None

    why = [str(x)[:200] for x in parsed.get("why", [])][:5]
    risks = [str(x)[:200] for x in parsed.get("risks", [])][:4]
    best_for = str(parsed.get("best_for") or "")[:200]
    strategy = str(parsed.get("strategy") or "")[:200]

    payload = {
        "why": why,
        "risks": risks,
        "best_for": best_for,
        "strategy": strategy,
        "model": result.model,
        "tokens": result.total_tokens,
        "latency_ms": result.latency_ms,
        "fallback_used": result.fallback_used,
        "cached": False,
    }
    try:
        await redis_client.setex(ck, AREA_EXPLAIN_TTL_S, json.dumps(payload))
    except Exception:
        pass
    return payload


AREA_INSIGHT_SYSTEM = """You are Floxcy's UAE real-estate analyst.

You return STRICT JSON (no prose, no markdown fences) describing a single
area's investment profile. Audience: property investors. Tone: institutional.

OPERATING RULES
- Ground every sentence in the numbers provided. Never invent figures.
- 2-3 sentences max per text field.
- Pick investor_profile from EXACTLY one of:
  "Income-focused" | "Growth-focused" | "Balanced" | "Speculative".
- Output a single JSON object with EXACTLY these keys, nothing else:
  {
    "opportunity_summary": "string (2-3 sentences)",
    "risk_summary": "string (1-2 sentences)",
    "investor_profile_recommendation": "Income-focused" | "Growth-focused" | "Balanced" | "Speculative",
    "trend_interpretation": "string (1-2 sentences about momentum/direction)"
  }
- Do not include any wrapper, key, or comment outside that JSON object.
"""


def _extract_json_block(s: str) -> Optional[dict]:
    """Best-effort: find the first valid JSON object in a string."""
    # Strip markdown fences if present
    s = re.sub(r"```(?:json)?\s*", "", s, flags=re.I).replace("```", "")
    # Find first { ... } block
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(s)):
        c = s[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                blob = s[start : i + 1]
                try:
                    return json.loads(blob)
                except json.JSONDecodeError:
                    return None
    return None


async def structured_area_insight(
    *,
    area_id: str,
    area_name: str,
    rental_yield: float,
    price_per_sqft: float,
    appreciation_1y: float | None,
    appreciation_3y: float | None,
    risk_score: float | None,
    demand_score: float | None,
    occupancy: float | None,
    transaction_volume: int | None,
    score: int,
    tier: str,
) -> Optional[dict]:
    """Return {opportunity_summary, risk_summary, investor_profile_recommendation,
    trend_interpretation, model, tokens, cached} or None on failure.

    JSON parsing is tolerant; if the LLM emits non-strict JSON we return None
    and the caller falls back to the markdown explainer."""
    if not settings.OPENROUTER_API_KEY:
        return None

    blob = f"{area_id}|{score}|{tier}".encode()
    ck = "ai:area_struct:" + hashlib.sha256(blob).hexdigest()
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
        f"{(appreciation_1y if appreciation_1y is not None else 0):+.2f}%\n"
        f"3Y appreciation: "
        f"{(appreciation_3y if appreciation_3y is not None else 0):+.2f}%\n"
        f"Risk score: "
        f"{(risk_score if risk_score is not None else 0):.1f}/10 (lower is safer)\n"
        f"Demand score: "
        f"{(demand_score if demand_score is not None else 0):.1f}/10\n"
        f"Occupancy: "
        f"{(occupancy if occupancy is not None else 0):.1f}%\n"
        f"Transaction volume (latest snapshot): {transaction_volume or 0}\n"
    )

    result = await openrouter_chat(
        system=AREA_INSIGHT_SYSTEM,
        user=user_msg,
        max_tokens=500,
        temperature=0.15,
    )
    if not result.ok:
        return None

    parsed = _extract_json_block(result.content)
    if not parsed:
        # Caller can fall back to markdown
        return None

    # Sanitize: keep only expected keys, validate investor profile
    valid_profiles = {"Income-focused", "Growth-focused", "Balanced", "Speculative"}
    profile = parsed.get("investor_profile_recommendation", "Balanced")
    if profile not in valid_profiles:
        profile = "Balanced"

    payload = {
        "opportunity_summary": (parsed.get("opportunity_summary") or "")[:600],
        "risk_summary": (parsed.get("risk_summary") or "")[:400],
        "investor_profile_recommendation": profile,
        "trend_interpretation": (parsed.get("trend_interpretation") or "")[:400],
        "model": result.model,
        "tokens": result.total_tokens,
        "latency_ms": result.latency_ms,
        "fallback_used": result.fallback_used,
        "cached": False,
    }
    try:
        await redis_client.setex(ck, AREA_INSIGHT_TTL_S, json.dumps(payload))
    except Exception:
        pass
    return payload


# ---------------------------------------------------------------------------
# P2: MARKET BRIEF (daily 3-5 bullets)
# ---------------------------------------------------------------------------

MARKET_BRIEF_SYSTEM = """You are Floxcy's UAE real-estate analyst writing
the daily Market Brief for institutional investors. You return STRICT JSON
(no prose, no markdown fences).

OPERATING RULES
- 3 to 5 bullets. Each is a self-contained insight grounded in the data
  passed in the user message.
- Each bullet has a short headline (<= 60 chars) and a 1-2 sentence body
  citing specific numbers (AED/sqft, yield %, score, change %).
- Prefer bullets that compare or surface change. Avoid generic statements.
- If a bullet is about a specific area, include "area_name" with that
  area's exact name (matching the data). If market-wide, omit area_name.

Output EXACTLY this JSON shape, nothing else:
{
  "brief": [
    {"headline": "string", "body": "string", "area_name": "string or null"},
    ...
  ]
}
"""


async def market_brief(
    *,
    avg_yield: float,
    avg_price_per_sqft: float,
    total_areas: int,
    top_opportunities: list[dict],  # [{name, score, tier, yield, price}]
    top_movers: list[dict],         # [{name, change_pct, metric}]
) -> Optional[dict]:
    """Daily Market Brief: 3-5 LLM-generated bullets. Cached 24h by UTC date."""
    if not settings.OPENROUTER_API_KEY:
        return None

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ck = f"ai:market_brief:{today}"
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

    lines: list[str] = []
    lines.append(f"As of: {today}")
    lines.append(f"Tracked areas: {total_areas}")
    lines.append(f"UAE avg rental yield: {avg_yield:.2f}%")
    lines.append(f"UAE avg AED/sqft: {avg_price_per_sqft:,.0f}")
    if top_opportunities:
        lines.append("")
        lines.append("Top opportunities (by undervaluation score):")
        for o in top_opportunities[:5]:
            lines.append(
                f"  {o['name']}: score {o['score']} ({o.get('tier','-')}) "
                f"· yield {o.get('yield',0):.2f}% · AED {o.get('price',0):,.0f}/sqft"
            )
    if top_movers:
        lines.append("")
        lines.append("Top movers (1Y appreciation):")
        for m in top_movers[:5]:
            lines.append(
                f"  {m['name']}: {m.get('metric','1Y app')} {m['change_pct']:+.2f}%"
            )
    user_msg = "\n".join(lines)

    result = await openrouter_chat(
        system=MARKET_BRIEF_SYSTEM,
        user=user_msg,
        max_tokens=700,
        temperature=0.25,
    )
    if not result.ok:
        return None

    parsed = _extract_json_block(result.content)
    if not parsed or not isinstance(parsed.get("brief"), list):
        return None

    # Clean each bullet
    clean: list[dict] = []
    for b in parsed["brief"][:5]:
        if not isinstance(b, dict):
            continue
        clean.append(
            {
                "headline": (b.get("headline") or "")[:80],
                "body": (b.get("body") or "")[:300],
                "area_name": b.get("area_name") or None,
            }
        )
    if not clean:
        return None

    payload = {
        "as_of": today,
        "brief": clean,
        "model": result.model,
        "tokens": result.total_tokens,
        "latency_ms": result.latency_ms,
        "fallback_used": result.fallback_used,
        "cached": False,
    }
    try:
        await redis_client.setex(ck, MARKET_BRIEF_TTL_S, json.dumps(payload))
    except Exception:
        pass
    return payload


# ---------------------------------------------------------------------------
# P2: TRENDS (data + optional LLM narrative)
# ---------------------------------------------------------------------------

TRENDS_NARRATIVE_SYSTEM = """You are Floxcy's UAE real-estate analyst.

Given today's top movers in price, yield, and volume, produce a 2-3
sentence neutral narrative interpreting the direction of the market.
Cite at least two numbers. Output plain text (no markdown).
"""


def _slope(values: list[float]) -> float:
    """Linear slope normalized to %/step over the series mean."""
    if len(values) < 2:
        return 0.0
    n = len(values)
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(values) / n
    num = sum((xs[i] - mx) * (values[i] - my) for i in range(n))
    den = sum((xs[i] - mx) ** 2 for i in range(n))
    if den == 0 or my == 0:
        return 0.0
    return (num / den / my) * 100


async def compute_trends(
    *,
    universe: list[dict],  # list of {area_id, name, history: [snapshots]}
) -> dict:
    """Compute top movers + LLM narrative. Cached 24h."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ck = f"ai:trends:{today}"
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

    # ---- Pure-data trend computation ----
    movers: list[dict] = []
    for u in universe:
        history = u.get("history") or []
        if len(history) < 2:
            continue
        prices = [float(s["avg_price_per_sqft"]) for s in history]
        yields = [float(s["rental_yield"]) for s in history]
        vols = [int(s.get("transaction_volume") or 0) for s in history]
        # Last vs 3-month-ago (or last vs first if shorter)
        idx_ago = max(0, len(prices) - 4)
        price_change = (
            ((prices[-1] - prices[idx_ago]) / prices[idx_ago] * 100)
            if prices[idx_ago]
            else 0.0
        )
        yield_change = yields[-1] - yields[idx_ago]
        vol_change = (
            ((vols[-1] - vols[idx_ago]) / vols[idx_ago] * 100)
            if vols[idx_ago]
            else 0.0
        )
        price_slope = _slope(prices)
        movers.append(
            {
                "area_id": u["area_id"],
                "name": u["name"],
                "price_pct_3mo": round(price_change, 2),
                "yield_pp_3mo": round(yield_change, 2),
                "volume_pct_3mo": round(vol_change, 2),
                "price_slope_pm": round(price_slope, 3),
                "latest_price": prices[-1],
                "latest_yield": yields[-1],
            }
        )

    movers_by_price_up = sorted(
        movers, key=lambda m: m["price_pct_3mo"], reverse=True
    )[:5]
    movers_by_price_down = sorted(movers, key=lambda m: m["price_pct_3mo"])[:5]
    movers_by_yield_up = sorted(
        movers, key=lambda m: m["yield_pp_3mo"], reverse=True
    )[:5]
    movers_by_volume = sorted(
        movers, key=lambda m: m["volume_pct_3mo"], reverse=True
    )[:5]

    # ---- LLM narrative (optional augmentation) ----
    narrative: Optional[str] = None
    model_used: Optional[str] = None
    tokens_used: Optional[int] = None
    if settings.OPENROUTER_API_KEY:
        bullet_lines: list[str] = ["Top movers, last 3 months:"]
        for m in movers_by_price_up[:3]:
            bullet_lines.append(
                f"  {m['name']}: price {m['price_pct_3mo']:+.2f}%, yield "
                f"{m['yield_pp_3mo']:+.2f}pp"
            )
        bullet_lines.append("Bottom movers:")
        for m in movers_by_price_down[:3]:
            bullet_lines.append(
                f"  {m['name']}: price {m['price_pct_3mo']:+.2f}%, yield "
                f"{m['yield_pp_3mo']:+.2f}pp"
            )
        result = await openrouter_chat(
            system=TRENDS_NARRATIVE_SYSTEM,
            user="\n".join(bullet_lines),
            max_tokens=200,
            temperature=0.2,
        )
        if result.ok:
            narrative = result.content.strip()
            model_used = result.model
            tokens_used = result.total_tokens

    payload = {
        "as_of": today,
        "price_up": movers_by_price_up,
        "price_down": movers_by_price_down,
        "yield_up": movers_by_yield_up,
        "volume_up": movers_by_volume,
        "narrative": narrative,
        "model": model_used,
        "tokens": tokens_used,
        "cached": False,
    }
    try:
        await redis_client.setex(ck, TRENDS_TTL_S, json.dumps(payload))
    except Exception:
        pass
    return payload
