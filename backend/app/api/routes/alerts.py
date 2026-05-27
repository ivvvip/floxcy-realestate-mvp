"""Investor alerts — anonymous sessions or logged-in users."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    AuthPrincipal,
    get_optional_principal,
)
from app.core.rate_limit import rate_limit_dependency
from app.core.security import generate_session_id
from app.database import get_db
from app.models.alert import Alert
from app.models.area import Area
from app.schemas.alert import ALERT_TYPES, AlertCreateRequest, AlertOut

router = APIRouter(
    prefix="/api/v1/alerts",
    tags=["alerts"],
    dependencies=[Depends(rate_limit_dependency)],
)

ANON_COOKIE = "floxcy_anon"


def _ensure_session_cookie(response: Response, current: Optional[str]) -> str:
    if current:
        return current
    new_sid = generate_session_id()
    response.set_cookie(
        ANON_COOKIE,
        new_sid,
        max_age=60 * 60 * 24 * 365,  # 1 year
        httponly=True,
        samesite="lax",
        path="/",
    )
    return new_sid


async def _to_out(db: AsyncSession, a: Alert) -> AlertOut:
    area_name: Optional[str] = None
    if a.area_id:
        result = await db.execute(select(Area.name).where(Area.id == a.area_id))
        area_name = result.scalar_one_or_none()
    return AlertOut(
        id=a.id,
        type=a.type,
        type_label=ALERT_TYPES.get(a.type, a.type),
        area_id=a.area_id,
        area_name=area_name,
        params=a.params or {},
        is_active=a.is_active,
        last_fired_at=a.last_fired_at,
        last_value=a.last_value,
        delivery=a.delivery,
        created_at=a.created_at,
    )


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    response: Response,
    db: AsyncSession = Depends(get_db),
    principal: Optional[AuthPrincipal] = Depends(get_optional_principal),
    floxcy_anon: Optional[str] = Cookie(default=None),
):
    """List alerts for the calling principal (or anonymous session)."""
    sid = _ensure_session_cookie(response, floxcy_anon)
    if principal and principal.user_id:
        q = select(Alert).where(Alert.user_id == principal.user_id)
    else:
        q = select(Alert).where(Alert.session_id == sid)
    rows = (await db.execute(q.order_by(Alert.created_at.desc()))).scalars().all()
    return [await _to_out(db, a) for a in rows]


@router.post("", response_model=AlertOut, status_code=status.HTTP_201_CREATED)
async def create_alert(
    body: AlertCreateRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    principal: Optional[AuthPrincipal] = Depends(get_optional_principal),
    floxcy_anon: Optional[str] = Cookie(default=None),
):
    if body.type not in ALERT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown alert type. Valid: {sorted(ALERT_TYPES)}",
        )
    sid = _ensure_session_cookie(response, floxcy_anon)
    alert = Alert(
        type=body.type,
        area_id=body.area_id,
        params=body.params or {},
        delivery=body.delivery,
        user_id=principal.user_id if principal and principal.user_id else None,
        session_id=sid if not (principal and principal.user_id) else None,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return await _to_out(db, alert)


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    principal: Optional[AuthPrincipal] = Depends(get_optional_principal),
    floxcy_anon: Optional[str] = Cookie(default=None),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    # Ownership check
    if principal and principal.user_id:
        if alert.user_id != principal.user_id:
            raise HTTPException(status_code=403, detail="Not your alert")
    else:
        sid = _ensure_session_cookie(response, floxcy_anon)
        if alert.session_id != sid:
            raise HTTPException(status_code=403, detail="Not your alert")
    await db.delete(alert)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/types")
async def alert_types() -> dict:
    return {"types": ALERT_TYPES}
