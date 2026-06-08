"""Opportunity Engine endpoint surface — unified feed.

Surfaces *both* area-derived intelligence signals and broker-submitted
deals under one set of routes, distinguished on the response by ``kind``
(``area_signal`` | ``broker_deal``).

  GET  /api/v1/opportunities                              — unified list (kind=all|signals|deals)
  GET  /api/v1/opportunities/deals/{id}                   — broker-deal detail
  POST /api/v1/opportunities/deals/{id}/request-consultation
  POST /api/v1/opportunities/{area_id}/explain            — lazy structured AI (signal only)
  POST /api/v1/opportunities/recompute                    — admin cache reset
"""
from datetime import datetime, timezone
from statistics import median
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.routes.consultations import _create_lead_and_consultation, SUCCESS_MESSAGE
from app.core.dependencies import AuthPrincipal, require_admin
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.dld import DldArea, DldBuildingDerived
from app.models.investment_opportunity import InvestmentOpportunity
from app.redis_client import redis_client
from app.schemas.consultation import ConsultationOut, ConsultationRequestResponse
from app.schemas.dld import MIN_RELIABLE_SAMPLES, cap_yield
from app.schemas.investor_lead import LeadCreate, LeadOut
from app.schemas.opportunity_deal import DealOut
from app.services.insights import opportunity_explanation
from app.services.opportunity_engine import (
    DldAreaInput,
    attach_nearby,
    build_report_dld,
    report_to_dict,
)


router = APIRouter(
    prefix="/api/v1/opportunities",
    tags=["opportunities"],
    dependencies=[Depends(rate_limit_dependency)],
)


# Real-DLD universe: every area with a median price + meaningful activity
# (≥50 sales+rents), scored entirely from dld_area_metrics +
# dld_area_appreciation + dld_price_history.offplan_pct. Replaces the seeded
# market_snapshots path (World B, retired in Phase 1 / FLOXCY-REPLAN-2026).
_UNIVERSE_SQL = text(
    """
    WITH latest_offplan AS (
        SELECT DISTINCT ON (area_name_norm) area_name_norm, offplan_pct
        FROM dld_price_history
        WHERE offplan_pct IS NOT NULL
        ORDER BY area_name_norm, year DESC
    )
    SELECT a.id::text                       AS area_id,
           a.name_display                   AS name_display,
           a.name_norm                      AS name_norm,
           COALESCE(cur.area_type, 'residential') AS area_type,
           c.area_name_ar                   AS area_name_ar,
           c.latitude                       AS latitude,
           c.longitude                      AS longitude,
           m.median_price_per_sqft          AS median_ppsf,
           m.rental_yield_pct               AS rental_yield_pct,
           COALESCE(m.sales_count, 0)       AS sales_count,
           COALESCE(m.rent_count_2026, 0)   AS rent_count,
           ap.appreciation_1y_pct           AS appr_1y,
           ap.appreciation_3y_pct           AS appr_3y,
           lo.offplan_pct                   AS offplan_pct
    FROM dld_areas a
    JOIN dld_area_metrics m
          ON m.dld_area_id = a.id AND m.period = '2026-ytd'
    LEFT JOIN areas cur                ON cur.id = a.curated_area_id
    LEFT JOIN dld_canonical_areas c    ON lower(c.area_name) = a.name_norm
    LEFT JOIN dld_area_appreciation ap ON ap.area_name_norm = a.name_norm
    LEFT JOIN latest_offplan lo        ON lo.area_name_norm = a.name_norm
    WHERE m.median_price_per_sqft IS NOT NULL
      AND (COALESCE(m.sales_count, 0) + COALESCE(m.rent_count_2026, 0)) >= 50
    """
)


