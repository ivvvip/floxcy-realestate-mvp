"""InvestorLead — inbound investor interest, optionally tied to an opportunity."""
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
    from app.models.investment_opportunity import InvestmentOpportunity


class InvestorLead(Base):
    __tablename__ = "investor_leads"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    opportunity_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("investment_opportunities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    matched_broker_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("brokers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    investment_goal: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    risk_level: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    preferred_area: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timeline: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lead_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="new", nullable=False, index=True)
    # --- Lead routing (monetization foundation; not gated yet) ---
    # lead_type = which supply side this lead targets; lead_status = routing
    # lifecycle (new/sent/contacted/closed). The legacy `status` above is kept
    # for the existing /admin/leads view; lead_status is the new routing axis.
    lead_type: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    lead_status: Mapped[str] = mapped_column(String(16), default="new", nullable=False, index=True)
    assigned_broker_number: Mapped[Optional[str]] = mapped_column(
        ForeignKey("dld_rera_brokers.broker_number", ondelete="SET NULL"), nullable=True, index=True,
    )
    assigned_developer_number: Mapped[Optional[str]] = mapped_column(
        ForeignKey("dld_developers.developer_number", ondelete="SET NULL"), nullable=True, index=True,
    )
    assigned_agency_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("agency_profiles.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    opportunity: Mapped[Optional["InvestmentOpportunity"]] = relationship(
        "InvestmentOpportunity", back_populates="leads"
    )
    matched_broker: Mapped[Optional["Broker"]] = relationship("Broker")
    consultations: Mapped[List["Consultation"]] = relationship(
        "Consultation", back_populates="investor_lead", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<InvestorLead {self.full_name} ({self.status})>"
