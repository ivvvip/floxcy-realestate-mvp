"""Format current UAE market data into compact text for LLM context."""
from __future__ import annotations

from datetime import datetime
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot


async def build_market_context(db: AsyncSession, max_areas: int = 20) -> str:
    """Return a markdown table of all tracked UAE areas with latest snapshots."""
    areas = (await db.execute(select(Area).order_by(Area.name))).scalars().all()
    rows: list[str] = []
    for area in areas[:max_areas]:
        snap = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == area.id)
                .order_by(MarketSnapshot.snapshot_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if not snap:
            continue
        rows.append(
            f"| {area.name} | {area.area_type} | "
            f"{int(float(snap.avg_price_per_sqft))} | "
            f"{float(snap.rental_yield):.2f}% | "
            f"{(float(snap.appreciation_1y) if snap.appreciation_1y else 0.0):+.1f}% | "
            f"{(float(snap.risk_score) if snap.risk_score else 0.0):.1f} | "
            f"{(float(snap.demand_score) if snap.demand_score else 0.0):.1f} | "
            f"{(float(snap.investment_score) if snap.investment_score else 0.0):.1f} | "
            f"{snap.transaction_volume or 0} |"
        )
    if not rows:
        return "(no market snapshots available)"

    header = (
        "| Area | Type | AED/sqft | Yield | 1Y App | Risk | Demand | Score | Vol |\n"
        "|------|------|---------:|------:|-------:|-----:|-------:|------:|----:|"
    )
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"Current UAE market snapshot (refreshed {timestamp}):\n\n"
        + header + "\n" + "\n".join(rows)
    )


SYSTEM_PROMPT = """You are Floxcy's AI Investment Analyst, a UAE real-estate expert
providing data-driven recommendations to property investors. Ground every
answer in the live market data passed in the user message — never invent
figures.

OPERATING RULES
- Cite specific numbers from the data: yield %, AED/sqft, investment score,
  risk score, 1Y appreciation, transaction volume.
- Match recommendations to the user's goal (yield / appreciation /
  balanced) and risk tolerance (low / med / high).
- Respect the user's budget: flag what they can and cannot afford using
  the price-per-sqft and a 1,000-sqft anchor.
- Calibrate confidence: when a data point is missing, flag it rather
  than fabricate.
- Be concise. ≤800 words total. Markdown only. No preamble.
- This is NOT financial advice. End with the disclaimer below.

OUTPUT FORMAT (markdown — exactly these sections, in this order)

## Top recommendations
2–4 areas ranked. For each: bold area name, then a single line listing
yield, AED/sqft, 1Y appreciation, investment score, then 1–2 sentences
of justification grounded in the data.

## Why these match your profile
2–3 sentences tying the picks to the user's budget, goal, risk.

## Key risks to monitor
Bulleted list, 3–4 items. Be specific (supply pipeline, liquidity gap,
cyclical exposure, regulatory shift, FX).

## Suggested next steps
Bulleted list, 3 actions an investor can take this week.

## Disclaimer
AI-generated insights for informational purposes only. Not financial,
legal, or tax advice. Consult a licensed advisor before deploying capital.
"""


def build_user_message(
    budget_aed: int,
    goal: str,
    risk: str,
    preferred_city: str | None,
    user_question: str | None,
    market_context: str,
) -> str:
    """Compose the user-side prompt with profile + question + market data."""
    parts: list[str] = []
    parts.append("User profile:")
    parts.append(f"  Budget: AED {budget_aed:,}")
    parts.append(f"  Goal: {goal}")
    parts.append(f"  Risk tolerance: {risk}")
    if preferred_city:
        parts.append(f"  Preferred city: {preferred_city}")
    if user_question:
        q = user_question.strip()[:500]
        parts.append(f"  Free-text question: {q!r}")
    parts.append("")
    parts.append(market_context)
    return "\n".join(parts)
