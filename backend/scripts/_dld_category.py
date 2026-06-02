"""Shared property-category + bulk-contract + sub-type detection for the
DLD ETL pipeline.

Pure-functional. Consumed by etl_dld.py and etl_dld_rent_history.py so the
taxonomy is defined exactly once. Mirrors the spec in CURRENT_STATE.md's
"URGENT FIX" requirement: residential apartment/villa/hotel_apt are the
only inputs to the rent benchmarks + yield series; labor camps, commercial,
and whole-building leases each go to their own table.

Category set:
    apartment       — Flat + Studio (Residential)
    villa           — Villa + Complex Villas (Residential)
    hotel_apt       — Hotel Apartment (Residential)
    labor_camp      — Labor Camps + sub-type 'Room in Labor Camp' etc.
    office          — Office (Commercial)
    retail          — Shop + Showroom + Restaurant (Commercial)
    warehouse       — Warehouse + Factory + Store (Commercial)
    whole_building  — Building (entire-building lease via ejari_bus_property_type_en)
    other           — fallback for anything unrecognized
"""
from __future__ import annotations

import re
from typing import Optional

# ---------------------------------------------------------------------------
# Category classification
# ---------------------------------------------------------------------------

RESIDENTIAL_CATEGORIES = frozenset({"apartment", "villa", "hotel_apt"})
COMMERCIAL_CATEGORIES = frozenset({"office", "retail", "warehouse"})
LABOR_CAMP_CATEGORY = "labor_camp"
WHOLE_BUILDING_CATEGORY = "whole_building"
OTHER_CATEGORY = "other"

# Per-category residential caps. The lower bound is shared. The upper bound
# is generous enough to keep legitimate luxury rentals (Burj Khalifa, Palm
# penthouses, Emirates Hills villas) while still cutting bulk leases. Above
# the cap → dropped from residential aggregations.
RESIDENTIAL_AMOUNT_MIN = 10_000.0
RESIDENTIAL_AMOUNT_CAPS: dict[str, float] = {
    "apartment": 2_000_000.0,
    "villa":     5_000_000.0,
    "hotel_apt": 3_000_000.0,
}


def residential_amount_cap(category: str) -> Optional[float]:
    """Returns the upper cap for residential categories, or None for
    non-residential (which don't have a cap)."""
    return RESIDENTIAL_AMOUNT_CAPS.get(category)


def classify_property(
    ejari_property_type_en: Optional[str],
    ejari_property_sub_type_en: Optional[str] = None,
    ejari_bus_property_type_en: Optional[str] = None,
) -> str:
    """Map a contract to its property_category. Order matters — checks the
    explicit type field first, then sub-type sentinels, then commercial
    types, then the bus-property whole-building flag.

    Type strings come straight from DLD with some quirks the strip+match
    has to handle:
      - "Studio " has a trailing space in the CSV.
      - "Hotel apartments" uses a lowercase 'a' (not "Hotel Apartment").
      - "Hotel" alone also exists alongside "Hotel apartments" — both go
        into the hotel_apt bucket.
      - "Staff Accommodation" is commercially equivalent to a labor camp
        (bulk worker housing) so it joins the labor_camp track to keep it
        out of residential benchmarks.
    """
    pt = (ejari_property_type_en or "").strip()
    sub = (ejari_property_sub_type_en or "").strip().lower()
    bus = (ejari_bus_property_type_en or "").strip()

    # Labor camp / bulk worker housing wins over everything — a sub-type
    # marker or a worker-housing pt is a strong signal we want to keep out
    # of residential benchmarks regardless of how the type field is spelled.
    if "labor camp" in sub:
        return LABOR_CAMP_CATEGORY
    if pt in ("Labor Camps", "Staff Accommodation"):
        return LABOR_CAMP_CATEGORY

    # Residential — apartment includes Flat + Studio (per spec).
    if pt in ("Flat", "Studio"):
        return "apartment"
    if pt in ("Villa", "Complex Villas"):
        return "villa"
    if pt in ("Hotel Apartment", "Hotel apartments", "Hotel"):
        return "hotel_apt"

    # Commercial.
    if pt in ("Office", "Clinic"):
        return "office"
    if pt in ("Shop", "Showroom", "Restaurant", "Kiosk"):
        return "retail"
    if pt in ("Warehouse", "Factory", "Store", "Workshop", "Warehouse complex"):
        return "warehouse"

    # Whole-building leases: the unit-type field is empty/odd, but
    # bus_property_type_en exposes "Building".
    if bus == "Building" or pt == "Building":
        return WHOLE_BUILDING_CATEGORY

    return OTHER_CATEGORY


def is_residential(category: str) -> bool:
    return category in RESIDENTIAL_CATEGORIES


def is_commercial(category: str) -> bool:
    return category in COMMERCIAL_CATEGORIES


# ---------------------------------------------------------------------------
# Bulk-contract flag
# ---------------------------------------------------------------------------

def is_bulk_contract(
    category: str,
    annual_amount: Optional[float],
    no_of_prop: Optional[int],
) -> bool:
    """A contract is bulk when no_of_prop > 1 — one signature covering
    multiple units.

    The earlier amount-based check (>500K = bulk) was retired when the
    per-category caps moved up. Under the new caps a 1.8M Burj Khalifa
    penthouse is legitimate luxury residential, not bulk. Anything above
    the per-category cap is dropped from the residential pool entirely
    before this check runs, so the amount path here is redundant.
    """
    if no_of_prop is not None and no_of_prop > 1:
        return True
    return False


# ---------------------------------------------------------------------------
# Sub-type → 1BR/2BR/Studio normalizer
# ---------------------------------------------------------------------------

_BR_PATTERN = re.compile(r"(\d+)\s*bed", re.IGNORECASE)


def normalize_subtype(ejari_property_sub_type_en: Optional[str]) -> str:
    """Returns one of: 'Studio', '1BR', '2BR', '3BR', '4BR', '5BR+', 'Other'.

    DLD's sub-type strings look like 'Studio', '1 bed room+hall',
    '4 bed rooms+hall', etc. Anything else (or empty) returns 'Other'.
    """
    s = (ejari_property_sub_type_en or "").strip()
    if not s:
        return "Other"
    low = s.lower()
    if "studio" in low:
        return "Studio"
    m = _BR_PATTERN.search(low)
    if not m:
        return "Other"
    try:
        n = int(m.group(1))
    except ValueError:
        return "Other"
    if n <= 0:
        return "Studio"
    if n >= 5:
        return "5BR+"
    return f"{n}BR"
