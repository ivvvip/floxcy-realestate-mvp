"""Broker model — approved investment specialists."""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.consultation import Consultation
    from app.models.investment_opportunity import InvestmentOpportunity


class Broker(Base):
    __tablename__ = "brokers"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    rera_license: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    languages: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    specialist_areas: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    property_types: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    experience_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    performance_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    response_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Auth placeholder — populated only when broker login is enabled (Phase 2).
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    opportunities: Mapped[List["InvestmentOpportunity"]] = relationship(
        "InvestmentOpportunity", back_populates="broker"
    )
    consultations: Mapped[List["Consultation"]] = relationship(
        "Consultation", back_populates="broker"
    )

    def __repr__(self):
        return f"<Broker {self.full_name} ({self.status})>"
