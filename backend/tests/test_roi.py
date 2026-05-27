"""Tests for ROI calculator service."""
import pytest

from app.services.roi_calculator import calculate_roi
from app.schemas.roi import ROICalculateRequest


def _req(**kw):
    base = dict(
        property_price=1_500_000,
        annual_rent=120_000,
        service_charges=12_000,
        maintenance_cost=5_000,
        other_costs=0,
    )
    base.update(kw)
    return ROICalculateRequest(**base)


def test_gross_yield_simple():
    res = calculate_roi(_req())
    # 120,000 / 1,500,000 = 8.0% gross
    assert res.gross_yield == pytest.approx(8.0, abs=0.001)


def test_net_yield_subtracts_costs():
    res = calculate_roi(_req())
    # net income = 120k - 17k = 103k → 103,000 / 1,500,000 = 6.8666...%
    assert res.net_yield == pytest.approx(6.867, abs=0.01)
    assert res.annual_net_income == pytest.approx(103_000, abs=1)


def test_payback_when_positive():
    res = calculate_roi(_req())
    # 1,500,000 / 103,000 = 14.5631...
    assert res.payback_years == pytest.approx(14.563, abs=0.01)


def test_payback_undefined_when_negative_income():
    res = calculate_roi(_req(annual_rent=10_000))
    # 10,000 - 17,000 = -7,000 → no payback
    assert res.payback_years is None or res.payback_years <= 0


def test_zero_price_handles_gracefully():
    # Pydantic validation should reject zero/negative price; manual instantiation:
    res = calculate_roi(_req(property_price=0.01, annual_rent=1))
    # Should not raise; gross_yield well-defined (very large)
    assert res.gross_yield > 0


def test_interpretation_present():
    res = calculate_roi(_req())
    assert isinstance(res.interpretation, str)
    assert len(res.interpretation) > 10
