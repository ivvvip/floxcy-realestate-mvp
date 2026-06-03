"""DLD-derived tables — built from Dubai Land Department CSV snapshots.

All `dld_*` tables are independent of the curated `areas` and `brokers` tables.
A `dld_areas.curated_area_id` FK links DLD names to curated areas when they match.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
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
    # Share of sale transactions whose has_parking=1 — feeds /areas/[id]
    # without needing a separate query.
    parking_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
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
    # Building-name classification — see scripts/_building_classifier.py.
    # building_name_type ∈ {real_building, sub_project, master_project,
    # developer_name, area_name, no_name}. is_identifiable is the gate for
    # building-level rent analytics; the others contribute area-level signal
    # only.
    building_name_clean: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    building_name_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_identifiable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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
    property_usage: Mapped[str] = mapped_column(String(32), nullable=False, default="Residential")
    property_category: Mapped[str] = mapped_column(String(32), nullable=False, default="apartment")
    is_bulk_contract: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
            "property_usage", "property_category",
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
    """Derived 1y/3y/5y/10y appreciation + 5y/10y CAGR per area, computed
    from dld_price_history at ETL time. UNIQUE(area_name_norm). The 10y
    columns are populated once the history backfill reaches 2009 (areas
    without 10y of price data leave them null)."""
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
    appreciation_10y_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    cagr_5y_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    cagr_10y_pct: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
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
    # Tenant-type audit: how many of the surviving contracts were Person vs
    # Authority. We filter to Person for benchmark/yield math; these columns
    # let us see what the filter dropped.
    person_contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    authority_contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("area_name_norm", "year", name="uq_dld_rent_history_area_year"),
    )


class DldBuildingDerived(Base):
    """Synthetic per-(project_name_en, area) building entity extracted from
    the Ejari rent registry. Necessary because dld_buildings (the official
    DLD-published table) only carries 47 distinct identities — the rent
    stream itself has thousands of real per-tower project_name_en values
    (e.g. "SIRAJ TOWER", "ORBIT RESIDENCES BY JEWEL 2"). data_source is
    always 'ejari_derived' so frontends can badge the row correctly.
    """
    __tablename__ = "dld_buildings_derived"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    project_name_slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    master_project_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    avg_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    first_seen_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_seen_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    data_source: Mapped[str] = mapped_column(String(32), nullable=False, default="ejari_derived")
    # Property category from _dld_category.classify_property — drives the
    # 5-tab buildings UI (Residential / Villas / Commercial / Special).
    property_category: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    # OSM-verified coordinates (populated by etl_osm_match.py). lat/lon are
    # nullable because OSM coverage is partial (~30% of the roster);
    # osm_verified is the flag the frontend uses to badge "Location verified".
    lat: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    osm_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "project_name_en", "dld_area_id",
            name="uq_dld_buildings_derived_name_area",
        ),
    )


class DldBuildingOsmCoords(Base):
    """OSM Overpass match for a DldBuildingDerived row. One row per matched
    building; floors + building_type come straight from the OSM way/relation
    when present. match_type is 'exact' or 'fuzzy'; match_ratio is the
    SequenceMatcher score (1.0 for exact, ≥0.86 for fuzzy)."""
    __tablename__ = "dld_building_osm_coords"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    building_id: Mapped[UUID] = mapped_column(
        ForeignKey("dld_buildings_derived.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    dld_name: Mapped[str] = mapped_column(String(255), nullable=False)
    osm_name: Mapped[str] = mapped_column(String(255), nullable=False)
    lat: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    lon: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    osm_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    osm_kind: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    match_type: Mapped[str] = mapped_column(String(8), nullable=False)
    match_ratio: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    floors: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    building_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DldBuildingRentHistory(Base):
    """Per-(building, year) Ejari rent aggregates from 2021–2026 export.

    Matched to dld_buildings_derived via (project_name, area_id) — the
    synthetic dim built from the rent stream itself. dld_building_id is
    kept for back-compat with the 47-row dld_buildings table but is
    largely empty on new rows.
    """
    __tablename__ = "dld_building_rent_history"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_building_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_buildings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dld_buildings_derived_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_buildings_derived.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    project_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    project_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    median_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    median_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    renew_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    person_contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    authority_contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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


class DldAreaLifestyleScore(Base):
    """Per-area lifestyle signal derived from rent-row nearest_* columns.

    Scoring per the spec:
      metro_score    — function of distinct metro stations near the area
      mall_score     — Dubai Mall=10, MoE=9, City Centre Mirdif=8,
                       Marina Mall=8, Ibn-e-Battuta=7, others 0-6
      landmark_score — Burj Khalifa/Downtown=10, Burj Al Arab=9,
                       Expo 2020=7, IMG/Sports City/Motor City=6,
                       Airports=7/5, others 5-6
      overall_score  — mean of the three components
    """
    __tablename__ = "dld_area_lifestyle_scores"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="CASCADE"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    metro_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    mall_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    landmark_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    overall_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    nearest_metro: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nearest_mall: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nearest_landmark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    metro_stations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DldBuildingsSales(Base):
    """Synthetic per-(building_name_en, area) building entity extracted from
    the transactions stream. Parallel to dld_buildings_derived (which is
    rents-side) — together they give 4,900+ buildings vs the 47 the
    published DLD buildings CSV carries."""
    __tablename__ = "dld_buildings_sales"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    building_name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    building_name_slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    master_project_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_transactions: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    avg_sale_price_ready: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_sale_price_offplan: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_ppsf_ready: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    avg_ppsf_offplan: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    median_sale_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    min_sale_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    max_sale_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    years_covered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_seen_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_seen_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_transaction_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    parking_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    bulk_transaction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "building_name_en", "dld_area_id",
            name="uq_dld_buildings_sales_name_area",
        ),
    )


class DldBedroomBenchmark(Base):
    """Per (area, bedroom_type, reg_type, year) sale price benchmark — uses
    rooms_en from the transactions stream as the bedroom granularity that
    dld_rent_benchmarks's size_band coarsens away."""
    __tablename__ = "dld_bedroom_benchmarks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="CASCADE"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    bedroom_type: Mapped[str] = mapped_column(String(16), nullable=False)
    reg_type: Mapped[str] = mapped_column(String(16), nullable=False)  # ready / off_plan
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_price_aed: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    median_price_aed: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_ppsf: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "area_name_norm", "bedroom_type", "reg_type", "year",
            name="uq_dld_bedroom_benchmarks_key",
        ),
    )


