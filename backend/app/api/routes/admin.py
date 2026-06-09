"""Admin endpoints — role-gated. Replaces legacy X-Admin-Token mechanism."""
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit
from app.core.dependencies import (
    AuthPrincipal,
    get_request_meta,
    require_admin,
    require_analyst,
)
from app.core.security import generate_api_key, hash_api_key, hash_password
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.auth import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyPublic,
    AuditLogEntry,
    MeResponse,
)
router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# NOTE: POST /api/v1/admin/seed + seed_data.py were removed in Phase 1 — the
# seeded market_snapshots ("World B") is retired; DLD is the only source.


# ---------- Users ----------

@router.get("/users", response_model=list[MeResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: AuthPrincipal = Depends(require_admin),
):
    rows = (await db.execute(select(User).order_by(User.created_at))).scalars().all()
    return [
        MeResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            last_login_at=u.last_login_at,
            created_at=u.created_at,
        )
        for u in rows
    ]


# ---------- API keys ----------

@router.get("/api-keys", response_model=list[ApiKeyPublic])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    _: AuthPrincipal = Depends(require_admin),
):
    rows = (
        await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    ).scalars().all()
    return [
        ApiKeyPublic(
            id=k.id,
            prefix=k.prefix,
            name=k.name,
            tier=k.tier,
            rate_limit_per_min=k.rate_limit_per_min,
            is_active=k.is_active,
            last_used_at=k.last_used_at,
            expires_at=k.expires_at,
            revoked_at=k.revoked_at,
            created_at=k.created_at,
        )
        for k in rows
    ]


@router.post("/api-keys", response_model=ApiKeyCreateResponse, status_code=201)
async def create_api_key(
    body: ApiKeyCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_admin),
):
    if body.tier not in ("free", "pro", "api", "enterprise"):
        raise HTTPException(status_code=400, detail="Unknown tier")
    full_key, prefix = generate_api_key("live")
    rec = ApiKey(
        user_id=principal.user_id,
        name=body.name,
        prefix=prefix,
        key_hash=hash_api_key(full_key),
        tier=body.tier,
        rate_limit_per_min=body.rate_limit_per_min,
        expires_at=body.expires_at,
    )
    db.add(rec)
    await db.flush()
    ip, ua = get_request_meta(request)
    await write_audit(
        db,
        actor_user_id=principal.user_id,
        actor_label=principal.label,
        action="create_api_key",
        target_type="api_key",
        target_id=str(rec.id),
        payload={"prefix": prefix, "tier": body.tier},
        ip=ip,
        user_agent=ua,
    )
    await db.commit()
    return ApiKeyCreateResponse(
        id=rec.id,
        prefix=rec.prefix,
        name=rec.name,
        tier=rec.tier,
        rate_limit_per_min=rec.rate_limit_per_min,
        is_active=rec.is_active,
        last_used_at=rec.last_used_at,
        expires_at=rec.expires_at,
        revoked_at=rec.revoked_at,
        created_at=rec.created_at,
        full_key=full_key,
    )


@router.post("/api-keys/{key_id}/revoke", response_model=ApiKeyPublic)
async def revoke_api_key(
    key_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_admin),
):
    rec = (await db.execute(select(ApiKey).where(ApiKey.id == key_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="API key not found")
    rec.is_active = False
    rec.revoked_at = datetime.utcnow()
    ip, ua = get_request_meta(request)
    await write_audit(
        db,
        actor_user_id=principal.user_id,
        actor_label=principal.label,
        action="revoke_api_key",
        target_type="api_key",
        target_id=str(rec.id),
        payload={"prefix": rec.prefix},
        ip=ip,
        user_agent=ua,
    )
    await db.commit()
    return ApiKeyPublic(
        id=rec.id,
        prefix=rec.prefix,
        name=rec.name,
        tier=rec.tier,
        rate_limit_per_min=rec.rate_limit_per_min,
        is_active=rec.is_active,
        last_used_at=rec.last_used_at,
        expires_at=rec.expires_at,
        revoked_at=rec.revoked_at,
        created_at=rec.created_at,
    )


# ---------- AI analytics ----------

@router.get("/ai-analytics")
async def ai_analytics(
    db: AsyncSession = Depends(get_db),
    _: AuthPrincipal = Depends(require_analyst),
):
    """Aggregate stats on AI advisor usage from the audit log."""
    now = datetime.utcnow()
    cutoffs = {
        "today": now - timedelta(days=1),
        "week": now - timedelta(days=7),
        "month": now - timedelta(days=30),
    }
    rows = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.action == "ai_query")
            .where(AuditLog.created_at >= cutoffs["month"])
            .order_by(AuditLog.created_at.desc())
        )
    ).scalars().all()

    def agg(after: datetime) -> dict:
        relevant = [r for r in rows if r.created_at >= after]
        ok = [r for r in relevant if (r.status or "ok") == "ok"]
        tokens = sum((r.payload or {}).get("total_tokens", 0) or 0 for r in ok)
        cost = sum(float((r.payload or {}).get("cost_usd", 0) or 0) for r in ok)
        latencies = [
            (r.payload or {}).get("latency_ms", 0) or 0 for r in ok
        ]
        avg_latency = round(sum(latencies) / len(latencies)) if latencies else 0
        fallback = sum(1 for r in ok if (r.payload or {}).get("fallback_used"))
        cached = sum(1 for r in ok if (r.payload or {}).get("cached"))
        errors = len(relevant) - len(ok)
        return {
            "queries": len(relevant),
            "successful": len(ok),
            "errors": errors,
            "total_tokens": tokens,
            "total_cost_usd": round(cost, 6),
            "avg_latency_ms": avg_latency,
            "fallback_count": fallback,
            "cached_count": cached,
        }

    # Model usage breakdown
    by_model: dict[str, int] = {}
    for r in rows:
        m = (r.payload or {}).get("model")
        if m:
            by_model[m] = by_model.get(m, 0) + 1

    return {
        "as_of": now.isoformat() + "Z",
        "today": agg(cutoffs["today"]),
        "week": agg(cutoffs["week"]),
        "month": agg(cutoffs["month"]),
        "by_model": dict(sorted(by_model.items(), key=lambda kv: -kv[1])),
    }


# ---------- Audit log ----------

@router.get("/audit-log", response_model=list[AuditLogEntry])
async def list_audit(
    db: AsyncSession = Depends(get_db),
    _: AuthPrincipal = Depends(require_analyst),
    action: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
):
    q = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    if action:
        q = q.where(AuditLog.action == action)
    rows = (await db.execute(q)).scalars().all()
    return [
        AuditLogEntry(
            id=r.id,
            actor_label=r.actor_label,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            payload=r.payload,
            ip=r.ip,
            status=r.status,
            created_at=r.created_at,
        )
        for r in rows
    ]
