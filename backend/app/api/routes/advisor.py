"""AI Investment Analyst — rules-based + LLM-augmented."""
import hashlib
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit import write_audit
from app.core.dependencies import (
    AuthPrincipal,
    get_optional_principal,
    get_request_meta,
)
from app.core.rate_limit import ai_rate_limit_dependency
from app.database import get_db
from app.models.area import Area
from app.models.dld import (
    DldArea,
    DldAreaAppreciation,
    DldAreaMetrics,
    DldPriceHistory,
)
from app.redis_client import redis_client
from app.schemas.advisor import AdvisorQueryRequest, AdvisorQueryResponse
from app.schemas.dld import MIN_RELIABLE_SAMPLES, cap_yield
from app.services.advisor import build_recommendations, classify_supply_risk
from app.services.dld_market_context import (
    DLD_SYSTEM_PROMPT,
    build_dld_market_context,
    build_dld_user_message,
)
from app.services.openrouter_service import chat as openrouter_chat


logger = logging.getLogger("floxcy.advisor")

router = APIRouter(
    prefix="/api/v1/advisor",
    tags=["advisor"],
    dependencies=[Depends(ai_rate_limit_dependency)],
)


def _budget_bucket(aed: float) -> str:
    """Snap budget to a coarse bucket so cache hits cluster nearby queries."""
    if aed < 500_000:
        return "lt500k"
    if aed < 1_000_000:
        return "500k-1m"
    if aed < 2_000_000:
        return "1-2m"
    if aed < 5_000_000:
        return "2-5m"
    if aed < 10_000_000:
        return "5-10m"
    return "10m+"


def _cache_key(model: str, req: AdvisorQueryRequest) -> str:
    # Bumped to v2 when we switched to DLD-grounded context — invalidates any
    # cached responses that were generated against the old curated-snapshot
    # prompt so they don't shadow the new richer answers.
    payload = {
        "v": 2,
        "m": model,
        "b": _budget_bucket(req.budget_aed),
        "g": req.goal,
        "r": req.risk,
        "c": (req.preferred_city or "").lower().strip(),
        "q": (req.user_question or "").strip().lower(),
    }
    blob = json.dumps(payload, sort_keys=True).encode()
    return "ai:advisor:" + hashlib.sha256(blob).hexdigest()


def _confidence_from_content(content: str, fallback_used: bool) -> float:
    """Rough heuristic for the model's self-confidence based on output shape."""
    if fallback_used:
        return 0.55
    if not content:
        return 0.0
    sections = sum(content.lower().count(s) for s in ("## ", "**"))
    base = 0.7 + min(0.2, sections * 0.02)
    if "not financial advice" in content.lower():
        base += 0.03
    return round(min(0.95, base), 2)


