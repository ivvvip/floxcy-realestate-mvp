"""Page-level user feedback — public submit + admin list."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.user_feedback import UserFeedback


class FeedbackCreate(BaseModel):
    page_url: Optional[str] = Field(default=None, max_length=512)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    looking_for: Optional[str] = Field(default=None, max_length=2000)
    missing: Optional[str] = Field(default=None, max_length=2000)
    email: Optional[EmailStr] = None


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    page_url: Optional[str]
    rating: Optional[int]
    looking_for: Optional[str]
    missing: Optional[str]
    email: Optional[str]
    user_agent: Optional[str]
    created_at: datetime


class FeedbackCreateResponse(BaseModel):
    id: UUID
    status: str = "received"
    message: str = "Thanks — your feedback helps us improve."


public_router = APIRouter(
    prefix="/api/v1/feedback",
    tags=["feedback"],
    dependencies=[Depends(rate_limit_dependency)],
)

admin_router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin-feedback"],
    dependencies=[Depends(rate_limit_dependency), Depends(require_admin)],
)


@public_router.post("", response_model=FeedbackCreateResponse, status_code=201)
async def submit_feedback(
    payload: FeedbackCreate, request: Request, db: AsyncSession = Depends(get_db)
) -> FeedbackCreateResponse:
    ua = (request.headers.get("user-agent") or "")[:512]
    fb = UserFeedback(
        page_url=(payload.page_url or "")[:512] or None,
        rating=payload.rating,
        looking_for=(payload.looking_for or "").strip() or None,
        missing=(payload.missing or "").strip() or None,
        email=payload.email,
        user_agent=ua or None,
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return FeedbackCreateResponse(id=fb.id)


@admin_router.get("/feedback", response_model=list[FeedbackOut])
async def list_feedback(
    db: AsyncSession = Depends(get_db),
    min_rating: Optional[int] = Query(None, ge=1, le=5),
    limit: int = Query(200, ge=1, le=1000),
) -> list[FeedbackOut]:
    stmt = select(UserFeedback).order_by(UserFeedback.created_at.desc())
    if min_rating is not None:
        stmt = stmt.where(UserFeedback.rating >= min_rating)
    rows = (await db.execute(stmt.limit(limit))).scalars().all()
    return [FeedbackOut.model_validate(r) for r in rows]


@admin_router.get("/feedback/stats")
async def feedback_stats(db: AsyncSession = Depends(get_db)) -> dict:
    total = await db.scalar(select(func.count()).select_from(UserFeedback)) or 0
    avg = await db.scalar(select(func.avg(UserFeedback.rating)))
    return {"total": int(total), "avg_rating": round(float(avg), 2) if avg is not None else None}