async def _load_universe_dld(db: AsyncSession) -> list[DldAreaInput]:
    """Load the real-DLD scoreable universe (one row per area, all real metrics)."""
    rows = (await db.execute(_UNIVERSE_SQL)).mappings().all()
    out: list[DldAreaInput] = []
    for r in rows:
        sales = int(r["sales_count"] or 0)
        rents = int(r["rent_count"] or 0)
        y = r["rental_yield_pct"]
        # Yield only counts when it clears the reliability gate (≥30 sales &
        # ≥30 rents) and is display-capped — otherwise it's dropped, not faked.
        ry = (
            cap_yield(float(y))
            if (y is not None and sales >= MIN_RELIABLE_SAMPLES and rents >= MIN_RELIABLE_SAMPLES)
            else None
        )
        out.append(
            DldAreaInput(
                area_id=r["area_id"],
                area_name=r["name_display"] or (r["name_norm"] or "").title(),
                area_name_arabic=r["area_name_ar"],
                area_type=r["area_type"] or "residential",
                latitude=float(r["latitude"]) if r["latitude"] is not None else None,
                longitude=float(r["longitude"]) if r["longitude"] is not None else None,
                rental_yield=ry,
                price_per_sqft=float(r["median_ppsf"]) if r["median_ppsf"] is not None else None,
                appreciation_1y=float(r["appr_1y"]) if r["appr_1y"] is not None else None,
                appreciation_3y=float(r["appr_3y"]) if r["appr_3y"] is not None else None,
                sales_count=sales,
                rent_count=rents,
                offplan_pct=float(r["offplan_pct"]) if r["offplan_pct"] is not None else None,
            )
        )
    return out


def _score_all_dld(inputs: list[DldAreaInput]) -> list:
    """Score the DLD universe. Cohort (Dubai) median is taken over the FULL
    price-bearing set, but only areas with at least one real RETURN signal
    (gated yield OR real appreciation) are surfaced as opportunities — a cheap,
    liquid area with neither isn't an investment signal, just a busy market."""
    prices = [i.price_per_sqft for i in inputs if i.price_per_sqft is not None]
    cohort_median = float(median(prices)) if prices else 1500.0
    scoreable = [
        i for i in inputs
        if i.rental_yield is not None or i.appreciation_1y is not None
    ]
    return [build_report_dld(i, cohort_median) for i in scoreable]


async def _resolve_dld_area_id(db: AsyncSession, area_id: UUID) -> Optional[str]:
    """Map a curated Area.id OR a dld_areas.id to the dld_areas.id used as the
    opportunity report key. Curated areas link via dld_areas.curated_area_id."""
    via_curated = (
        await db.execute(
            select(DldArea.id).where(DldArea.curated_area_id == area_id)
        )
    ).scalar_one_or_none()
    if via_curated:
        return str(via_curated)
    direct = (
        await db.execute(select(DldArea.id).where(DldArea.id == area_id))
    ).scalar_one_or_none()
    return str(direct) if direct else None


def _deal_to_card(d: InvestmentOpportunity) -> dict:
    """Serialize a broker-submitted deal into a card shape parallel to the
    area-signal card. Frontend branches on ``kind``."""
    score = float(d.opportunity_score) if d.opportunity_score is not None else 0.0
    return {
        "kind": "broker_deal",
        "id": str(d.id),
        "title": d.title,
        "area_name": d.area,
        "emirate": d.emirate,
        "price": float(d.price),
        "property_type": d.property_type,
        "unit_type": d.unit_type,
        "rental_yield": d.expected_gross_yield,
        "expected_net_yield": d.expected_net_yield,
        "opportunity_score": score,
        "strategy": d.strategy_type,
        "risk_level": d.risk_level,
        "confidence_score": d.confidence_score,
        "why_short": (d.why_opportunity or "")[:200],
        "source_type": d.source_type,
        "broker": {
            "id": str(d.broker.id),
            "full_name": d.broker.full_name,
            "company_name": d.broker.company_name,
        }
        if d.broker
        else None,
    }


