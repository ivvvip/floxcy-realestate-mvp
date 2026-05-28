"""Pydantic schemas for brokers + broker applications + broker auth."""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ----- Broker application (public) -----


class BrokerApplicationCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    company_name: Optional[str] = Field(None, max_length=255)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=64)
    whatsapp: Optional[str] = Field(None, max_length=64)
    rera_license: Optional[str] = Field(None, max_length=128)
    specialist_areas: Optional[List[str]] = None
    experience_years: Optional[int] = Field(None, ge=0, le=80)
    message: Optional[str] = None


class BrokerApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    company_name: Optional[str]
    email: str
    phone: Optional[str]
    whatsapp: Optional[str]
    rera_license: Optional[str]
    specialist_areas: Optional[List[str]]
    experience_years: Optional[int]
    message: Optional[str]
    status: str
    created_at: datetime


# ----- Broker (post-approval) -----


class BrokerOut(BaseModel):
    """Public-safe broker profile."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    company_name: Optional[str]
    email: str
    phone: Optional[str]
    whatsapp: Optional[str]
    rera_license: Optional[str]
    languages: Optional[List[str]]
    specialist_areas: Optional[List[str]]
    property_types: Optional[List[str]]
    experience_years: Optional[int]
    bio: Optional[str]
    status: str
    performance_score: float
    response_score: float
    created_at: datetime


class BrokerUpdate(BaseModel):
    """Admin-side partial update for a broker."""

    full_name: Optional[str] = Field(None, max_length=255)
    company_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=64)
    whatsapp: Optional[str] = Field(None, max_length=64)
    rera_license: Optional[str] = Field(None, max_length=128)
    languages: Optional[List[str]] = None
    specialist_areas: Optional[List[str]] = None
    property_types: Optional[List[str]] = None
    experience_years: Optional[int] = Field(None, ge=0, le=80)
    bio: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(pending|approved|rejected|suspended)$")
    performance_score: Optional[float] = Field(None, ge=0, le=100)
    response_score: Optional[float] = Field(None, ge=0, le=100)


class BrokerApproveRequest(BaseModel):
    """Admin approves a broker application; password gets the broker logged-in.

    If omitted, a one-time temporary password is generated and returned so the
    admin can hand it off out-of-band.
    """

    password: Optional[str] = Field(None, min_length=8, max_length=128)


class BrokerApproveResponse(BaseModel):
    broker: BrokerOut
    temp_password: Optional[str] = Field(
        None,
        description="Present only when admin did not supply a password; show once.",
    )


# ----- Broker auth -----


class BrokerLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class BrokerLoginResponse(BaseModel):
    token: str
    broker: BrokerOut
