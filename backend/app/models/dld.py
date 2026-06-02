"""DLD-derived tables — built from Dubai Land Department CSV snapshots.

All `dld_*` tables are independent of the curated `areas` and `brokers` tables.
A `dld_areas.curated_area_id` FK links DLD names to curated areas when they match.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DldArea(Base):
    __tablename__ = "dld_areas"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name_norm: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name_display: Mapped[str] = mapped_column(String(255), nullable=False)
    curated_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    txn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rent_count_2026: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rent_count_2025: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    building_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    land_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DldAreaMetrics(Base):
    __tablename__ = "dld_area_metrics"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[UUID] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period: Mapped[str] = mapped_column(String(32), nullable=False, default="2026-ytd")
    avg_price_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    median_price_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    sales_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    median_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    median_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    rent_count_2026: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rental_yield_pct: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    rent_growth_yoy_pct: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("dld_area_id", "period", name="uq_dld_area_metrics_area_period"),
    )


class DldBuilding(Base):
    __tablename__ = "dld_buildings"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    project_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    project_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    master_project: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    zone: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    prop_sub_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    land_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    actual_area: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    built_up_area: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    flats: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    shops: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    offices: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    floors: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bld_levels: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    elevators: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    swimming_pools: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    car_parks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_freehold: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    is_offplan: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    creation_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    avg_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    active_rent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    occupancy_proxy_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DldReraBroker(Base):
    __tablename__ = "dld_rera_brokers"

    broker_number: Mapped[str] = mapped_column(String(32), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    gender: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    license_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    license_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    webpage: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    fax: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    real_estate_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    real_estate_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Nationality/language detection from name patterns. Always "estimated";
    # DLD does not publish broker nationality. Populated by
    # scripts/populate_broker_nationality.py at deploy time.
    detected_nationality: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True, index=True
    )
    detected_language: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    nationality_flag: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DldRentBenchmark(Base):
    __tablename__ = "dld_rent_benchmarks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[UUID] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prop_sub_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_band: Mapped[str] = mapped_column(String(32), nullable=False)
    period: Mapped[str] = mapped_column(String(32), nullable=False, default="2026")
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    p10_annual_rent: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    p25_annual_rent: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    median_annual_rent: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    p75_annual_rent: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    p90_annual_rent: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    p25_rent_per_sqft: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    median_rent_per_sqft: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    p75_rent_per_sqft: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "dld_area_id", "prop_sub_type", "size_band", "period",
            name="uq_dld_rent_benchmark_key",
        ),
    )


class DldPriceHistory(Base):
    """Per-(area, year) Sales-of-Unit aggregates from 2021–2026 DLD export.

    Populated by scripts/etl_dld_history.py. Idempotent rebuild: the ETL
    truncates and bulk-inserts. UNIQUE(area_name_norm, year).
    """
    __tablename__ = "dld_price_history"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    avg_ppsf_ready: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    avg_ppsf_offplan: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    avg_ppsf_all: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    median_ppsf_all: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    transaction_count_ready: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    transaction_count_offplan: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_value_aed: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    median_deal_size: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    offplan_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("area_name_norm", "year", name="uq_dld_price_history_area_year"),
    )


class DldAreaAppreciation(Base):
    """Derived 1y/3y/5y appreciation + 5y CAGR per area, computed from
    dld_price_history at ETL time. UNIQUE(area_name_norm)."""
    __tablename__ = "dld_area_appreciation"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="CASCADE"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    base_year: Mapped[int] = mapped_column(Integer, nullable=False)
    latest_year: Mapped[int] = mapped_column(Integer, nullable=False)
    appreciation_1y_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    appreciation_3y_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    appreciation_5y_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    cagr_5y_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    years_of_data: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DldRentHistory(Base):
    """Per-(area, year) Ejari rent aggregates from 2021–2026 export.

    Populated by scripts/etl_dld_rent_history.py. UNIQUE(area_name_norm, year).
    """
    __tablename__ = "dld_rent_history"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    avg_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    median_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    median_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    renew_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    renewal_rate_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("area_name_norm", "year", name="uq_dld_rent_history_area_year"),
    )


class DldYieldHistory(Base):
    """Derived per-(area, year) gross yield: rent_per_sqft / sale_ppsf × 100,
    capped at 25%. Built by the rent ETL via SQL join over price+rent.
    """
    __tablename__ = "dld_yield_history"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    gross_yield_pct: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    sale_ppsf: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    rent_psf: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    yield_delta_yoy_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    sample_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("area_name_norm", "year", name="uq_dld_yield_history_area_year"),
    )


class DldCanonicalArea(Base):
    """Single source of truth for DLD area spelling/casing/slugging.

    Built by scripts/extract_canonical_areas.py from the raw 5y CSVs.
    Other tables join via UPPER(area_name_norm) = area_name_upper.
    """
    __tablename__ = "dld_canonical_areas"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    area_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    area_name_upper: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    area_name_slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    area_name_ar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Postgres JSONB at the model level — list[str] of dataset labels
    source_datasets: Mapped[list] = mapped_column(JSONB, nullable=False)
    first_seen_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Coordinates (populated by scripts/geocode_canonical_areas.py)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_north: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_south: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_east: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_west: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    coords_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    coords_confidence: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # GeoJSON polygon shape from OSM Overpass (Polygon or MultiPolygon)
    polygon: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DldAreaLandSummary(Base):
    """Per-area aggregates from dld_land_registry: freehold %, registered %,
    land-type mix, top master projects, total parcels, total sqm."""
    __tablename__ = "dld_area_land_summary"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    area_name_norm: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    area_name_display: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_parcels: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_area_sqm: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    freehold_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    registered_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    land_type_mix: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    top_master_projects: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
