"""Community ↔ admin-sector aliases for Dubai areas.

DLD ships two area taxonomies:
  - buildings.csv uses admin-sector names: "Wadi Al Safa 5", "Al Hebiah Fifth"
  - transactions/rents.csv use community names: "Arabian Ranches", "Damac Hills 2"

Both taxonomies live as separate rows in `dld_areas`. Users search by the
community name (what's on signs, listings, WhatsApp groups), but the
building-level data is filed under the admin-sector name. This map lets us
expand a community → list of admin sectors and roll up Building X-Ray for
the master-planned communities where DLD actually publishes building data.

Tower-density communities (Business Bay, Marina, Downtown, Burj Khalifa,
JBR, Palm Jumeirah) are NOT in this map because DLD's buildings.csv does
not cover them — those are individual strata towers, not master-planned
projects. The frontend renders a friendly empty-state for those instead.

Maintenance note: the source of truth for what's in the buildings dataset
is the production DB. When new master-planned communities go live in DLD
(e.g. a new Nshama project), add the mapping here.

All keys + values are `name_norm` (lowercase, space-separated).
"""
from __future__ import annotations

# community_name_norm  →  list of admin_sector name_norm values
# Ordering inside the list doesn't matter; the lookup is set membership.
COMMUNITY_TO_ADMIN_SECTORS: dict[str, list[str]] = {
    # Damac Hills 2 (formerly Akoya Oxygen) — single admin sector, big footprint
    "damac hills 2": ["al hebiah fifth"],
    "akoya oxygen": ["al hebiah fifth"],
    "akoya": ["al hebiah fifth"],

    # Damac Hills (original Akoya) — Hadaeq Sheikh MBR + scattered Al Hebiah
    "damac hills": ["hadaeq sheikh mohammed bin rashid", "al hebiah fourth"],

    # Arabian Ranches family — Wadi Al Safa 3/5/2 cluster.
    # wadi al safa 7 was removed from this list — it geographically sits in
    # the Majan/Dubailand corridor, not the Ranches, and was double-attributing.
    "arabian ranches": [
        "wadi al safa 3", "wadi al safa 5", "wadi al safa 2"
    ],
    "arabian ranches 2": ["wadi al safa 3", "wadi al safa 5"],
    "arabian ranches 3": ["wadi al safa 5"],
    "arabian ranches iii": ["wadi al safa 5"],

    # Majan (Dubailand) — Wadi Al Safa 7 admin sector
    "majan": ["wadi al safa 7"],

    # Town Square Dubai (Nshama)
    "town square": ["al yelayiss 1", "al yelayiss 2"],
    "town square dubai": ["al yelayiss 1", "al yelayiss 2"],

    # Tilal Al Ghaf (Majid Al Futtaim)
    "tilal al ghaf": ["al yelayiss 5"],

    # Dubai Investment Park
    "dubai investment park": [
        "dubai investment park first", "dubai investment park second"
    ],
    "dip": ["dubai investment park first", "dubai investment park second"],

    # Dubai South / Expo / Aviation City — multiple admin sectors
    "dubai south": [
        "madinat al mataar", "saih shuaib 1", "saih shuaib 2", "saih shuaib 4"
    ],
    "expo city": ["madinat al mataar"],

    # Jumeirah Village Circle (JVC) — Nakheel
    "jumeirah village circle": ["al barsha south fourth"],
    "jvc": ["al barsha south fourth"],

    # Jumeirah Village Triangle (JVT)
    "jumeirah village triangle": ["al barshaa south third"],
    "jvt": ["al barshaa south third"],

    # Arjan — overlaps with JVT in Al Barshaa South Third (confirmed via the
    # SIRAJ TOWER sample: filed there with master_project = Arjan). Both
    # communities legitimately share the admin sector, so attributing
    # 3,506 contracts to each isn't double-counting — they both physically
    # encompass the same buildings.
    "arjan": ["al barshaa south third"],

    # MBR City — Sobha Hartland, District One, Meydan
    "mbr city": ["hadaeq sheikh mohammed bin rashid"],
    "mohammed bin rashid city": ["hadaeq sheikh mohammed bin rashid"],
    "district one": ["hadaeq sheikh mohammed bin rashid"],
    "sobha hartland": ["hadaeq sheikh mohammed bin rashid"],

    # The Villa / Nad Al Sheba
    "the villa": ["nad al shiba first"],
    "nad al sheba": ["nad al shiba first"],

    # Dubailand area (multiple master-planned subcommunities)
    "dubailand": ["al yufrah 1", "madinat hind 4"],

    # International City
    "international city": ["warsan fourth"],

    # Mira / Reem (Emaar)
    "reem": ["me'aisem first", "me'aisem second"],
    "mira": ["me'aisem first"],
}


