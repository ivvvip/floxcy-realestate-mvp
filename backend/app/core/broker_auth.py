"""Broker authentication — separate token surface from User/admin auth.

Broker tokens are JWTs with ``kind=broker`` in the payload, issued by
``POST /api/v1/broker/login`` and verified via the
``Authorization: Bearer <token>`` header on broker-self routes.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.broker import Broker


BROKER_TOKEN_KIND = "broker"


def create_broker_token(broker_id: UUID, email: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_TTL_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(broker_id),
        "email": email,
        "kind": BROKER_TOKEN_KIND,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "iss": "floxcy",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_broker_token(token: str) -> Optional[dict[str, Any]]:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            issuer="floxcy",
        )
    except jwt.PyJWTError:
        return None
    if payload.get("kind") != BROKER_TOKEN_KIND:
        return None
    return payload


async def require_broker(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> Broker:
    """Resolve the calling broker from a Bearer token.

    Raises 401 if no/invalid token, 403 if the broker exists but is not in
    ``approved`` status (suspended / rejected / still pending).
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_broker_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    try:
        broker_id = UUID(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    res = await db.execute(select(Broker).where(Broker.id == broker_id))
    broker = res.scalar_one_or_none()
    if not broker:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Broker not found")
    if broker.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Broker status is '{broker.status}' — login disabled",
        )
    return broker


def generate_temp_password(length: int = 14) -> str:
    """One-time temporary password handed off to admins after approval."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))
