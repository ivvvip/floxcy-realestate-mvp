"""Consultation — join row between an InvestorLead and a Broker."""
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.broker import Broker
    from app.models.investment_opportunity import InvestmentOpportunity
    from app.models.investor_lead import InvestorLead


class Consultation(Base):
    __tablename__ = "consultations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    investor_lead_id: Mapped[UUID] = mapped_column(
        ForeignKey("investor_leads.id", ondelete="CASCADE"), nullable=False
    )
    broker_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("brokers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    opportunity_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("investment_opportunities.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default="requested", nullable=False, index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    investor_lead: Mapped["InvestorLead"] = relationship(
        "InvestorLead", back_populates="consultations"
    )
    broker: Mapped[Optional["Broker"]] = relationship(
        "Broker", back_populates="consultations"
    )
    opportunity: Mapped[Optional["InvestmentOpportunity"]] = relationship(
        "InvestmentOpportunity", back_populates="consultations"
    )

    def __repr__(self):
        return f"<Consultation {self.id} ({self.status})>"
