"""Off-plan project models (Phase 3 — two-tier off-plan data strategy).

TIER 1 (authoritative): DldProject + DldDeveloper — ingested verbatim from the
DLD projects/developers registry CSVs. These are OFFICIAL: % completion, escrow
account, verified developer, handover dates. Always surfaced as "DLD Official".

TIER 2 (enrichment): ProjectEnrichment — a SEPARATE table for indicative market
data (payment plans, starting prices, bedroom mix) sourced from developer sites
/ portals. Kept distinct from TIER 1 so investors always know what is official
vs indicative. Empty for now; populated manually/later.
"""
from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

from app.database import Base


class DldDeveloper(Base):
    """Official DLD developer registry (developers-*.csv). Source: DLD Official."""
    __tablename__ = "dld_developers"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    developer_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    developer_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    registration_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    license_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    license_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    legal_status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    webpage: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    fax: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    license_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    license_issue_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    license_expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    chamber_of_commerce_no: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DldProject(Base):
    """Official DLD off-plan project registry (projects-*.csv). Source: DLD Official."""
    __tablename__ = "dld_projects"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    project_name: Mapped[Optional[str]] = mapped_column(String(512), nullable=True, index=True)
    developer_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    developer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    project_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    project_status: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    percent_completed: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    project_value: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    escrow_account_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Timeline (official)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    adoption_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    inspection_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completion_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Location
    area_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    area_name_norm: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    zone_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    master_project: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Unit counts (official)
    cnt_land: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cnt_building: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cnt_villa: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cnt_unit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProjectEnrichment(Base):
    """TIER 2 — indicative market enrichment, kept SEPARATE from official DLD.

    Surfaced to users only with an "ℹ️ Market data (indicative)" label + source
    attribution. `is_official` is True ONLY when sourced from the developer's
    own site/portal. Empty until populated manually/later.
    """
    __tablename__ = "project_enrichment"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_number: Mapped[str] = mapped_column(
        String(32), ForeignKey("dld_projects.project_number", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    payment_plan: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # e.g. "60/40"
    starting_price_aed: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    price_per_sqft_min: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    price_per_sqft_max: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    bedroom_types: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # e.g. "Studio,1BR,2BR"
    enrichment_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # developer_website/portal
    enrichment_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_official: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
