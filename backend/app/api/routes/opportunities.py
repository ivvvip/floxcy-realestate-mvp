"""Undervalued Area Detector — the killer feature endpoint."""
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot
from app.services.confidence import build_confidence_report, confidence_to_dict
from app.services.undervaluation import detect_undervaluation, report_to_dict

router = APIRouter(
    prefix="/api/v1/opportunities",
    tags=["opportunities"],
    dependencies=[Depends(rate_limit_dependency)],
)


async def _load_latest_snapshots(db: AsyncSession) -> list[tuple[Area, list[MarketSnapshot]]]:
    """Load every area with its full snapshot history (ordered)."""
    areas = (await db.execute(select(Area).order_by(Area.name))).scalars().all()
    out: list[tuple[Area, list[MarketSnapshot]]] = []
    for a in areas:
        snaps = (
            await db.execute(
                select(MarketSnapshot)
                .where(MarketSnapshot.area_id == a.id)
                .order_by(MarketSnapshot.snapshot_date)
            )
        ).scalars().all()
        out.append((a, list(snaps)))
    return out


@router.get("")
async def list_opportunities(
    db: AsyncSession = Depends(get_db),
    tier: Optional[str] = Query(default=None, description="Filter by tier: strong|moderate|neutral|overpriced"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """Rank every area by undervaluation score (descending)."""
    universe = await _load_latest_snapshots(db)
    universe_latest = [(a, h[-1]) for a, h in universe if h]
    cohort_prices = [float(s.avg_price_per_sqft) for _, s in universe_latest]
    cohort_yields = [float(s.rental_yield) for _, s in universe_latest]

    out: List[dict] = []
    for area, history in universe:
        if not history:
            continue
        latest = history[-1]
        report = detect_undervaluation(
            area=area,
            latest=latest,
            history=history,
            cohort_prices=[p for p in cohort_prices if p != float(latest.avg_price_per_sqft)],
            cohort_yields=[y for y in cohort_yields if y != float(latest.rental_yield)],
        )
        if tier and report.tier != tier:
            continue
        confidence = build_confidence_report(area, history)
        out.append(
            {
                **report_to_dict(report),
                "confidence": confidence_to_dict(confidence),
                "snapshot": {
                    "snapshot_date": latest.snapshot_date.isoformat(),
                    "avg_price_per_sqft": float(latest.avg_price_per_sqft),
                    "rental_yield": float(latest.rental_yield),
                    "appreciation_1y": float(latest.appreciation_1y) if latest.appreciation_1y else None,
                    "transaction_volume": latest.transaction_volume,
                    "investment_score": float(latest.investment_score) if latest.investment_score else None,
                },
            }
        )

    out.sort(key=lambda r: r["score"], reverse=True)
    return {"count": len(out[:limit]), "results": out[:limit]}
