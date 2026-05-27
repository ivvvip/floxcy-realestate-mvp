"""Investor alerts: notify-me rules stored in DB."""
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import String, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, Any

from app.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    # Either a logged-in user OR an anonymous session_id (cookie-keyed)
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    session_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    # The kind of alert: yield_above, price_below, undervalued_appears,
    # volume_spike, opportunity_appears
    type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Optional area scope; null = market-wide
    area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("areas.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Threshold + comparison + display label
    params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_fired_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_value: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    delivery: Mapped[str] = mapped_column(String(32), default="in_app", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Alert {self.type} active={self.is_active}>"