def _norm(name: str) -> str:
    return (name or "").strip().lower()


def community_to_admin_sectors(name_norm: str) -> list[str] | None:
    """Return the list of admin sectors for a community, or None if the
    name isn't a community in our map. Callers should fall back to using
    the original name_norm when this returns None."""
    return COMMUNITY_TO_ADMIN_SECTORS.get(_norm(name_norm))


# Display map: which admin sector should resolve to which canonical community
# name on building detail subtitles. Hand-picked to use the modern marketing
# name (e.g. "Damac Hills 2" not "Akoya Oxygen", "Arabian Ranches" not
# "Wadi Al Safa N"). Falls back to None when there's no curated alias.
_ADMIN_TO_CANONICAL_COMMUNITY: dict[str, str] = {
    "al hebiah fifth": "Damac Hills 2",
    "hadaeq sheikh mohammed bin rashid": "MBR City",
    "al hebiah fourth": "Damac Hills",
    "wadi al safa 5": "Arabian Ranches",
    "wadi al safa 3": "Arabian Ranches",
    "wadi al safa 2": "Arabian Ranches",
    "wadi al safa 7": "Majan",
    "al yelayiss 1": "Town Square",
    "al yelayiss 2": "Town Square",
    "al yelayiss 5": "Tilal Al Ghaf",
    "dubai investment park first": "Dubai Investment Park",
    "dubai investment park second": "Dubai Investment Park",
    "madinat al mataar": "Dubai South",
    "saih shuaib 1": "Dubai South",
    "saih shuaib 2": "Dubai South",
    "saih shuaib 4": "Dubai South",
    "al barsha south fourth": "Jumeirah Village Circle",
    "al barshaa south third": "Jumeirah Village Triangle",
    "nad al shiba first": "Nad Al Sheba",
    "al yufrah 1": "Dubailand",
    "madinat hind 4": "Dubailand",
    "warsan fourth": "International City",
    "me'aisem first": "Reem",
    "me'aisem second": "Reem",
}


def admin_sector_to_community(name_norm: str) -> str | None:
    """Return the display-friendly community name for an admin sector, or
    None if no curated alias exists. Already title-cased for display."""
    return _ADMIN_TO_CANONICAL_COMMUNITY.get(_norm(name_norm))


# Tower-density communities — DLD has rent contracts and area metrics for
# these, but does NOT publish building-level data because they're individual
# strata towers, not master-planned projects. Frontend uses this list to
# render an honest empty-state on /areas/[id] instead of silently hiding the
# top-buildings section.
TOWER_DENSITY_COMMUNITIES: frozenset[str] = frozenset({
    "business bay",
    "marsa dubai",        # the admin name for Dubai Marina
    "dubai marina",
    "burj khalifa",       # Downtown / Burj Khalifa community
    "downtown dubai",
    "palm jumeirah",
    "jbr",
    "jumeirah beach residence",
    "blue waters",
    "city walk",
    "old town",
    "al sufouh first",
    "al sufouh second",
    "nad al hamar",
})


def is_tower_density(name_norm: str) -> bool:
    return _norm(name_norm) in TOWER_DENSITY_COMMUNITIES


