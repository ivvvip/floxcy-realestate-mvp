"""Public broker-facing endpoints (no auth required).

Single endpoint for now: prospective brokers submit an application that
goes into the admin review queue (`broker_applications` table).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.broker_application import BrokerApplication
from app.schemas.broker import BrokerApplicationCreate, BrokerApplicationOut


router = APIRouter(
    prefix="/api/v1/brokers",
    tags=["brokers-public"],
    dependencies=[Depends(rate_limit_dependency)],
)


@router.post("/apply", response_model=BrokerApplicationOut, status_code=201)
async def submit_application(
    payload: BrokerApplicationCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit a broker application. Idempotent on email for pending rows:
    a second submission with the same email while one is already pending
    returns the existing application instead of creating a duplicate."""
    existing = (
        await db.execute(
            select(BrokerApplication)
            .where(BrokerApplication.email == payload.email)
            .where(BrokerApplication.status == "pending")
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    app = BrokerApplication(**payload.model_dump())
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return app
