"""Auth schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class MeResponse(BaseModel):
    id: UUID
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    last_login_at: Optional[datetime]
    created_at: datetime


class LoginResponse(MeResponse):
    pass


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    tier: str = Field(default="free")
    rate_limit_per_min: Optional[int] = None
    expires_at: Optional[datetime] = None


class ApiKeyPublic(BaseModel):
    id: UUID
    prefix: str
    name: str
    tier: str
    rate_limit_per_min: Optional[int]
    is_active: bool
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    revoked_at: Optional[datetime]
    created_at: datetime


class ApiKeyCreateResponse(ApiKeyPublic):
    # The full key — only shown ONCE on creation.
    full_key: str


class AuditLogEntry(BaseModel):
    id: UUID
    actor_label: str
    action: str
    target_type: Optional[str]
    target_id: Optional[str]
    payload: Optional[dict]
    ip: Optional[str]
    status: str
    created_at: datetime
