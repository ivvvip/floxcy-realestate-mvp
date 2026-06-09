"""Pydantic schemas for investor leads."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


LEAD_STATUSES = (
    "new", "contacted", "qualified", "viewing",
    "negotiating", "closed", "lost",
)


class LeadCreate(BaseModel):
    """Public consultation/lead form submission."""

    opportunity_id: Optional[UUID] = None
    full_name: str = Field(..., min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=64)
    whatsapp: Optional[str] = Field(None, max_length=64)
    budget: Optional[Decimal] = Field(None, ge=0)
    investment_goal: Optional[str] = Field(None, max_length=64)
    risk_level: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    preferred_area: Optional[str] = Field(None, max_length=255)
    timeline: Optional[str] = Field(None, max_length=64)
    message: Optional[str] = None


class LeadUpdate(BaseModel):
    """Admin or broker partial update."""

    status: Optional[str] = Field(
        None,
        pattern="^(new|contacted|qualified|viewing|negotiating|closed|lost)$",
    )
    matched_broker_id: Optional[UUID] = None
    lead_score: Optional[float] = Field(None, ge=0, le=100)
    message: Optional[str] = None


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    opportunity_id: Optional[UUID]
    matched_broker_id: Optional[UUID]
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    whatsapp: Optional[str]
    budget: Optional[Decimal]
    investment_goal: Optional[str]
    risk_level: Optional[str]
    preferred_area: Optional[str]
    timeline: Optional[str]
    message: Optional[str]
    lead_score: Optional[float]
    status: str
    # Lead routing (monetization foundation)
    lead_type: Optional[str] = None
    lead_status: str = "new"
    assigned_broker_number: Optional[str] = None
    assigned_developer_number: Optional[str] = None
    assigned_agency_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
