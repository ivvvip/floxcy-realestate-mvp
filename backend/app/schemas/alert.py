"""Alert schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, Field


ALERT_TYPES = {
    "yield_above": "Yield rises above threshold",
    "yield_below": "Yield falls below threshold",
    "price_below": "AED/sqft drops below threshold",
    "price_above": "AED/sqft rises above threshold",
    "volume_spike": "Transaction volume jumps by X%",
    "undervalued_appears": "Area enters strong-undervalued tier",
    "opportunity_appears": "New strong opportunity in any area",
}


class AlertCreateRequest(BaseModel):
    type: str = Field(description=f"One of: {', '.join(ALERT_TYPES)}")
    area_id: Optional[UUID] = None
    params: dict[str, Any] = Field(default_factory=dict)
    delivery: str = Field(default="in_app")


class AlertOut(BaseModel):
    id: UUID
    type: str
    type_label: str
    area_id: Optional[UUID]
    area_name: Optional[str]
    params: dict[str, Any]
    is_active: bool
    last_fired_at: Optional[datetime]
    last_value: Optional[str]
    delivery: str
    created_at: datetime