class DldGiftTransfer(Base):
    """Per-(area, year) gift-transfer counts. Kept out of price math entirely
    so Grants and other ownership transfers don't pollute avg sale prices."""
    __tablename__ = "dld_gift_transfers"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    transfer_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("area_name_norm", "year", name="uq_dld_gift_transfers_area_year"),
    )


class DldLaborCampStats(Base):
    """Per-(area, year) bulk Labor Camp aggregates.

    Labor camps run AED 1.7M–9.5M average annual contracts — including them
    in the residential benchmark inflates every number. This table keeps the
    signal accessible for B2B (property managers, institutional investors)
    without contaminating consumer-facing residential rent comparisons.
    """
    __tablename__ = "dld_labor_camp_stats"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_rooms_per_contract: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    avg_annual_amount: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    median_annual_amount: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    total_annual_income: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("area_name_norm", "year", name="uq_dld_labor_camp_stats_area_year"),
    )


class DldCommercialBenchmark(Base):
    """Per-(area, property_category, year) office/retail/warehouse benchmarks.

    Separate from dld_rent_benchmarks because commercial economics aren't
    interchangeable with residential — same building can host a flat and a
    shop with wildly different per-sqft economics, and consumer-facing rent
    queries should never accidentally blend the two.
    """
    __tablename__ = "dld_commercial_benchmarks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    property_category: Mapped[str] = mapped_column(String(32), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    median_annual_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    avg_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    median_rent_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    sample_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "area_name_norm", "property_category", "year",
            name="uq_dld_commercial_benchmarks_key",
        ),
    )


class DldLeaseExpiryForecast(Base):
    """Per-(area, project, sub_type, expiry_month) forward-looking availability.

    Derived from Person residential contracts whose end_date falls in a future
    month. estimated_available is contract_count × 0.39 (blended non-renewal
    rate from historical Person + Renewed = 61%, Person + New = 45%).
    renewal_probability is the bucket-level blend so frontends can show the
    "X units expiring next month, ~Y% likely to renew" signal honestly.
    """
    __tablename__ = "dld_lease_expiry_forecast"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dld_area_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dld_areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False)
    project_name_en: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    property_sub_type: Mapped[str] = mapped_column(String(32), nullable=False)
    expiry_month: Mapped[str] = mapped_column(String(7), nullable=False)  # 'YYYY-MM'
    contract_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimated_available: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_last_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    renewal_probability: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
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


class DldAreaPopulation(Base):
    """Official Digital Dubai 2024 community-level population + area-size
    statistics. Keyed by community_code (DLD's 3-digit sector code, e.g. 346
    = Business Bay). Source: Digital Dubai Official Statistics 2024 PDF.

    Joins to dld_canonical_areas via normalized area_name_en. ~126 areas
    covered (the inhabited subset of Dubai's 9 sectors).
    """
    __tablename__ = "dld_area_population"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    community_code: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    area_name_en: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    area_name_norm: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    area_name_ar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sector: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    total_population: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    area_km2: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    population_density: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    source: Mapped[str] = mapped_column(
        String(64), default="Digital Dubai 2024", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
