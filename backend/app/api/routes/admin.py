"""Admin endpoints — role-gated. Replaces legacy X-Admin-Token mechanism."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, select
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
from app.services.seed_data import seed_snapshots_with_session

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ---------- Re-seed (admin only) ----------

@router.post("/seed", dependencies=[Depends(require_admin)])
async def reseed_market_snapshots(
    request: Request,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_admin),
):
    ip, ua = get_request_meta(request)
    summary = await seed_snapshots_with_session(db)
    await write_audit(
        db,
        actor_user_id=principal.user_id,
        actor_label=principal.label,
        action="seed_market_snapshots",
        target_type="market_snapshots",
        payload=summary,
        ip=ip,
        user_agent=ua,
    )
    await db.commit()
    return {"status": "ok", **summary}


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