@router.get("")
async def list_opportunities(
    db: AsyncSession = Depends(get_db),
    kind: str = Query(
        default="all",
        pattern="^(all|signals|deals)$",
        description="all=merged feed, signals=area-derived only, deals=broker-submitted only",
    ),
    type: Optional[str] = Query(default=None, description="Signal-only: opportunity_type"),
    area: Optional[str] = Query(default=None, description="Deal-only: case-insensitive area substring"),
    strategy: Optional[str] = Query(default=None, description="Deal-only: strategy_type"),
    category: Optional[str] = Query(
        default=None,
        description=(
            "Comma-separated property_category list. When set, returns only "
            "opportunities whose area has ≥1 building in the selected "
            "category set (dld_buildings_derived). Mixed-use areas appear in "
            "every category they host."
        ),
    ),
    min_score: int = Query(default=0, ge=0, le=100),
    limit: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="score", description="score|yield|appreciation"),
):
    """Unified opportunity feed.

    Returns a single list mixing two ``kind`` values:
      - ``area_signal`` — computed by ``opportunity_engine`` (no broker).
      - ``broker_deal`` — broker-submitted, approved by admin.

    Response shape::

      {
        "opportunities": [{kind, ...}, ...],
        "total": <count after filters, pre-limit>,
        "generated_at": "<ISO>",
        "methodology_link": "/methodology"
      }
    """
    items: list[dict] = []

    # ---- Category filter: pre-compute the set of areas that have buildings
    # in the requested category set. Mixed-use areas appear in every
    # category they host (no scoring change — see Step 7 spec). ----
    allowed_dld_area_ids: Optional[set[str]] = None
    allowed_area_name_norms: Optional[set[str]] = None
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        if cats:
            # Join dld_buildings_derived → dld_areas. Area signals now key on
            # dld_areas.id (DLD-native); broker deals match by area name.
            stmt = (
                select(DldArea.id, DldArea.name_norm)
                .join(
                    DldBuildingDerived,
                    DldBuildingDerived.dld_area_id == DldArea.id,
                )
                .where(DldBuildingDerived.property_category.in_(cats))
                .distinct()
            )
            rows = (await db.execute(stmt)).all()
            allowed_dld_area_ids = {str(r[0]) for r in rows if r[0] is not None}
            allowed_area_name_norms = {r[1] for r in rows if r[1]}

    # ---- Area signals (real DLD universe) ----
    if kind in ("all", "signals"):
        inputs = await _load_universe_dld(db)
        if inputs:
            reports = _score_all_dld(inputs)
            # attach_nearby reads .latitude/.longitude — DldAreaInput carries
            # both (sourced from dld_canonical_areas).
            attach_nearby(reports, {i.area_id: i for i in inputs}, k=3)
            filtered = [r for r in reports if r.opportunity_score >= min_score]
            if type:
                filtered = [r for r in filtered if r.opportunity_type == type]
            if allowed_dld_area_ids is not None:
                filtered = [
                    r for r in filtered if str(r.area_id) in allowed_dld_area_ids
                ]
            for r in filtered:
                signal = report_to_dict(r)
                signal["kind"] = "area_signal"
                items.append(signal)

    # ---- Broker deals ----
    if kind in ("all", "deals"):
        stmt = (
            select(InvestmentOpportunity)
            .where(InvestmentOpportunity.status == "approved")
            .options(selectinload(InvestmentOpportunity.broker))
            .order_by(InvestmentOpportunity.created_at.desc())
        )
        if area:
            stmt = stmt.where(InvestmentOpportunity.area.ilike(f"%{area}%"))
        if strategy:
            stmt = stmt.where(InvestmentOpportunity.strategy_type == strategy)
        deals = (await db.execute(stmt)).scalars().all()
        for d in deals:
            score = float(d.opportunity_score) if d.opportunity_score is not None else 0.0
            if score < min_score:
                continue
            if allowed_area_name_norms is not None:
                # Broker deals have a free-text area field — match
                # case-insensitively against the resolved name_norms.
                deal_area_norm = (d.area or "").strip().lower()
                if deal_area_norm not in allowed_area_name_norms:
                    continue
            items.append(_deal_to_card(d))

    # ---- Sort across the merged set ----
    def _yield_key(item: dict) -> float:
        if item["kind"] == "area_signal":
            km = item.get("key_metrics") or {}
            return float(km.get("rental_yield") or 0.0)
        return float(item.get("rental_yield") or 0.0)

    def _appr_key(item: dict) -> float:
        if item["kind"] == "area_signal":
            km = item.get("key_metrics") or {}
            return float(km.get("appreciation_1y") or 0.0)
        return 0.0

    key_map = {
        "score": lambda x: float(x.get("opportunity_score") or 0.0),
        "yield": _yield_key,
        "appreciation": _appr_key,
    }
    items.sort(key=key_map.get(sort_by, key_map["score"]), reverse=True)

    return {
        "opportunities": items[:limit],
        "total": len(items),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "methodology_link": "/methodology",
    }


