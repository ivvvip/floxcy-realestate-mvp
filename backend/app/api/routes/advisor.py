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
from app.models.market_snapshot import MarketSnapshot
from app.redis_client import redis_client
from app.schemas.advisor import AdvisorQueryRequest, AdvisorQueryResponse
from app.services.advisor import build_recommendations
from app.services.market_context import (
    SYSTEM_PROMPT,
    build_market_context,
    build_user_message,
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
    payload = {
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
    # ---- 1. Rules-based recommendations (always computed) ----
    latest_date_subq = (
        select(
            MarketSnapshot.area_id,
            func.max(MarketSnapshot.snapshot_date).label("latest_date"),
        )
        .group_by(MarketSnapshot.area_id)
        .subquery()
    )
    q = (
        select(Area, MarketSnapshot)
        .join(MarketSnapshot, MarketSnapshot.area_id == Area.id)
        .join(
            latest_date_subq,
            (latest_date_subq.c.area_id == MarketSnapshot.area_id)
            & (latest_date_subq.c.latest_date == MarketSnapshot.snapshot_date),
        )
    )
    rows = (await db.execute(q)).all()
    snapshots = [
        {
            "area_id": area.id,
            "area_name": area.name,
            "area_name_arabic": area.name_arabic,
            "avg_price_per_sqft": float(snap.avg_price_per_sqft),
            "rental_yield": float(snap.rental_yield),
            "appreciation_1y": float(snap.appreciation_1y) if snap.appreciation_1y else None,
            "risk_score": float(snap.risk_score) if snap.risk_score else None,
            "investment_score": float(snap.investment_score) if snap.investment_score else None,
        }
        for area, snap in rows
    ]
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

    context = await build_market_context(db, max_areas=20)
    user_msg = build_user_message(
        budget_aed=int(body.budget_aed),
        goal=body.goal,
        risk=body.risk,
        preferred_city=body.preferred_city,
        user_question=body.user_question,
        market_context=context,
    )

    result = await openrouter_chat(
        system=SYSTEM_PROMPT,
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