# -----------------------------------------------------------------------------
# Marketing community  →  PRIMARY cadastral area that holds the multi-year
# history (price / rent / yield / bedroom / lifestyle / buildings).
#
# Background: DLD's current-snapshot export (transactions-2026-06-01.csv) files
# many communities under their marketing names (Dubai Marina, JVC, Dubai Hills),
# but the historical exports (2009–2026) file the SAME physical areas under
# their cadastral / admin-sector names (Marsa Dubai, Al Barsha South Fourth,
# Hadaeq Sheikh Mohammed Bin Rashid). The history tables (dld_price_history etc.)
# are keyed on the cadastral name, so a /areas/<marketing> page found nothing.
#
# This map lets the resolver DISPLAY the marketing name while QUERYING the
# cadastral twin for history. Every target below was validated against the
# production DB to actually hold history (see Phase 2 of FLOXCY-REPLAN-2026.md);
# the only exception is `tilal al ghaf` (al yelayiss 5 has buildings but no
# multi-year history yet) — it resolves but renders an honest empty-state.
#
# Derivation: curated COMMUNITY_TO_ADMIN_SECTORS (primary = the sector with the
# most history) + high-confidence tower / spelling pairs from
# docs/area-alias-table.csv, each cross-checked against dld_buildings to confirm
# the cadastral home (e.g. all "Dubai Hills" buildings sit in Hadaeq SMBR).
MARKETING_TO_CADASTRAL_PRIMARY: dict[str, str] = {
    "akoya": "al hebiah fifth",
    "akoya oxygen": "al hebiah fifth",
    "al jaddaf": "al jadaf",
    "arabian ranches": "wadi al safa 5",
    "arabian ranches 2": "wadi al safa 5",
    "arabian ranches 3": "wadi al safa 5",
    "arabian ranches iii": "wadi al safa 5",
    "arjan": "al barshaa south third",
    "city walk": "al wasl",
    "creek harbour": "al khairan first",
    "damac hills": "al hebiah fourth",
    "damac hills 2": "al hebiah fifth",
    "deira islands": "palm deira",
    "difc": "zaabeel second",
    "dip": "dubai investment park second",
    "district one": "hadaeq sheikh mohammed bin rashid",
    "downtown": "burj khalifa",
    "downtown dubai": "burj khalifa",
    "dubai creek harbour": "al khairan first",
    "dubai hills": "hadaeq sheikh mohammed bin rashid",
    "dubai hills estate": "hadaeq sheikh mohammed bin rashid",
    "dubai investment park": "dubai investment park second",
    "dubai islands": "madinat dubai almelaheyah",
    "dubai marina": "marsa dubai",
    "dubai maritime city": "madinat dubai almelaheyah",
    "dubai south": "madinat al mataar",
    "dubailand": "madinat hind 4",
    "emaar beachfront": "marsa dubai",
    "expo city": "madinat al mataar",
    "expo city dubai": "madinat al mataar",
    "international city": "warsan fourth",
    "jaddaf": "al jadaf",
    "jbr": "marsa dubai",
    "jumeirah beach residence": "marsa dubai",
    "jumeirah village circle": "al barsha south fourth",
    "jumeirah village triangle": "al barshaa south third",
    "jvc": "al barsha south fourth",
    "jvt": "al barshaa south third",
    "majan": "wadi al safa 7",
    "marina": "marsa dubai",
    "maritime city": "madinat dubai almelaheyah",
    "mbr city": "hadaeq sheikh mohammed bin rashid",
    "meydan": "nad al shiba first",
    "mira": "me'aisem first",
    "mohammed bin rashid city": "hadaeq sheikh mohammed bin rashid",
    "nad al sheba": "nad al shiba first",
    "palm jebel ali": "palm jabal ali",
    "reem": "me'aisem first",
    "sobha hartland": "hadaeq sheikh mohammed bin rashid",
    "the villa": "nad al shiba first",
    "tilal al ghaf": "al yelayiss 5",
    "town square": "al yelayiss 2",
    "town square dubai": "al yelayiss 2",
    "za'abeel": "zaabeel second",
}


def cadastral_data_norm(name_norm: str) -> str:
    """Resolve a (possibly marketing) area name to the cadastral name_norm
    where the multi-year DLD history lives.

    Returns the input unchanged when no alias applies — i.e. the area already
    carries its own history, or it is unknown. This keeps every already-working
    area byte-for-byte identical; only aliased marketing names are redirected.
    """
    n = _norm(name_norm)
    return MARKETING_TO_CADASTRAL_PRIMARY.get(n, n)
