"""Data Confidence scoring.

Every area/snapshot is rated 0–100. Score is the weighted blend of:

  * Sample size   (weight 0.35)  — proxy for statistical robustness
  * Recency       (weight 0.25)  — staleness penalty
  * Source count  (weight 0.20)  — multi-source corroboration
  * Consistency   (weight 0.20)  — coefficient of variation across history

Output:
  ConfidenceReport { score, level, sources, last_updated, sample_size,
                     data_delay_minutes, methodology, factors }
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional

from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot


# Canonical UAE data-source catalog. data_source field on MarketSnapshot
# may name any of these; if unrecognized, falls back to "Internal".
KNOWN_SOURCES: dict[str, str] = {
    "dld": "Dubai Land Department transactions",
    "reidin": "REIDIN price indices",
    "rental_contracts": "Public rental contracts (Ejari)",
    "broker_feedback": "Broker-verified feedback",
    "internal": "Floxcy internal estimates",
    "manual": "Manual analyst entry",
}

DEFAULT_SOURCES: tuple[str, ...] = ("dld", "reidin", "rental_contracts")

METHODOLOGY_TEXT = (
    "Weighted blend of sample size (35%), data recency (25%), source diversity "
    "(20%), and historical consistency (20%). See /methodology for the full "
    "formula and source-by-source weights."
)


@dataclass
class ConfidenceFactor:
    name: str
    weight: float
    score: float  # 0-100 contribution before weighting
    note: str = ""


@dataclass
class ConfidenceReport:
    score: int
    level: str  # "high" | "medium" | "low"
    sources: list[str]
    last_updated: Optional[str]
    sample_size: int
    data_delay_minutes: Optional[int]
    methodology: str
    factors: list[ConfidenceFactor] = field(default_factory=list)


def _classify(score: float) -> str:
    if score >= 80:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


def _sample_size_factor(volumes: Iterable[int]) -> tuple[float, int]:
    total = sum(v or 0 for v in volumes)
    if total <= 0:
        return 0.0, 0
    # Log-curve cap: 100 at ~1500 transactions, 50 at ~150, 80 at ~600
    import math

    raw = (math.log10(max(total, 1)) - math.log10(50)) / (math.log10(1500) - math.log10(50))
    return max(0.0, min(100.0, raw * 100)), total


def _recency_factor(last_dt: Optional[datetime]) -> tuple[float, Optional[int]]:
    if last_dt is None:
        return 0.0, None
    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)
    delta_minutes = int((datetime.now(timezone.utc) - last_dt).total_seconds() / 60)
    if delta_minutes <= 60:
        score = 100.0
    elif delta_minutes <= 24 * 60:
        score = 90.0
    elif delta_minutes <= 7 * 24 * 60:
        score = 75.0
    elif delta_minutes <= 30 * 24 * 60:
        score = 55.0
    elif delta_minutes <= 90 * 24 * 60:
        score = 30.0
    else:
        score = 10.0
    return score, delta_minutes


def _source_count_factor(sources: list[str]) -> float:
    n = len(set(sources))
    if n <= 0:
        return 0.0
    if n == 1:
        return 40.0
    if n == 2:
        return 70.0
    if n == 3:
        return 90.0
    return 100.0


def _consistency_factor(snapshots: list[MarketSnapshot]) -> float:
    if len(snapshots) < 3:
        return 50.0
    prices = [float(s.avg_price_per_sqft) for s in snapshots]
    mean = sum(prices) / len(prices)
    if mean == 0:
        return 50.0
    var = sum((p - mean) ** 2 for p in prices) / len(prices)
    std = var ** 0.5
    cv = std / mean  # coefficient of variation
    # Lower CV → higher consistency. CV 0.02 → 95, CV 0.10 → 60, CV 0.25+ → 25
    if cv < 0.02:
        return 95.0
    if cv < 0.05:
        return 85.0
    if cv < 0.10:
        return 70.0
    if cv < 0.15:
        return 55.0
    if cv < 0.25:
        return 40.0
    return 25.0


def build_confidence_report(
    area: Optional[Area],
    snapshots: list[MarketSnapshot],
    sources: Optional[list[str]] = None,
) -> ConfidenceReport:
    """Score the data we have for an area. snapshots in chronological order."""
    used_sources = sources or [
        s.data_source for s in snapshots if getattr(s, "data_source", None)
    ]
    if not used_sources:
        used_sources = list(DEFAULT_SOURCES)
    canon = sorted({s.lower() for s in used_sources})

    last_dt = snapshots[-1].created_at if snapshots else None
    sample_size_score, total_vol = _sample_size_factor(
        s.transaction_volume for s in snapshots
    )
    recency_score, delay_min = _recency_factor(last_dt)
    source_score = _source_count_factor(canon)
    consistency_score = _consistency_factor(snapshots)

    weighted = (
        0.35 * sample_size_score
        + 0.25 * recency_score
        + 0.20 * source_score
        + 0.20 * consistency_score
    )
    score = int(round(max(0.0, min(100.0, weighted))))

    return ConfidenceReport(
        score=score,
        level=_classify(score),
        sources=[KNOWN_SOURCES.get(s, s.title()) for s in canon],
        last_updated=last_dt.isoformat() if last_dt else None,
        sample_size=total_vol,
        data_delay_minutes=delay_min,
        methodology=METHODOLOGY_TEXT,
        factors=[
            ConfidenceFactor(
                "sample_size",
                0.35,
                round(sample_size_score, 1),
                f"{total_vol:,} transactions across {len(snapshots)} snapshots",
            ),
            ConfidenceFactor(
                "recency",
                0.25,
                round(recency_score, 1),
                f"last snapshot {delay_min} min ago" if delay_min is not None else "no snapshots",
            ),
            ConfidenceFactor(
                "source_diversity",
                0.20,
                round(source_score, 1),
                f"{len(canon)} source(s)",
            ),
            ConfidenceFactor(
                "consistency",
                0.20,
                round(consistency_score, 1),
                "coefficient of variation across price history",
            ),
        ],
    )


def confidence_to_dict(rep: ConfidenceReport) -> dict:
    return {
        "score": rep.score,
        "level": rep.level,
        "sources": rep.sources,
        "last_updated": rep.last_updated,
        "sample_size": rep.sample_size,
        "data_delay_minutes": rep.data_delay_minutes,
        "methodology": rep.methodology,
        "factors": [
            {
                "name": f.name,
                "weight": f.weight,
                "score": f.score,
                "note": f.note,
            }
            for f in rep.factors
        ],
    }