# ---- Broker-deal detail + consultation request ----


@router.get("/deals/{deal_id}", response_model=DealOut)
async def get_deal(deal_id: UUID, db: AsyncSession = Depends(get_db)):
    """Broker-deal detail (only approved deals are visible publicly)."""
    deal = (
        await db.execute(
            select(InvestmentOpportunity)
            .where(InvestmentOpportunity.id == deal_id)
            .where(InvestmentOpportunity.status == "approved")
            .options(selectinload(InvestmentOpportunity.broker))
        )
    ).scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post(
    "/deals/{deal_id}/request-consultation",
    response_model=ConsultationRequestResponse,
    status_code=201,
)
async def request_deal_consultation(
    deal_id: UUID,
    payload: LeadCreate,
    db: AsyncSession = Depends(get_db),
):
    """Investor requests a consultation tied to a specific broker deal.

    Lead + Consultation are created and assigned to the deal's broker.
    """
    deal = (
        await db.execute(
            select(InvestmentOpportunity)
            .where(InvestmentOpportunity.id == deal_id)
            .where(InvestmentOpportunity.status == "approved")
        )
    ).scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    # Path-derived opportunity_id wins over any body-supplied value.
    payload.opportunity_id = deal.id
    lead, consultation = await _create_lead_and_consultation(db, payload, deal)
    return ConsultationRequestResponse(
        message=SUCCESS_MESSAGE,
        lead=LeadOut.model_validate(lead),
        consultation=ConsultationOut.model_validate(consultation),
    )


@router.post("/{area_id}/explain")
async def explain_opportunity(
    area_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Lazy LLM-generated structured explanation. Cached 24h per (area, score, type).

    Returns {why, risks, best_for, strategy, model, tokens, cached}. If the LLM
    call fails, returns the rules-based fallback from the engine."""
    inputs = await _load_universe_dld(db)
    target_id = await _resolve_dld_area_id(db, area_id)
    inp = next((i for i in inputs if i.area_id == target_id), None)
    if inp is None:
        raise HTTPException(status_code=404, detail="No DLD data for area")
    prices = [i.price_per_sqft for i in inputs if i.price_per_sqft is not None]
    cohort = float(median(prices)) if prices else 1500.0
    report = build_report_dld(inp, cohort)

    structured = await opportunity_explanation(
        area_id=inp.area_id,
        area_name=inp.area_name,
        opportunity_score=report.opportunity_score,
        opportunity_type=report.opportunity_type,
        rental_yield=report.key_metrics.rental_yield,
        price_per_sqft=report.key_metrics.price_per_sqft,
        appreciation_1y=report.key_metrics.appreciation_1y,
        risk_score=report.key_metrics.risk_score,
        demand_score=report.key_metrics.demand_score,
        transaction_volume=report.key_metrics.transaction_volume,
        cohort_median_price=cohort,
        why_rules=report.why,
        risks_rules=report.risks,
    )

    if structured is None:
        # Fallback to rules-based fields already in the report
        return {
            "area_id": inp.area_id,
            "area_name": inp.area_name,
            "why": report.why,
            "risks": report.risks,
            "best_for": report.best_for,
            "strategy": report.strategy,
            "model": None,
            "tokens": 0,
            "cached": False,
            "fallback_used": True,
        }

    return {"area_id": inp.area_id, "area_name": inp.area_name, **structured}


@router.post("/recompute")
async def recompute(
    db: AsyncSession = Depends(get_db),
    _: AuthPrincipal = Depends(require_admin),
):
    """Admin: clear all Opportunity Engine LLM caches.

    Forces fresh AI explanations on next request. Snapshot data is untouched.
    """
    cleared = 0
    try:
        # Scan and delete all opportunity-explanation cache keys
        async for key in redis_client.scan_iter(match="ai:opp_explain:*", count=200):
            await redis_client.delete(key)
            cleared += 1
    except Exception:
        pass
    return {
        "status": "ok",
        "cleared_keys": cleared,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
