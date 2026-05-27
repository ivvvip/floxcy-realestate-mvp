"""FastAPI dependencies for auth + RBAC + audit + rate limiting."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import (
    decode_session_token,
    extract_prefix,
    verify_api_key,
)
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User


ROLE_HIERARCHY = {"viewer": 0, "analyst": 1, "admin": 2}


@dataclass
class AuthPrincipal:
    """The authenticated caller — either a user session or an API key."""

    kind: str  # "session" | "apikey"
    role: str
    label: str
    user_id: Optional[UUID]
    api_key_id: Optional[UUID]
    tier: str  # subscription tier
    rate_limit_per_min: int


def _tier_rate_limit(tier: str) -> int:
    return {
        "free": settings.RATE_LIMIT_FREE_TIER_PER_MIN,
        "pro": settings.RATE_LIMIT_PRO_TIER_PER_MIN,
        "api": settings.RATE_LIMIT_API_TIER_PER_MIN,
        "enterprise": settings.RATE_LIMIT_ENTERPRISE_PER_MIN,
    }.get(tier, settings.RATE_LIMIT_FREE_TIER_PER_MIN)


async def get_optional_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[AuthPrincipal]:
    """Return session principal if a valid JWT cookie is present, else None."""
    cookie = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not cookie:
        return None
    payload = decode_session_token(cookie)
    if not payload:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        user_id = UUID(sub)
    except (ValueError, TypeError):
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return None
    return AuthPrincipal(
        kind="session",
        role=user.role,
        label=user.username,
        user_id=user.id,
        api_key_id=None,
        tier="enterprise",
        rate_limit_per_min=settings.RATE_LIMIT_ENTERPRISE_PER_MIN,
    )


async def get_optional_apikey(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> Optional[AuthPrincipal]:
    """Return apikey principal if a valid X-API-Key header is present, else None."""
    if not x_api_key:
        return None
    prefix = extract_prefix(x_api_key)
    if not prefix:
        return None
    result = await db.execute(select(ApiKey).where(ApiKey.prefix == prefix))
    rec = result.scalar_one_or_none()
    if not rec or not rec.is_active or rec.revoked_at is not None:
        return None
    if not verify_api_key(x_api_key, rec.key_hash):
        return None
    rate = rec.rate_limit_per_min or _tier_rate_limit(rec.tier)
    return AuthPrincipal(
        kind="apikey",
        role="api",
        label=f"apikey:{prefix}",
        user_id=rec.user_id,
        api_key_id=rec.id,
        tier=rec.tier,
        rate_limit_per_min=rate,
    )


async def get_optional_principal(
    session: Optional[AuthPrincipal] = Depends(get_optional_session),
    api: Optional[AuthPrincipal] = Depends(get_optional_apikey),
) -> Optional[AuthPrincipal]:
    return session or api


async def require_principal(
    principal: Optional[AuthPrincipal] = Depends(get_optional_principal),
) -> AuthPrincipal:
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


def require_role(min_role: str):
    """Dependency factory: require principal with at least the given role."""
    threshold = ROLE_HIERARCHY.get(min_role, 99)

    async def _dep(
        principal: AuthPrincipal = Depends(require_principal),
    ) -> AuthPrincipal:
        if ROLE_HIERARCHY.get(principal.role, -1) < threshold:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{min_role}' or higher required",
            )
        return principal

    return _dep


# Convenience role deps
require_viewer = require_role("viewer")
require_analyst = require_role("analyst")
require_admin = require_role("admin")


def get_request_meta(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Returns (client_ip, user_agent) for audit logging."""
    # Honor first proxy hop if behind Coolify/Traefik
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)
    ua = request.headers.get("user-agent")
    return ip, (ua[:255] if ua else None)
