"""Admin endpoints for managing brokers, opportunities, and leads.

All routes here gate on the existing ``require_admin`` dep (role-based).
Bootstrapped admin user is seeded by ``services/bootstrap.py``.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.broker_auth import generate_temp_password
from app.core.dependencies import AuthPrincipal, require_admin
from app.core.rate_limit import rate_limit_dependency
from app.core.security import hash_password
from app.database import get_db
from app.models.broker import Broker
from app.models.broker_application import BrokerApplication
from app.models.investment_opportunity import InvestmentOpportunity
from app.models.investor_lead import InvestorLead
from app.schemas.broker import (
    BrokerApplicationOut,
    BrokerApproveRequest,
    BrokerApproveResponse,
    BrokerOut,
    BrokerUpdate,
)
from app.schemas.investor_lead import LeadOut, LeadUpdate
from app.schemas.opportunity_deal import DealAdminUpdate, DealOut


router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin-supply"],
    dependencies=[Depends(rate_limit_dependency), Depends(require_admin)],
)


# ---- Broker applications ----


@router.get("/broker-applications", response_model=list[BrokerApplicationOut])
async def list_broker_applications(
    db: AsyncSession = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    stmt = select(BrokerApplication).order_by(BrokerApplication.created_at.desc())
    if status_filter:
        stmt = stmt.where(BrokerApplication.status == status_filter)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post(
    "/broker-applications/{application_id}/approve",
    response_model=BrokerApproveResponse,
)
async def approve_broker_application(
    application_id: UUID,
    body: BrokerApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Mark application approved AND create a Broker row.

    If `body.password` is omitted, a one-time temp password is generated and
    returned in the response so the admin can hand it off to the broker.
    """
    app = (
        await db.execute(
            select(BrokerApplication).where(BrokerApplication.id == application_id)
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(
            status_code=409, detail=f"Application is already '{app.status}'"
        )

    existing_broker = (
        await db.execute(select(Broker).where(Broker.email == app.email))
    ).scalar_one_or_none()
    if existing_broker:
        raise HTTPException(
            status_code=409,
            detail="A broker with this email already exists",
        )

    plain_password = body.password or generate_temp_password()
    broker = Broker(
        full_name=app.full_name,
        company_name=app.company_name,
        email=app.email,
        phone=app.phone,
        whatsapp=app.whatsapp,
        rera_license=app.rera_license,
        specialist_areas=app.specialist_areas,
        experience_years=app.experience_years,
        status="approved",
        password_hash=hash_password(plain_password),
    )
    db.add(broker)
    app.status = "approved"
    await db.commit()
    await db.refresh(broker)
    return BrokerApproveResponse(
        broker=BrokerOut.model_validate(broker),
        temp_password=None if body.password else plain_password,
    )


@router.post("/broker-applications/{application_id}/reject", response_model=BrokerApplicationOut)
async def reject_broker_application(
    application_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    app = (
        await db.execute(
            select(BrokerApplication).where(BrokerApplication.id == application_id)
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(
            status_code=409, detail=f"Application is already '{app.status}'"
        )
    app.status = "rejected"
    await db.commit()
    await db.refresh(app)
    return app


# ---- Brokers ----


@router.get("/brokers", response_model=list[BrokerOut])
async def list_brokers(
    db: AsyncSession = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    stmt = select(Broker).order_by(Broker.created_at.desc())
    if status_filter:
        stmt = stmt.where(Broker.status == status_filter)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.patch("/brokers/{broker_id}", response_model=BrokerOut)
async def update_broker(
    broker_id: UUID,
    body: BrokerUpdate,
    db: AsyncSession = Depends(get_db),
):
    broker = (
        await db.execute(select(Broker).where(Broker.id == broker_id))
    ).scalar_one_or_none()
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(broker, k, v)
    await db.commit()
    await db.refresh(broker)
    return broker


# ---- Opportunities (broker-submitted deals) ----


@router.get("/opportunities/pending", response_model=list[DealOut])
async def list_pending_opportunities(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(InvestmentOpportunity)
        .where(InvestmentOpportunity.status == "pending_review")
        .order_by(InvestmentOpportunity.created_at.desc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/opportunities/{opp_id}/approve", response_model=DealOut)
async def approve_opportunity(
    opp_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    opp = (
        await db.execute(
            select(InvestmentOpportunity).where(InvestmentOpportunity.id == opp_id)
        )
    ).scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if opp.status not in ("pending_review", "draft"):
        raise HTTPException(
            status_code=409, detail=f"Cannot approve from status '{opp.status}'"
        )
    opp.status = "approved"
    await db.commit()
    await db.refresh(opp)
    return opp


@router.post("/opportunities/{opp_id}/reject", response_model=DealOut)
async def reject_opportunity(
    opp_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    opp = (
        await db.execute(
            select(InvestmentOpportunity).where(InvestmentOpportunity.id == opp_id)
        )
    ).scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if opp.status not in ("pending_review", "draft", "approved"):
        raise HTTPException(
            status_code=409, detail=f"Cannot reject from status '{opp.status}'"
        )
    opp.status = "rejected"
    await db.commit()
    await db.refresh(opp)
    return opp


@router.patch("/opportunities/{opp_id}", response_model=DealOut)
async def admin_update_opportunity(
    opp_id: UUID,
    body: DealAdminUpdate,
    db: AsyncSession = Depends(get_db),
):
    opp = (
        await db.execute(
            select(InvestmentOpportunity).where(InvestmentOpportunity.id == opp_id)
        )
    ).scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(opp, k, v)
    await db.commit()
    await db.refresh(opp)
    return opp


# ---- Investor leads ----


@router.get("/leads", response_model=list[LeadOut])
async def list_leads(
    db: AsyncSession = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    stmt = select(InvestorLead).order_by(InvestorLead.created_at.desc())
    if status_filter:
        stmt = stmt.where(InvestorLead.status == status_filter)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_lead(
    lead_id: UUID,
    body: LeadUpdate,
    db: AsyncSession = Depends(get_db),
):
    lead = (
        await db.execute(select(InvestorLead).where(InvestorLead.id == lead_id))
    ).scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(lead, k, v)
    await db.commit()
    await db.refresh(lead)
    return lead
