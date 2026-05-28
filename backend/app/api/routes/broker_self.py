"""Broker-authenticated endpoints: login, profile, my opportunities, my leads.

Broker auth is a separate JWT surface from User auth; see
``app/core/broker_auth.py``.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.broker_auth import create_broker_token, require_broker
from app.core.rate_limit import auth_rate_limit_dependency, rate_limit_dependency
from app.core.security import verify_password
from app.database import get_db
from app.models.broker import Broker
from app.models.investment_opportunity import InvestmentOpportunity
from app.models.investor_lead import InvestorLead
from app.schemas.broker import BrokerLoginRequest, BrokerLoginResponse, BrokerOut
from app.schemas.investor_lead import LeadOut, LeadUpdate
from app.schemas.opportunity_deal import DealCreate, DealOut, DealUpdate
from app.services.deal_scoring import score_and_apply


router = APIRouter(
    prefix="/api/v1/broker",
    tags=["broker"],
    dependencies=[Depends(rate_limit_dependency)],
)


@router.post(
    "/login",
    response_model=BrokerLoginResponse,
    dependencies=[Depends(auth_rate_limit_dependency)],
)
async def broker_login(
    body: BrokerLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    broker = (
        await db.execute(select(Broker).where(Broker.email == body.email))
    ).scalar_one_or_none()
    if not broker or not broker.password_hash or not verify_password(
        body.password, broker.password_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if broker.status != "approved":
        raise HTTPException(
            status_code=403,
            detail=f"Broker status is '{broker.status}' — login disabled",
        )
    token = create_broker_token(broker.id, broker.email)
    return BrokerLoginResponse(
        token=token, broker=BrokerOut.model_validate(broker)
    )


@router.get("/me", response_model=BrokerOut)
async def broker_me(broker: Broker = Depends(require_broker)):
    return broker


# ---- My opportunities ----


@router.get("/opportunities", response_model=list[DealOut])
async def list_my_opportunities(
    db: AsyncSession = Depends(get_db),
    broker: Broker = Depends(require_broker),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    stmt = (
        select(InvestmentOpportunity)
        .where(InvestmentOpportunity.broker_id == broker.id)
        .order_by(InvestmentOpportunity.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(InvestmentOpportunity.status == status_filter)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/opportunities", response_model=DealOut, status_code=201)
async def create_my_opportunity(
    body: DealCreate,
    db: AsyncSession = Depends(get_db),
    broker: Broker = Depends(require_broker),
):
    """Broker submits an opportunity. Lands in ``pending_review`` for admin.

    Brokers cannot publish directly; admin must approve (Phase 7 rule).
    """
    opp = InvestmentOpportunity(
        broker_id=broker.id,
        source_type="broker",
        status="pending_review",
        **body.model_dump(),
    )
    db.add(opp)
    await db.flush()
    await score_and_apply(db, opp)
    await db.commit()
    await db.refresh(opp)
    return opp


@router.patch("/opportunities/{opp_id}", response_model=DealOut)
async def update_my_opportunity(
    opp_id: UUID,
    body: DealUpdate,
    db: AsyncSession = Depends(get_db),
    broker: Broker = Depends(require_broker),
):
    opp = (
        await db.execute(
            select(InvestmentOpportunity)
            .where(InvestmentOpportunity.id == opp_id)
            .where(InvestmentOpportunity.broker_id == broker.id)
        )
    ).scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    # Approved deals are admin-managed; brokers can only archive or revise drafts.
    if opp.status == "approved" and (body.status is not None and body.status != "archived"):
        raise HTTPException(
            status_code=409,
            detail="Approved opportunities can only be archived, not edited",
        )
    payload = body.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(opp, k, v)
    # Re-score if anything that feeds the score changed.
    if payload.keys() & {
        "price", "price_per_sqft", "expected_gross_yield",
        "expected_net_yield", "area", "risk_level", "confidence_score",
    }:
        await score_and_apply(db, opp)
    await db.commit()
    await db.refresh(opp)
    return opp


# ---- My leads ----


@router.get("/leads", response_model=list[LeadOut])
async def list_my_leads(
    db: AsyncSession = Depends(get_db),
    broker: Broker = Depends(require_broker),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    stmt = (
        select(InvestorLead)
        .where(InvestorLead.matched_broker_id == broker.id)
        .order_by(InvestorLead.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(InvestorLead.status == status_filter)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_my_lead(
    lead_id: UUID,
    body: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    broker: Broker = Depends(require_broker),
):
    lead = (
        await db.execute(
            select(InvestorLead)
            .where(InvestorLead.id == lead_id)
            .where(InvestorLead.matched_broker_id == broker.id)
        )
    ).scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Brokers move status forward / write notes; can't reassign themselves out.
    payload = body.model_dump(exclude_unset=True)
    payload.pop("matched_broker_id", None)
    payload.pop("lead_score", None)
    for k, v in payload.items():
        setattr(lead, k, v)
    await db.commit()
    await db.refresh(lead)
    return lead
