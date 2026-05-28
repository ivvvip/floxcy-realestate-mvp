"""BrokerApplication — public submissions awaiting admin review.

Separate from ``brokers`` so an applicant only becomes a broker on approval.
Application rows are retained as audit trail after the decision.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BrokerApplication(Base):
    __tablename__ = "broker_applications"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    rera_license: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    specialist_areas: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    experience_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<BrokerApplication {self.full_name} ({self.status})>"
