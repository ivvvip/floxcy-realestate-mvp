"""Market-level + per-area AI insight endpoints (P2) — real DLD only.

World B retired: every input comes from the same DLD universe + scoring as
/opportunities (no seeded market_snapshots).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import ai_rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.dld import DldArea
from app.data.dld_area_aliases import cadastral_data_norm
from app.services.insights import (
    compute_trends,
    market_brief,
    structured_area_insight,
)
from app.api.routes.opportunities import (
    _load_universe_dld,
    _score_all_dld,
    _resolve_dld_area_id,
)

router = APIRouter(
    prefix="/api/v1/insights",
    tags=["insights"],
    dependencies=[Depends(ai_rate_limit_dependency)],
)


@router.get("/market-brief")
async def get_market_brief(db: AsyncSession = Depends(get_db)) -> dict:
    """3-5 LLM-generated bullets summarizing today's UAE market. Cached daily."""
    reports = _score_all_dld(await _load_universe_dld(db))
    if not reports:
        raise HTTPException(status_code=503, detail="No data")

    yields = [r.key_metrics.rental_yield for r in reports if r.key_metrics.rental_yield is not None]
    prices = [r.key_metrics.price_per_sqft for r in reports if r.key_metrics.price_per_sqft is not None]
    avg_yield = sum(yields) / len(yields) if yields else 0.0
    avg_price = sum(prices) / len(prices) if prices else 0.0

    opps = sorted(
        [
            {
                "name": r.area_name,
                "score": r.opportunity_score,
                "tier": r.opportunity_type,
                "yield": r.key_metrics.rental_yield,
                "price": r.key_metrics.price_per_sqft,
            }
            for r in reports
        ],
        key=lambda x: x["score"],
        reverse=True,
    )
    movers = sorted(
        [
            {"name": r.area_name, "metric": "1Y appreciation",
             "change_pct": float(r.key_metrics.appreciation_1y)}
            for r in reports
            if r.key_metrics.appreciation_1y is not None
        ],
        key=lambda m: m["change_pct"],
        reverse=True,
    )

    payload = await market_brief(
        avg_yield=avg_yield,
        avg_price_per_sqft=avg_price,
        total_areas=len(reports),
        top_opportunities=opps[:5],
        top_movers=movers[:5],
    )
    if payload is None:
        return {
            "as_of": "",
            "brief": [
                {
                    "headline": f"{m['name']} leads 1Y appreciation",
                    "body": f"{m['name']} posted {m['change_pct']:+.2f}% appreciation in the last 12 months.",
                    "area_name": m["name"],
                }
                for m in movers[:3]
            ],
            "model": None,
            "tokens": 0,
            "cached": False,
            "fallback_used": True,
        }
    return payload


@router.get("/area/{area_id}")
async def get_area_insight(area_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Structured insight for one area. Cached 24h per (area, score, tier)."""
    area = (await db.execute(select(Area).where(Area.id == area_id))).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    dld_id = await _resolve_dld_area_id(db, area_id)
    reports = {r.area_id: r for r in _score_all_dld(await _load_universe_dld(db))}
    report = reports.get(dld_id) if dld_id else None
    if report is None:
        raise HTTPException(status_code=404, detail="No DLD data for area")
    km = report.key_metrics

    payload = await structured_area_insight(
        area_id=str(area_id),
        area_name=area.name,
        rental_yield=km.rental_yield,
        price_per_sqft=km.price_per_sqft,
        appreciation_1y=km.appreciation_1y,
        appreciation_3y=km.appreciation_3y,
        risk_score=km.risk_score,
        demand_score=km.demand_score,
        occupancy=None,
        transaction_volume=km.transaction_volume,
        score=report.opportunity_score,
        tier=report.opportunity_type,
    )
    if payload is None:
        raise HTTPException(status_code=503, detail="Insight unavailable")
    return {
        "area_id": str(area_id),
        "area_name": area.name,
        "opportunity_score": report.opportunity_score,
        "opportunity_type": report.opportunity_type,
        **payload,
    }


@router.get("/trends")
async def get_trends(db: AsyncSession = Depends(get_db)) -> dict:
    """Movers + LLM narrative from the real DLD yearly series. Cached 24h."""
    reports = _score_all_dld(await _load_universe_dld(db))
    # DLD yearly price⋈yield history grouped by cadastral name (one query).
    hist_rows = (
        await db.execute(
            text(
                """
                SELECT p.area_name_norm AS norm, p.year AS year,
                       p.avg_ppsf_all AS ppsf, y.gross_yield_pct AS gy,
                       p.transaction_count AS tc
                FROM dld_price_history p
                LEFT JOIN dld_yield_history y
                       ON y.area_name_norm = p.area_name_norm AND y.year = p.year
                WHERE p.avg_ppsf_all IS NOT NULL
                ORDER BY p.area_name_norm, p.year
                """
            )
        )
    ).mappings().all()
    by_norm: dict[str, list[dict]] = {}
    for h in hist_rows:
        by_norm.setdefault(h["norm"], []).append({
            "avg_price_per_sqft": float(h["ppsf"]),
            "rental_yield": float(h["gy"]) if h["gy"] is not None else 0.0,
            "transaction_volume": int(h["tc"] or 0),
        })

    # Map each scored area (dld_area.id) → its cadastral name_norm for history.
    id_to_norm = {
        str(i): n for i, n in
        (await db.execute(select(DldArea.id, DldArea.name_norm))).all()
    }
    universe: list[dict] = []
    for r in reports:
        own = id_to_norm.get(r.area_id)
        if not own:
            continue
        hist = by_norm.get(cadastral_data_norm(own))
        if not hist:
            continue
        universe.append({"area_id": r.area_id, "name": r.area_name, "history": hist})
    return await compute_trends(universe=universe)
