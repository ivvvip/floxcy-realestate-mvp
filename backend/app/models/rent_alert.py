"""RentAlert — public rent-alert subscriptions on DLD-area / size combos."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RentAlert(Base):
    __tablename__ = "rent_alerts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    area_name_display: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size_category: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    prop_sub_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "email", "area_name_norm", "size_category", "prop_sub_type",
            name="uq_rent_alert_email_area_size_type",
        ),
    )
