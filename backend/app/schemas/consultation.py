"""Pydantic schemas for consultations."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.investor_lead import LeadOut


CONSULTATION_STATUSES = ("requested", "assigned", "contacted", "completed", "cancelled")


class ConsultationUpdate(BaseModel):
    status: Optional[str] = Field(
        None, pattern="^(requested|assigned|contacted|completed|cancelled)$"
    )
    notes: Optional[str] = None


class ConsultationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    investor_lead_id: UUID
    broker_id: Optional[UUID]
    opportunity_id: Optional[UUID]
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class ConsultationRequestResponse(BaseModel):
    """Success envelope after a public consultation request."""

    message: str
    lead: LeadOut
    consultation: ConsultationOut
