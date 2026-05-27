"""Authentication endpoints: login, logout, me."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit import write_audit
from app.core.dependencies import (
    AuthPrincipal,
    get_request_meta,
    require_principal,
)
from app.core.rate_limit import auth_rate_limit_dependency
from app.core.security import create_session_token, verify_password
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, MeResponse

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=settings.JWT_TTL_MINUTES * 60,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        domain=settings.COOKIE_DOMAIN or None,
        path="/",
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    dependencies=[Depends(auth_rate_limit_dependency)],
)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Username/password login. Sets httpOnly JWT cookie on success."""
    ip, ua = get_request_meta(request)
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        await write_audit(
            db,
            actor_label=body.username or "anon",
            action="login_failed",
            ip=ip,
            user_agent=ua,
            status="denied",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    user.last_login_at = datetime.utcnow()
    token = create_session_token(user.id, user.role, user.username)
    _set_session_cookie(response, token)
    await write_audit(
        db,
        actor_user_id=user.id,
        actor_label=user.username,
        action="login",
        ip=ip,
        user_agent=ua,
    )
    await db.commit()
    return LoginResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_principal),
):
    """Clear session cookie."""
    ip, ua = get_request_meta(request)
    response.delete_cookie(
        settings.AUTH_COOKIE_NAME,
        path="/",
        domain=settings.COOKIE_DOMAIN or None,
    )
    await write_audit(
        db,
        actor_user_id=principal.user_id,
        actor_label=principal.label,
        action="logout",
        ip=ip,
        user_agent=ua,
    )
    await db.commit()
    return {"status": "ok"}


@router.get("/me", response_model=MeResponse)
async def me(
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_principal),
):
    """Return the currently authenticated principal (session only)."""
    if principal.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API-key principal has no user record",
        )
    result = await db.execute(select(User).where(User.id == principal.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return MeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )
