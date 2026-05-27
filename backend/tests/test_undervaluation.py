"""Tests for the undervaluation detector."""
from types import SimpleNamespace

from app.services.undervaluation import detect_undervaluation, _tier_for


def _area(name="Test"):
    return SimpleNamespace(id="00000000-0000-0000-0000-000000000001", name=name)


def _snap(**kw):
    base = dict(
        avg_price_per_sqft=1000,
        avg_sale_price=1_000_000,
        avg_annual_rent=80_000,
        rental_yield=7.5,
        occupancy_rate=90,
        appreciation_1y=5,
        appreciation_3y=12,
        transaction_volume=400,
        demand_score=7,
        risk_score=4,
        investment_score=7.5,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_tier_thresholds():
    assert _tier_for(80) == "strong"
    assert _tier_for(60) == "moderate"
    assert _tier_for(40) == "neutral"
    assert _tier_for(10) == "overpriced"


def test_strong_opportunity_with_yield_premium_and_discount():
    area = _area("JVC")
    history = [_snap(avg_price_per_sqft=900 + i, rental_yield=7.5) for i in range(12)]
    latest = history[-1]
    cohort_prices = [1500, 1600, 1700, 1800]  # JVC trades at ~40% discount
    cohort_yields = [5.5, 5.8, 6.0, 6.2]  # JVC yields 7.5% vs cohort ~5.9%
    report = detect_undervaluation(area, latest, history, cohort_prices, cohort_yields)
    assert report.score >= 65
    assert report.tier in ("strong", "moderate")
    assert len(report.reasons) >= 1
    assert "JVC" in report.headline


def test_overpriced_when_premium_and_low_yield():
    area = _area("Premium")
    history = [_snap(avg_price_per_sqft=3000, rental_yield=4.0, demand_score=5, risk_score=6) for _ in range(12)]
    latest = history[-1]
    cohort_prices = [1000, 1100, 1200]
    cohort_yields = [7.0, 7.5, 7.0]
    report = detect_undervaluation(area, latest, history, cohort_prices, cohort_yields)
    assert report.score < 50
    assert report.tier in ("overpriced", "neutral")


def test_risks_include_thin_liquidity():
    area = _area("Thin")
    history = [_snap(transaction_volume=10) for _ in range(12)]
    latest = history[-1]
    report = detect_undervaluation(area, latest, history, [1000], [7.0])
    assert any("Liquidity" in r or "thin" in r.lower() for r in report.risks)


def test_factors_sum_to_score():
    area = _area()
    history = [_snap() for _ in range(12)]
    latest = history[-1]
    report = detect_undervaluation(area, latest, history, [1000, 1100], [7.0, 6.5])
    total = sum(f.contribution for f in report.factors)
    assert abs(round(total) - report.score) <= 1


def test_best_for_populated():
    area = _area()
    history = [_snap(rental_yield=9.0, risk_score=3, transaction_volume=600) for _ in range(12)]
    latest = history[-1]
    report = detect_undervaluation(area, latest, history, [1500], [5.0])
    assert any("Rental-income" in b for b in report.best_for)
