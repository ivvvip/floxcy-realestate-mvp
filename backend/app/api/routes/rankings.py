"""Area rankings by various metrics."""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.services.confidence import build_confidence_report, confidence_to_dict

router = APIRouter(
    prefix="/api/v1/rankings",
    tags=["rankings"],
    dependencies=[Depends(rate_limit_dependency)],
)

RANKABLE = {
    "yield": lambda s: float(s.rental_yield),
    "appreciation": lambda s: float(s.appreciation_1y or 0),
    "volume": lambda s: float(s.transaction_volume or 0),
    "score": lambda s: float(s.investment_score or 0),
    "low_risk": lambda s: -float(s.risk_score or 10),
    "price_low": lambda s: -float(s.avg_price_per_sqft or 0),
}


@router.get("")
async def get_rankings(
    db: AsyncSession = Depends(get_db),
    by: Literal["yield", "appreciation", "volume", "score", "low_risk", "price_low"] = Query(
        default="score"
    ),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Return areas sorted by the requested metric."""
    areas = (await db.execute(select(Area))).scalars().all()
    rows = []
    for area in areas:
        snaps = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == area.id)
                .order_by(MarketSnapshot.snapshot_date)
            )
        ).scalars().all()
        if not snaps:
            continue
        latest = snaps[-1]
        conf = build_confidence_report(area, list(snaps))
        rows.append(
            {
                "area_id": str(area.id),
                "area_name": area.name,
                "area_type": area.area_type,
                "metric": by,
                "value": RANKABLE[by](latest),
                "metric_display": {
                    "yield": float(latest.rental_yield),
                    "appreciation_1y": float(latest.appreciation_1y) if latest.appreciation_1y else None,
                    "transaction_volume": latest.transaction_volume,
                    "investment_score": float(latest.investment_score) if latest.investment_score else None,
                    "risk_score": float(latest.risk_score) if latest.risk_score else None,
                    "price_per_sqft": float(latest.avg_price_per_sqft),
                },
                "confidence": confidence_to_dict(conf),
            }
        )
    rows.sort(key=lambda r: r["value"], reverse=True)
    return {"by": by, "count": len(rows[:limit]), "results": rows[:limit]}
