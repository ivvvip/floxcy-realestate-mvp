"""Public consultation-request endpoints.

Two entry points:
  POST /api/v1/consultations/request                 — area / generic interest
  POST /api/v1/opportunities/deals/{id}/request-consultation — tied to a deal

Both create an ``InvestorLead`` plus a ``Consultation``, route the
consultation to the opportunity's broker when one exists, and return a
success envelope with both objects.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.models.consultation import Consultation
from app.models.investment_opportunity import InvestmentOpportunity
from app.models.investor_lead import InvestorLead
from app.schemas.consultation import ConsultationOut, ConsultationRequestResponse
from app.schemas.investor_lead import LeadCreate, LeadOut
from app.services.lead_scoring import compute_lead_score


router = APIRouter(
    prefix="/api/v1/consultations",
    tags=["consultations"],
    dependencies=[Depends(rate_limit_dependency)],
)


SUCCESS_MESSAGE = (
    "Your request has been received. A verified investment specialist "
    "will contact you."
)


async def _create_lead_and_consultation(
    db: AsyncSession,
    payload: LeadCreate,
    opportunity: InvestmentOpportunity | None,
) -> tuple[InvestorLead, Consultation]:
    broker_id = opportunity.broker_id if opportunity else None
    lead_score = compute_lead_score(
        has_opportunity=opportunity is not None,
        whatsapp=payload.whatsapp,
        phone=payload.phone,
        email=payload.email,
        budget=payload.budget,
        investment_goal=payload.investment_goal,
        timeline=payload.timeline,
        message=payload.message,
    )
    lead = InvestorLead(
        opportunity_id=opportunity.id if opportunity else None,
        matched_broker_id=broker_id,
        lead_score=lead_score,
        **payload.model_dump(exclude={"opportunity_id"}),
    )
    db.add(lead)
    await db.flush()  # need lead.id for the consultation FK
    consultation = Consultation(
        investor_lead_id=lead.id,
        broker_id=broker_id,
        opportunity_id=opportunity.id if opportunity else None,
        status="assigned" if broker_id else "requested",
    )
    db.add(consultation)
    await db.commit()
    await db.refresh(lead)
    await db.refresh(consultation)
    return lead, consultation


@router.post(
    "/request",
    response_model=ConsultationRequestResponse,
    status_code=201,
)
async def request_consultation(
    payload: LeadCreate,
    db: AsyncSession = Depends(get_db),
):
    """Generic consultation request. ``opportunity_id`` is optional — when
    present, the request is bound to that deal and routed to its broker."""
    opportunity = None
    if payload.opportunity_id:
        opportunity = (
            await db.execute(
                select(InvestmentOpportunity).where(
                    InvestmentOpportunity.id == payload.opportunity_id
                )
            )
        ).scalar_one_or_none()
        if not opportunity:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        if opportunity.status != "approved":
            raise HTTPException(
                status_code=409,
                detail="Opportunity is not currently accepting consultations",
            )

    lead, consultation = await _create_lead_and_consultation(db, payload, opportunity)
    return ConsultationRequestResponse(
        message=SUCCESS_MESSAGE,
        lead=LeadOut.model_validate(lead),
        consultation=ConsultationOut.model_validate(consultation),
    )
