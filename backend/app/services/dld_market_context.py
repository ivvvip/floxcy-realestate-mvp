"""DLD-powered LLM context for the AI Investment Advisor.

Replaces the curated-MarketSnapshot context with real Dubai Land Department
signals so the model can cite specific numbers (sample sizes, real YoY,
building income aggregates) instead of vague summaries.

Output is a markdown table that the LLM consumes verbatim in the user
message. The whole table is cached in Redis for 1 hour — the underlying
DLD snapshot updates daily at most, so re-aggregating per request would
waste CPU.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.dld import DldArea, DldAreaMetrics, DldBuilding
from app.redis_client import redis_client
from app.schemas.dld import (
    DISPLAY_YIELD_CAP_PCT,
    MIN_RELIABLE_SAMPLES,
    cap_yield,
    confidence_for,
)

logger = logging.getLogger("floxcy.advisor.context")

# Bump when the context shape changes — invalidates Redis cache transparently.
# v3: appended the city-level Market Timing block (seasonal buy/sell guidance).
# v4: appended UAE residence-visa thresholds + eligible-area guidance.
CONTEXT_CACHE_KEY = "ai:advisor:context:v4"
CONTEXT_CACHE_TTL_S = 3600  # 1 hour

from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_TIMING_PATH = _DATA_DIR / "market_timing.json"
_VISA_PATH = _DATA_DIR / "visa_eligibility.json"


def _visa_block() -> str:
    """UAE residence-visa thresholds + a few eligible-area examples for the LLM."""
    if not _VISA_PATH.exists():
        return ""
    try:
        d = json.loads(_VISA_PATH.read_text())
    except (OSError, ValueError):
        return ""
    th = d.get("thresholds", {})
    areas = d.get("areas", [])
    # affordable golden-visa entry points: areas with the lowest median price that
    # still have a meaningful share of ≥AED 2M sales.
    golden = sorted(
        [a for a in areas if a.get("pct_golden_visa", 0) >= 20],
        key=lambda a: a.get("median_price", 0),
    )[:5]
    investor = sorted(
        [a for a in areas if a.get("pct_investor_visa", 0) >= 40],
        key=lambda a: a.get("median_price", 0),
    )[:5]
    g = d.get("global", {})
    return (
        "\n\nUAE residence visa by property value (rules-based; tell the user to verify with DLD/ICP):\n"
        f"- AED {int(th.get('investor_visa_aed', 750000)):,}+ → 2-year renewable investor visa.\n"
        f"- AED {int(th.get('golden_visa_aed', 2000000)):,}+ → 10-year Golden Visa (family sponsorship).\n"
        f"- Across Dubai residential sales, {g.get('pct_investor_visa')}% qualify for the investor visa "
        f"and {g.get('pct_golden_visa')}% for the Golden Visa.\n"
        f"- Affordable Golden-Visa entry areas (lowest median with ≥AED 2M options): "
        f"{', '.join(a['name'] for a in golden)}.\n"
        f"- Investor-visa entry areas: {', '.join(a['name'] for a in investor)}.\n"
        "- The property must be retained to keep the visa. Verify current rules with DLD/ICP/GDRFA."
    )


def _market_timing_block() -> str:
    """Concise, statistically-verified city-level timing facts for the LLM.
    CITY-LEVEL ONLY — never per-area (per-area monthly timing is noise)."""
    if not _TIMING_PATH.exists():
        return ""
    try:
        d = json.loads(_TIMING_PATH.read_text())
    except (OSError, ValueError):
        return ""
    bb = d.get("best_buy", {})
    bs = d.get("best_sell", {})
    summer = d.get("summer", {})
    sig = d.get("significance", {})
    return (
        "\n\nDubai Market Timing (city-level, DLD sales 2021–2025, "
        f"{d.get('meta', {}).get('total_sales', 0):,} sales; "
        f"demand seasonality significant {sig.get('significant_years', '?')} years):\n"
        f"- Best time to BUY: {bb.get('month')} — ~{bb.get('pct_below_avg')}% below the annual "
        f"average price/sqft and the lowest competition (verified {bb.get('years_consistent')} years).\n"
        f"- Best time to SELL: {bs.get('months')} — peak buyer demand + highest prices.\n"
        f"- Busiest months: {', '.join(d.get('demand_high_months', []))}. "
        f"Quietest: {', '.join(d.get('demand_low_months', []))}.\n"
        f"- There is NO summer slowdown — summer is {summer.get('share_pct')}% of sales "
        f"(never below the 25% flat line), and {summer.get('busiest_summer_month')} is one of the busiest months. "
        "Do not claim a summer slowdown.\n"
        "- This timing is CITY-WIDE only; individual areas vary and per-area monthly timing is "
        "not statistically reliable. Prices are registration-date based; the seasonal price swing is modest (~±7%)."
    )


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------

async def build_dld_market_context(
    db: AsyncSession,
    max_areas: int = 25,
    use_cache: bool = True,
) -> str:
    """Markdown table of DLD-tracked areas, ranked by total signal volume.

    Filters out areas with thin data (sales_count + rent_count_2026 < 30)
    so the LLM never gets fed numbers it would otherwise have to caveat.
    """
    if use_cache:
        try:
            cached = await redis_client.get(CONTEXT_CACHE_KEY)
            if cached:
                # Cached blob is the raw markdown — no JSON envelope needed.
                if isinstance(cached, bytes):
                    return cached.decode()
                return cached
        except Exception:
            logger.debug("context cache lookup failed; rebuilding live")

    # Single query — area + 2026-ytd metrics + (per-area building agg)
    bld_agg = (
        select(
            DldBuilding.dld_area_id,
            func.count().label("building_count"),
            func.coalesce(
                func.sum(
                    DldBuilding.avg_annual_rent * DldBuilding.active_rent_count
                ),
                0,
            ).label("total_bldg_income"),
        )
        .where(DldBuilding.active_rent_count > 0)
        .group_by(DldBuilding.dld_area_id)
        .subquery()
    )

    stmt = (
        select(
            DldArea.id,
            DldArea.name_display,
            DldArea.name_norm,
            DldAreaMetrics.median_price_per_sqft,
            DldAreaMetrics.avg_price_per_sqft,
            DldAreaMetrics.median_annual_rent,
            DldAreaMetrics.median_rent_per_sqft,
            DldAreaMetrics.rental_yield_pct,
            DldAreaMetrics.rent_growth_yoy_pct,
            DldAreaMetrics.sales_count,
            DldAreaMetrics.rent_count_2026,
            bld_agg.c.building_count,
            bld_agg.c.total_bldg_income,
        )
        .join(
            DldAreaMetrics,
            and_(
                DldAreaMetrics.dld_area_id == DldArea.id,
                DldAreaMetrics.period == "2026-ytd",
            ),
        )
        .outerjoin(bld_agg, bld_agg.c.dld_area_id == DldArea.id)
        .where(
            (DldAreaMetrics.sales_count + DldAreaMetrics.rent_count_2026)
            >= MIN_RELIABLE_SAMPLES,
        )
        .order_by(
            (DldAreaMetrics.sales_count + DldAreaMetrics.rent_count_2026).desc()
        )
        .limit(max_areas)
    )
    rows = (await db.execute(stmt)).all()

    if not rows:
        return "(no DLD market data available)"

    # Dubai-wide median PPSF for valuation_gap_pct
    median_ppsf_row = await db.execute(
        select(func.percentile_cont(0.5).within_group(
            DldAreaMetrics.median_price_per_sqft
        )).where(DldAreaMetrics.median_price_per_sqft.isnot(None))
    )
    dubai_median_ppsf = median_ppsf_row.scalar() or 0.0

    table_rows: list[str] = []
    for r in rows:
        sales = int(r.sales_count or 0)
        rents = int(r.rent_count_2026 or 0)
        med_ppsf = float(r.median_price_per_sqft) if r.median_price_per_sqft else None
        med_rent = float(r.median_annual_rent) if r.median_annual_rent else None
        yoy = float(r.rent_growth_yoy_pct) if r.rent_growth_yoy_pct is not None else None
        raw_yield = float(r.rental_yield_pct) if r.rental_yield_pct is not None else None
        # Same display rule as the public API
        show_yield = (
            cap_yield(raw_yield)
            if (raw_yield is not None
                and sales >= MIN_RELIABLE_SAMPLES
                and rents >= MIN_RELIABLE_SAMPLES)
            else None
        )
        bld_count = int(r.building_count or 0)
        bld_income = float(r.total_bldg_income or 0)
        conf = confidence_for(max(sales, rents))
        gap_pct: Optional[float] = None
        if med_ppsf and dubai_median_ppsf:
            gap_pct = (float(med_ppsf) - float(dubai_median_ppsf)) / float(dubai_median_ppsf) * 100

        def _aed(v: float | None) -> str:
            if v is None or v <= 0:
                return "n/a"
            return f"{int(v):,}"

        def _pct(v: float | None) -> str:
            if v is None:
                return "n/a"
            return f"{v:+.1f}%"

        def _yield(v: float | None) -> str:
            if v is None:
                return "thin"
            return f"{v:.2f}%"

        def _bld_income(v: float) -> str:
            if v <= 0:
                return "n/a"
            if v >= 1_000_000_000:
                return f"AED {v / 1_000_000_000:.1f}B"
            if v >= 1_000_000:
                return f"AED {v / 1_000_000:.1f}M"
            return f"AED {v / 1_000:.0f}K"

        table_rows.append(
            f"| {r.name_display} | "
            f"{_aed(med_ppsf)} | "
            f"{_yield(show_yield)} | "
            f"{_pct(yoy)} | "
            f"{sales:,} | "
            f"{rents:,} | "
            f"{bld_count} | "
            f"{_bld_income(bld_income)} | "
            f"{_pct(gap_pct)} | "
            f"{conf} |"
        )

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    header = (
        "| Area | Median AED/sqft | Yield (cap 25%) | YoY rent | "
        "Sales 2026 | Rent contracts | Buildings | Bldg income/yr | "
        "Valuation gap | Confidence |\n"
        "|------|-----------------:|----------------:|---------:|"
        "-----------:|---------------:|----------:|---------------:|"
        "--------------:|-----------:|"
    )
    notes = (
        "Notes:\n"
        f"- Sample threshold: areas with <{MIN_RELIABLE_SAMPLES} combined "
        "sales+rents are excluded from the table.\n"
        "- Yield is capped at "
        f"{DISPLAY_YIELD_CAP_PCT:.0f}% (DLD small-sample artefacts above "
        "that are unreliable); shown as 'thin' when sales or rent samples "
        "are below 30.\n"
        f"- Valuation gap = (area median PPSF − Dubai median PPSF "
        f"{int(dubai_median_ppsf):,} AED/sqft) ÷ Dubai median, positive = "
        "premium to market.\n"
        "- Building income = sum of (avg_annual_rent × active rent count) "
        "across DLD-tracked buildings linked to that area. n/a means DLD "
        "hasn't published building rows for this area (typical for "
        "tower-density communities like Business Bay).\n"
        "- Confidence: high ≥100 sample, medium ≥30, low <30."
    )

    markdown = (
        f"Current Dubai market — Dubai Land Department open data "
        f"(snapshot rebuilt {timestamp}):\n\n"
        + header + "\n"
        + "\n".join(table_rows)
        + "\n\n" + notes
        + _market_timing_block()
        + _visa_block()
    )

    try:
        await redis_client.setex(CONTEXT_CACHE_KEY, CONTEXT_CACHE_TTL_S, markdown)
    except Exception:
        logger.debug("context cache write failed; serving live")

    return markdown


# ---------------------------------------------------------------------------
# System prompt — calibrated for DLD-grounded citations
# ---------------------------------------------------------------------------

DLD_SYSTEM_PROMPT = """You are Floxcy's AI Investment Analyst — UAE real-estate
specialist. Ground EVERY claim in the Dubai Land Department market table in
the user message. You are talking to investors who will fact-check your
numbers against DLD's public registry.

