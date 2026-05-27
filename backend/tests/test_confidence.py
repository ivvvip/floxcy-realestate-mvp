"""Tests for confidence scoring."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.confidence import build_confidence_report, _classify


def _snap(price=1000, vol=200, source="dld", days_old=0):
    return SimpleNamespace(
        avg_price_per_sqft=price,
        avg_sale_price=price * 1000,
        rental_yield=7.0,
        transaction_volume=vol,
        data_source=source,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_old),
    )


def test_classification_thresholds():
    assert _classify(95) == "high"
    assert _classify(80) == "high"
    assert _classify(79) == "medium"
    assert _classify(50) == "medium"
    assert _classify(49) == "low"
    assert _classify(0) == "low"


def test_empty_snapshots_low_score():
    rep = build_confidence_report(None, [])
    assert rep.score < 50
    assert rep.level == "low"
    assert rep.sample_size == 0


def test_recent_diverse_snapshots_high_score():
    snaps = [
        _snap(price=1000 + i * 5, vol=200, source="dld", days_old=11 - i)
        for i in range(12)
    ] + [_snap(price=1080, vol=200, source="reidin", days_old=0)]
    rep = build_confidence_report(None, snaps, sources=["dld", "reidin", "rental_contracts"])
    assert rep.score >= 70
    assert rep.level in ("medium", "high")
    assert "Dubai Land Department transactions" in rep.sources


def test_stale_data_penalty():
    snaps = [
        _snap(price=1000, vol=100, source="dld", days_old=120 - i)
        for i in range(12)
    ]
    rep = build_confidence_report(None, snaps)
    assert rep.score < 70


def test_inconsistent_data_lowers_score():
    snaps = [
        _snap(price=1000, vol=100, days_old=11),
        _snap(price=1400, vol=100, days_old=10),
        _snap(price=800, vol=100, days_old=9),
        _snap(price=1600, vol=100, days_old=8),
    ]
    rep_consistent = build_confidence_report(
        None,
        [_snap(price=1000 + i, vol=100, days_old=11 - i) for i in range(12)],
    )
    rep_volatile = build_confidence_report(None, snaps)
    assert rep_consistent.score > rep_volatile.score


def test_source_diversity_factor():
    base = [_snap(days_old=1)] * 5
    one_src = build_confidence_report(None, base, sources=["dld"])
    three_src = build_confidence_report(
        None, base, sources=["dld", "reidin", "rental_contracts"]
    )
    assert three_src.score > one_src.score
