"""InvestmentOpportunity — broker-submitted (or manual / developer) deal.

Distinct from the area-derived signals produced by
``services/opportunity_engine.py``. The two are unified at the API layer
(Phase 2) via a ``kind`` discriminator on the response shape, not in the
database.
"""
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.broker import Broker
    from app.models.consultation import Consultation
    from app.models.investor_lead import InvestorLead


class InvestmentOpportunity(Base):
    __tablename__ = "investment_opportunities"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    broker_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("brokers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    emirate: Mapped[str] = mapped_column(String(64), default="Dubai", nullable=False)
    area: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    property_type: Mapped[str] = mapped_column(String(64), nullable=False)
    unit_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    price_per_sqft: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    expected_annual_rent: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    expected_gross_yield: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    expected_net_yield: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    service_charges: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    strategy_type: Mapped[str] = mapped_column(String(32), default="balanced", nullable=False)
    opportunity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(32), default="medium", nullable=False)
    confidence_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    why_opportunity: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    best_for: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), default="broker", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    broker: Mapped[Optional["Broker"]] = relationship("Broker", back_populates="opportunities")
    consultations: Mapped[List["Consultation"]] = relationship(
        "Consultation", back_populates="opportunity"
    )
    leads: Mapped[List["InvestorLead"]] = relationship(
        "InvestorLead", back_populates="opportunity"
    )

    def __repr__(self):
        return f"<InvestmentOpportunity {self.title} ({self.status})>"