NON-NEGOTIABLE CITATION RULES
- When recommending an area, ALWAYS quote the exact DLD figures from the
  table: median AED/sqft, capped yield %, YoY rent growth %, sales 2026
  count, rent contract count, building count.
- Example you MUST emulate:
    "Business Bay: median 16,752 AED/sqft, +18.2% YoY rent growth on
     18,666 rent contracts and 482 sales; valuation premium +120% to
     Dubai median; no building-level data (tower-density)."
- Example you MUST AVOID:
    "Business Bay has good yields and is a popular area."
- When the table shows "thin" or "n/a" for any metric, write
  "[metric] = thin data" rather than inventing a number.
- When sales_count + rent_count < 100, prefix your recommendation with
  "Limited sample:" so the investor knows.

REASONING RULES
- Match recommendations to user's goal (yield / appreciation / balanced),
  risk tolerance (low / med / high), and budget.
- Affordability check: budget ÷ median_ppsf gives the affordable sqft.
  Flag if <400 sqft (small unit) or >2000 sqft (entry villa).
- Valuation gap signals: >+50% to Dubai median = premium location;
  <-30% = bargain (or distressed — caveat by checking YoY).
- Building income aggregates indicate landlord-density: high income with
  low building count means concentrated ownership.

CONSTRAINTS
- ≤ 800 words. Markdown only. No preamble.
- Cite NO numbers not present in the table.
- This is NOT financial advice. End with the disclaimer.

OUTPUT FORMAT (markdown — exactly these sections)

## Top recommendations
2–4 areas ranked best→worst. For each: bold area name, then one
factual line with ALL six DLD figures (median PPSF / yield / YoY /
sales count / rent count / building count), then 1–2 sentences tying
the figures to the user's profile.

## Why these match your profile
2–3 sentences linking picks to budget, goal, risk.

## Key risks to monitor
Bulleted list, 3–4 items. Be specific: name the data point that worries
you (e.g. "YoY rent growth is +28% in X — risk of cyclical correction"
or "Only 47 sales in Y — limited liquidity if you need to exit").

## Suggested next steps
Bulleted list, 3 concrete actions for this week (e.g. "Pull a
unit-level price comp from Property Finder for shortlisted area X").

## Disclaimer
AI-generated insights for informational purposes only. Not financial,
legal, or tax advice. Consult a licensed advisor before deploying capital.
"""


def build_dld_user_message(
    budget_aed: int,
    goal: str,
    risk: str,
    preferred_city: str | None,
    user_question: str | None,
    market_context: str,
) -> str:
    """Compose the user prompt with profile + DLD market table."""
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