@router.post("/query", response_model=AdvisorQueryResponse)
async def advisor_query(
    body: AdvisorQueryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    principal: Optional[AuthPrincipal] = Depends(get_optional_principal),
):
    """Rank areas by goal/risk, then augment with an LLM-generated analysis.

    The rules-based `recommendations[]` field is ALWAYS populated, so the
    response is useful even when the LLM call fails."""
    # ---- 1. Rules-based recommendations (real DLD only; World B retired) ----
    # Rank curated areas that have a reliable gated DLD yield, sourced entirely
    # from dld_area_metrics + appreciation + latest-year price-history off-plan
    # share. risk/investment_score come from the same engine as /opportunities.
    from app.api.routes.opportunities import _load_universe_dld, _score_all_dld
    reports = {r.area_id: r for r in _score_all_dld(await _load_universe_dld(db))}

    latest_year_subq = (
        select(
            DldPriceHistory.dld_area_id,
            func.max(DldPriceHistory.year).label("latest_year"),
        )
        .where(DldPriceHistory.dld_area_id.is_not(None))
        .group_by(DldPriceHistory.dld_area_id)
        .subquery()
    )
    q = (
        select(Area, DldArea, DldAreaMetrics, DldAreaAppreciation, DldPriceHistory)
        .join(DldArea, DldArea.curated_area_id == Area.id)
        .join(
            DldAreaMetrics,
            (DldAreaMetrics.dld_area_id == DldArea.id)
            & (DldAreaMetrics.period == "2026-ytd"),
        )
        .outerjoin(DldAreaAppreciation, DldAreaAppreciation.dld_area_id == DldArea.id)
        .outerjoin(latest_year_subq, latest_year_subq.c.dld_area_id == DldArea.id)
        .outerjoin(
            DldPriceHistory,
            (DldPriceHistory.dld_area_id == DldArea.id)
            & (DldPriceHistory.year == latest_year_subq.c.latest_year),
        )
        .where(DldAreaMetrics.median_price_per_sqft.isnot(None))
    )
    rows = (await db.execute(q)).all()
    snapshots = []
    for area, dld_obj, dld, appr, ph in rows:
        ppsf = float(dld.median_price_per_sqft)
        # Require a reliable gated yield — the advisor ranks on income/growth.
        if not (dld.rental_yield_pct is not None
                and (dld.sales_count or 0) >= MIN_RELIABLE_SAMPLES
                and (dld.rent_count_2026 or 0) >= MIN_RELIABLE_SAMPLES):
            continue
        yld = cap_yield(float(dld.rental_yield_pct))
        if yld is None:
            continue
        gross_yield_pct = yld
        rent_growth = float(dld.rent_growth_yoy_pct) if dld.rent_growth_yoy_pct is not None else None

        appr_1y = float(appr.appreciation_1y_pct) if appr and appr.appreciation_1y_pct is not None else None
        appr_5y_pct: Optional[float] = None
        cagr_5y_pct: Optional[float] = None
        if appr is not None and (appr.years_of_data or 0) >= 4:
            if appr.appreciation_5y_pct is not None:
                appr_5y_pct = float(appr.appreciation_5y_pct)
            if appr.cagr_5y_pct is not None:
                cagr_5y_pct = float(appr.cagr_5y_pct)

        supply_risk = None
        supply_offplan_pct: Optional[float] = None
        dld_year_latest: Optional[int] = None
        if ph is not None and (ph.transaction_count or 0) >= MIN_RELIABLE_SAMPLES:
            if ph.offplan_pct is not None:
                supply_offplan_pct = float(ph.offplan_pct)
                supply_risk = classify_supply_risk(supply_offplan_pct)
            dld_year_latest = int(ph.year)

        rep = reports.get(str(dld_obj.id))
        snapshots.append({
            "area_id": area.id,
            "area_name": area.name,
            "area_name_arabic": area.name_arabic,
            "avg_price_per_sqft": ppsf,
            "rental_yield": yld,
            "appreciation_1y": appr_1y,
            "risk_score": rep.key_metrics.risk_score if rep else None,
            "investment_score": rep.key_metrics.investment_score if rep else None,
            # ---- DLD-grounded signals ----
            "gross_yield_pct": gross_yield_pct,
            "rent_growth_yoy_pct": rent_growth,
            "appreciation_5y_pct": appr_5y_pct,
            "cagr_5y_pct": cagr_5y_pct,
            "supply_risk": supply_risk,
            "supply_risk_offplan_pct": supply_offplan_pct,
            "dld_year_latest": dld_year_latest,
        })
    base = build_recommendations(body, snapshots)

    # ---- 2. LLM augmentation (cached + fallback-safe) ----
    response = AdvisorQueryResponse(
        goal=base.goal,
        risk=base.risk,
        budget_aed=base.budget_aed,
        recommendations=base.recommendations,
    )

    # Cache lookup (admin can bypass with fresh=true)
    fresh = body.fresh and principal is not None and principal.role == "admin"
    model = settings.OPENROUTER_DEFAULT_MODEL
    ck = _cache_key(model, body)
    cached_blob: Optional[str] = None
    if not fresh:
        try:
            cached_blob = await redis_client.get(ck)
        except Exception:
            cached_blob = None

    if cached_blob:
        try:
            payload = json.loads(cached_blob)
            response.analysis = payload.get("analysis")
            response.model_used = payload.get("model_used")
            response.tokens_used = payload.get("tokens_used")
            response.cost_usd = payload.get("cost_usd")
            response.latency_ms = payload.get("latency_ms")
            response.confidence_score = payload.get("confidence_score")
            response.fallback_used = bool(payload.get("fallback_used"))
            response.cached = True
            return response
        except Exception:
            pass  # fall through and call live

    # No cache → call OpenRouter
    if not settings.OPENROUTER_API_KEY:
        # Rules-based only is the contract here.
        response.ai_error = "LLM disabled (OPENROUTER_API_KEY unset)"
        return response

    # DLD-grounded context (cached 1hr in Redis as ai:advisor:context:v2)
    context = await build_dld_market_context(db, max_areas=25)
    user_msg = build_dld_user_message(
        budget_aed=int(body.budget_aed),
        goal=body.goal,
        risk=body.risk,
        preferred_city=body.preferred_city,
        user_question=body.user_question,
        market_context=context,
    )

    result = await openrouter_chat(
        system=DLD_SYSTEM_PROMPT,
        user=user_msg,
        max_tokens=settings.OPENROUTER_MAX_TOKENS,
        temperature=0.3,
    )

    ip, ua = get_request_meta(request)

    if not result.ok:
        # Rules-based already in response.recommendations — augment with error context
        response.ai_error = result.error or "LLM call failed"
        response.model_used = result.model
        response.fallback_used = True
        response.latency_ms = result.latency_ms
        await write_audit(
            db,
            actor_user_id=principal.user_id if principal else None,
            actor_label=principal.label if principal else "anon",
            action="ai_query",
            target_type="advisor",
            payload={
                "ok": False,
                "model": result.model,
                "error": result.error,
                "latency_ms": result.latency_ms,
                "goal": body.goal,
                "risk": body.risk,
                "question": (body.user_question or "")[:200],
                "fallback_used": True,
            },
            ip=ip,
            user_agent=ua,
            status="error",
        )
        await db.commit()
        return response

    response.analysis = result.content
    response.model_used = result.model
    response.tokens_used = result.total_tokens
    response.cost_usd = result.cost_usd
    response.latency_ms = result.latency_ms
    response.fallback_used = result.fallback_used
    response.confidence_score = _confidence_from_content(
        result.content, result.fallback_used
    )

    # Cache success
    try:
        cache_payload = json.dumps(
            {
                "analysis": response.analysis,
                "model_used": response.model_used,
                "tokens_used": response.tokens_used,
                "cost_usd": response.cost_usd,
                "latency_ms": response.latency_ms,
                "confidence_score": response.confidence_score,
                "fallback_used": response.fallback_used,
            }
        )
        await redis_client.setex(ck, settings.OPENROUTER_CACHE_TTL_S, cache_payload)
    except Exception:
        pass

    await write_audit(
        db,
        actor_user_id=principal.user_id if principal else None,
        actor_label=principal.label if principal else "anon",
        action="ai_query",
        target_type="advisor",
        payload={
            "ok": True,
            "model": result.model,
            "prompt_tokens": result.prompt_tokens,
            "completion_tokens": result.completion_tokens,
            "total_tokens": result.total_tokens,
            "cost_usd": result.cost_usd,
            "latency_ms": result.latency_ms,
            "fallback_used": result.fallback_used,
            "goal": body.goal,
            "risk": body.risk,
            "question": (body.user_question or "")[:200],
            "cached": False,
        },
        ip=ip,
        user_agent=ua,
    )
    await db.commit()
    return response
