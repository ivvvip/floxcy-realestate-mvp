"""Methodology endpoint — public, machine-readable methodology document."""
from fastapi import APIRouter, Depends

from app.core.rate_limit import rate_limit_dependency

router = APIRouter(
    prefix="/api/v1/methodology",
    tags=["methodology"],
    dependencies=[Depends(rate_limit_dependency)],
)


METHODOLOGY_DOC = {
    "version": "v0.1",
    "last_updated": "2026-05-28",
    "disclaimer": (
        "Floxcy provides market intelligence derived from public and licensed UAE "
        "real-estate data. Every score and recommendation is computed from "
        "observable metrics — it is NOT investment, legal, or tax advice. "
        "Consult a licensed advisor before deploying capital."
    ),
    "data_sources": {
        "dld": {
            "name": "Dubai Land Department",
            "type": "Government transaction registry",
            "frequency": "daily",
            "url": "https://dubailand.gov.ae/",
        },
        "reidin": {
            "name": "REIDIN",
            "type": "Licensed real-estate price indices",
            "frequency": "weekly",
        },
        "ejari": {
            "name": "Ejari (rental contracts)",
            "type": "Government rental registry",
            "frequency": "daily",
        },
        "broker_feedback": {
            "name": "On-the-ground broker network",
            "type": "Human-verified qualitative inputs",
            "frequency": "monthly",
        },
    },
    "metrics": {
        "rental_yield": {
            "formula": "annual_rent / property_price * 100",
            "unit": "percent",
            "notes": "Gross yield. Net yield subtracts service charges and maintenance.",
        },
        "roi_gross_yield": {
            "formula": "annual_rent / property_price * 100",
            "unit": "percent",
        },
        "roi_net_yield": {
            "formula": "(annual_rent - total_costs) / property_price * 100",
            "unit": "percent",
            "notes": "total_costs = service_charges + maintenance + other_costs",
        },
        "payback_years": {
            "formula": "property_price / (annual_rent - total_costs)",
            "unit": "years",
            "notes": "Undefined when net income is non-positive.",
        },
        "appreciation_1y": {
            "formula": "(price_now - price_12mo_ago) / price_12mo_ago * 100",
            "unit": "percent",
        },
        "investment_score": {
            "formula": "0.35*yield_pp + 0.30*appreciation_pp + 0.20*demand + 0.15*(10 - risk)",
            "unit": "0–10",
            "notes": "Multi-factor blended score per area.",
        },
    },
    "scoring": {
        "confidence_score": {
            "formula": (
                "0.35*sample_size + 0.25*recency + 0.20*source_diversity + "
                "0.20*consistency"
            ),
            "levels": {"high": "80–100", "medium": "50–79", "low": "0–49"},
            "notes": (
                "If confidence is low, the platform displays an explicit warning "
                "on every figure derived from the snapshot."
            ),
        },
        "opportunity_score": {
            "formula": (
                "0.30*yield + 0.25*appreciation_1y + 0.25*value_entry + "
                "0.10*demand + 0.10*inverse_risk"
            ),
            "components": {
                "yield": "(rental_yield - 3) / 7 clamped [0,1]",
                "appreciation": "(appreciation_1y + 5) / 25 clamped [0,1]",
                "value_entry": "(cohort_median_price - price) / cohort_median + 0.5",
                "demand": "0.6*occupancy + 0.4*min(1, volume/1500)",
                "inverse_risk": "(10 - risk_score) / 10",
            },
            "types": {
                "Premium Hold": "score>=70 AND demand>=8 AND risk<=4",
                "Growth Opportunity": "appreciation_1y>10 AND appr_component>0.7",
                "Speculative": "appreciation_1y>12 AND risk>=6.5",
                "Income Opportunity": "yield>7 AND value_component>0.6",
                "Value Opportunity": "value_component>0.6 (otherwise)",
                "Balanced": "fallback",
            },
            "classifier_order": (
                "First-match wins, evaluated in this order: Premium Hold → "
                "Growth → Speculative → Income → Value → Balanced."
            ),
        },
        "advisor_match": {
            "formula": (
                "Goal-weighted blend: yield-led (0.5*y + 0.2*app + 0.2*dem - 0.1*risk), "
                "appreciation-led (0.2*y + 0.5*app + 0.2*dem - 0.1*risk), "
                "balanced (0.35*y + 0.35*app + 0.20*dem - 0.10*risk). "
                "Filtered by risk tolerance."
            ),
        },
    },
    "update_cadence": {
        "transactions": "daily (DLD)",
        "rental_contracts": "daily (Ejari)",
        "price_indices": "weekly (REIDIN)",
        "snapshots": "every 24h (consolidation job)",
        "rankings": "computed on read",
        "confidence_scores": "computed on read",
    },
    "limitations": [
        "Public transaction data lags actual handover by 7–30 days.",
        "Off-plan transactions are reported separately and not blended into resale yields.",
        "Rental yield uses gross asking-rent proxies for areas with low Ejari coverage.",
        "Synthetic seed data is used in development environments; production overrides this.",
        "Geographic coverage is currently UAE-only.",
    ],
}


@router.get("")
async def methodology() -> dict:
    return METHODOLOGY_DOC
