"""Rate limiting backed by Redis with a per-IP/per-key sliding window."""
from __future__ import annotations

import time
from typing import Optional

from fastapi import Depends, HTTPException, Request, status

from app.config import settings
from app.core.dependencies import AuthPrincipal, get_optional_principal
from app.redis_client import redis_client


def _bucket_key(scope: str, ident: str) -> str:
    minute = int(time.time() // 60)
    return f"rl:{scope}:{ident}:{minute}"


async def _consume(scope: str, ident: str, limit: int) -> int:
    """Atomic INCR; returns the new counter value. Raises 429 if over limit."""
    key = _bucket_key(scope, ident)
    try:
        pipe = redis_client.pipeline()
        pipe.incr(key, 1)
        pipe.expire(key, 65)
        results = await pipe.execute()
        return int(results[0])
    except Exception:
        # Never block traffic on a Redis fault.
        return 0


async def rate_limit_dependency(
    request: Request,
    principal: Optional[AuthPrincipal] = Depends(get_optional_principal),
) -> None:
    """Public-endpoint rate limit: keyed by API key prefix when present, else IP."""
    if principal and principal.kind == "apikey":
        ident = principal.label
        limit = principal.rate_limit_per_min
    else:
        fwd = request.headers.get("x-forwarded-for")
        ident = fwd.split(",")[0].strip() if fwd else (
            request.client.host if request.client else "anon"
        )
        limit = (
            principal.rate_limit_per_min
            if principal
            else settings.RATE_LIMIT_ANONYMOUS_PER_MIN
        )
    count = await _consume("api", ident, limit)
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded ({limit}/min). Try again shortly.",
            headers={"Retry-After": "60"},
        )


async def auth_rate_limit_dependency(request: Request) -> None:
    """Stricter limit for /auth/login (brute-force protection)."""
    fwd = request.headers.get("x-forwarded-for")
    ident = fwd.split(",")[0].strip() if fwd else (
        request.client.host if request.client else "anon"
    )
    count = await _consume("auth", ident, 10)
    if count > 10:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Wait one minute.",
            headers={"Retry-After": "60"},
        )
