"""Lightweight lead scoring for incoming investor consultations.

Used to prioritize the queue at /admin/leads and (later) drive broker
notifications. Returns a 0–100 score based on signal density and intent.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional


URGENT_TIMELINE_TOKENS = (
    "now", "asap", "soon", "this week", "this month",
    "1 month", "2 months", "30 days", "60 days", "immediately",
)


def compute_lead_score(
    *,
    has_opportunity: bool,
    whatsapp: Optional[str],
    phone: Optional[str],
    email: Optional[str],
    budget: Optional[Decimal],
    investment_goal: Optional[str],
    timeline: Optional[str],
    message: Optional[str],
) -> float:
    """Heuristic lead score 0–100.

    Bonuses:
      +20  Came from a specific deal page (vs. cold/generic).
      +15  WhatsApp provided (fastest contact channel in the UAE).
      +10  Email provided.
      +10  Phone provided.
      +20  Budget specified and >= 500k AED (proportional up to 5M).
      +15  Timeline includes an urgent token.
      +10  Investment goal provided.
      +10  Free-form message non-empty.
    Capped at 100.
    """
    score = 0.0
    if has_opportunity:
        score += 20
    if whatsapp:
        score += 15
    if email:
        score += 10
    if phone:
        score += 10
    if budget is not None:
        b = float(budget)
        if b >= 500_000:
            # Linearly ramp from 0 at 500k to 20 at 5M+.
            ramp = min(1.0, (b - 500_000) / (5_000_000 - 500_000))
            score += 20 * (0.5 + 0.5 * ramp)
    if timeline:
        low = timeline.lower()
        if any(tok in low for tok in URGENT_TIMELINE_TOKENS):
            score += 15
        else:
            score += 5
    if investment_goal:
        score += 10
    if message and message.strip():
        score += 10
    return min(100.0, round(score, 1))
