"""Shared classification + normalization for the transactions ETL.

Owns the exact taxonomy choices the user spec defined so the ETL stays
explicit instead of relying on coarse trans_group filters:

  SALE_PROCEDURES  — only these procedure_name_en values feed price math
  GIFT_PROCEDURES  — kept separately in dld_gift_transfers
  TX_AMOUNT_MIN    — rows below this are dropped entirely (no-price gifts)
  TX_BULK_THRESHOLD — flag (not drop) above this (portfolio / whole-building)
  TX_AREA_MAX      — drop procedure_area above this for Unit-type sales
                     (anything above is a Land/Building misclassified row)
"""
from __future__ import annotations

import re
from typing import Optional

# ---------------------------------------------------------------------------
# Procedure taxonomy
# ---------------------------------------------------------------------------

# These four procedure_name_en values are the only ones that count as
# market-priced sales. Each maps to a reg_type that the ETL writes.
#
# "Sell - Pre registration" is a 'Sell - Pre registration' off-plan sale —
# regardless of the row's reg_type_en value, the procedure name itself is
# more specific than the registration field.
SALE_PROCEDURES: dict[str, str] = {
    "Sell - Pre registration": "off_plan",
    "Sell": "ready",
    "Delayed Sell": "ready",
    "Lease to Own Registration": "ready",
}

# Gift/grant procedures — stored in dld_gift_transfers but never feed price
# math.
GIFT_PROCEDURES: frozenset[str] = frozenset({"Grant", "Gift"})


def classify_procedure(procedure_name_en: Optional[str]) -> tuple[Optional[str], str]:
    """Returns (reg_type, track):
      track ∈ {"sale", "gift", "skip"}
      reg_type ∈ {"ready", "off_plan", None}
    """
    p = (procedure_name_en or "").strip()
    if not p:
        return None, "skip"
    if p in SALE_PROCEDURES:
        return SALE_PROCEDURES[p], "sale"
    if p in GIFT_PROCEDURES:
        return None, "gift"
    return None, "skip"


# ---------------------------------------------------------------------------
# Anomaly bounds (per spec)
# ---------------------------------------------------------------------------

TX_AMOUNT_MIN = 1_000.0           # under this is a no-price gift; drop
TX_BULK_THRESHOLD = 500_000_000.0  # flag (keep) above this
TX_AREA_MAX_UNIT = 50_000.0        # unit-sale procedure_area above this is
                                   # impossible — drop
TX_PPSF_MIN = 100.0
TX_PPSF_MAX = 20_000.0
SQM_TO_SQFT = 10.7639


def is_bulk_transaction(amount: float) -> bool:
    return amount > TX_BULK_THRESHOLD


# ---------------------------------------------------------------------------
# Property-usage Arabic leak
# ---------------------------------------------------------------------------

KNOWN_USAGE_VALUES: frozenset[str] = frozenset({
    "Residential", "Commercial", "Other", "Hospitality", "Industrial",
    "Multi-Use", "Agricultural", "Storage", "Residential / Commercial",
})


def normalize_usage(usage_en: Optional[str]) -> str:
    """Map "أخرى" (Arabic 'Other' leaked into the en column) and any other
    non-allowlisted values to "Other"."""
    u = (usage_en or "").strip()
    if not u:
        return "Other"
    if u in KNOWN_USAGE_VALUES:
        return u
    return "Other"


# ---------------------------------------------------------------------------
# Metro name typo fixes
# ---------------------------------------------------------------------------

METRO_NAME_FIXES: dict[str, str] = {
    "Buj Khalifa Dubai Mall Metro Station": "Burj Khalifa Dubai Mall Metro Station",
}


def normalize_metro(metro_en: Optional[str]) -> Optional[str]:
    """Fix known DLD-side typos in metro station names. Returns None for
    blank input."""
    m = (metro_en or "").strip()
    if not m:
        return None
    return METRO_NAME_FIXES.get(m, m)


# ---------------------------------------------------------------------------
# Bedroom normalization (rooms_en → Studio / 1BR / 2BR / 3BR / 4BR / 5BR+)
# ---------------------------------------------------------------------------

_ROOMS_BR_RE = re.compile(r"(\d+)\s*B/?R", re.IGNORECASE)


def normalize_bedroom(rooms_en: Optional[str]) -> Optional[str]:
    """Maps DLD rooms_en values to a stable bedroom_type code or None.

    Recognized:
      Studio                → "Studio"
      1 B/R … 10 B/R        → "1BR" … "10BR" (5+ collapse to "5BR+")
      PENTHOUSE             → "Penthouse"
      Single Room           → "Single Room"
      Office/Shop/Store/etc → None (not residential bedroom granularity)
    """
    s = (rooms_en or "").strip()
    if not s:
        return None
    up = s.upper()
    if up == "STUDIO":
        return "Studio"
    if up == "PENTHOUSE":
        return "Penthouse"
    if up == "SINGLE ROOM":
        return "Single Room"
    m = _ROOMS_BR_RE.search(up)
    if m:
        try:
            n = int(m.group(1))
        except ValueError:
            return None
        if n <= 0:
            return None
        if n >= 5:
            return "5BR+"
        return f"{n}BR"
    return None


# ---------------------------------------------------------------------------
# Slug helper (re-export so both ETLs share one definition)
# ---------------------------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slug(name: str) -> str:
    s = (name or "").strip().lower()
    return _SLUG_RE.sub("-", s).strip("-")[:255]
