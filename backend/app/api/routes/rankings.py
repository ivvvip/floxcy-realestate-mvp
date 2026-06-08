"""Area rankings by various metrics — real DLD only (World B retired, Phase 1).

Ranks the same DLD-scored universe as /opportunities; no seeded snapshots.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.api.routes.opportunities import _load_universe_dld, _score_all_dld

router = APIRouter(
    prefix="/api/v1/rankings",
    tags=["rankings"],
    dependencies=[Depends(rate_limit_dependency)],
)


def _value(by: str, r) -> Optional[float]:
    """Rank value for the chosen metric; None when the real signal is absent
    (those rows drop out of the ranking rather than ranking on a fake 0)."""
    km = r.key_metrics
    if by == "yield":
        return km.rental_yield
    if by == "appreciation":
        return km.appreciation_1y
    if by == "volume":
        return float(km.transaction_volume) if km.transaction_volume is not None else None
    if by == "score":
        return float(r.opportunity_score)
    if by == "low_risk":
        return (-float(km.risk_score)) if km.risk_score is not None else None
    if by == "price_low":
        return (-float(km.price_per_sqft)) if km.price_per_sqft is not None else None
    return None


def _conf(r, sample: int) -> dict:
    lvl = "high" if r.confidence_level >= 0.8 else "medium" if r.confidence_level >= 0.6 else "low"
    return {
        "score": round(r.confidence_level * 100),
        "level": lvl,
        "sources": ["Dubai Land Department"],
        "last_updated": "2026-06-01",
        "sample_size": sample,
        "data_delay_minutes": None,
        "methodology": "DLD 2026 YTD metrics + appreciation + off-plan supply (no seeded data)",
        "factors": [],
    }


@router.get("")
async def get_rankings(
    db: AsyncSession = Depends(get_db),
    by: Literal["yield", "appreciation", "volume", "score", "low_risk", "price_low"] = Query(
        default="score"
    ),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Return areas sorted by the requested metric (real DLD)."""
    inputs = await _load_universe_dld(db)
    reports = _score_all_dld(inputs)
    sample_by_id = {i.area_id: (i.sales_count + i.rent_count) for i in inputs}

    rows = []
    for r in reports:
        v = _value(by, r)
        if v is None:
            continue
        km = r.key_metrics
        rows.append({
            "area_id": r.area_id,
            "area_name": r.area_name,
            "area_type": r.area_type,
            "metric": by,
            "value": v,
            "metric_display": {
                "yield": km.rental_yield,
                "appreciation_1y": km.appreciation_1y,
                "transaction_volume": km.transaction_volume,
                "investment_score": km.investment_score,
                "risk_score": km.risk_score,
                "price_per_sqft": km.price_per_sqft,
            },
            "confidence": _conf(r, sample_by_id.get(r.area_id, 0)),
        })
    rows.sort(key=lambda r: r["value"], reverse=True)
    return {"by": by, "count": len(rows[:limit]), "results": rows[:limit]}
