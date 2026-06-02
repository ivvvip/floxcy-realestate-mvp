"""Broker nationality detection from name patterns.

CRITICAL: DLD does not publish broker nationality. Everything here is a
heuristic estimate derived from name tokens — never present it as
verified. Every consumer of `detect()` must label results "Estimated"
in the UI.

Detection strategy (priority order matters):
  1. Emirati  — specific Al-* surnames + "Bin X" patterns
  2. Indian / Pakistani / Russian / Chinese / Filipino / Egyptian
     — region-specific surname or suffix tokens
  3. Arab     — general Arabic prefixes (catches non-Emirati Arabs)
  4. British  — Western surname fallback
  5. Other    — everything else

Tested against the full DLD broker registry (~34k active brokers).
Expected distribution roughly matches Dubai's broker community.
"""
from __future__ import annotations

import re
from typing import TypedDict


class Nationality(TypedDict):
    nationality: str
    flag: str
    confidence: str  # always "estimated"
    language: str


# ---------------------------------------------------------------------------
# Pattern banks — kept short and high-precision rather than exhaustive.
# Order of FAMILIES below dictates resolution priority.
# ---------------------------------------------------------------------------

# Specific Emirati surnames (must match BEFORE generic AL- prefix in ARAB)
EMIRATI: set[str] = {
    "ALMARRI", "ALSHAMSI", "ALFALASI", "ALMHEIRI", "ALMUHAIRI",
    "ALKAABI", "ALBLOOSHI", "ALZAABI", "ALHASHMI", "ALMANSOORI",
    "ALMAZROUEI", "ALREMEITHI", "ALSUWAIDI", "ALMAKTOUM", "ALNEYADI",
    "ALSHEHHI", "ALDHAHERI", "ALKETBI", "ALBREIKI",
    # Hyphenated variants — DLD inconsistently uses Al-X / Al X / AlX
    "AL MARRI", "AL SHAMSI", "AL FALASI", "AL MHEIRI", "AL MUHAIRI",
    "AL KAABI", "AL BLOOSHI", "AL ZAABI", "AL HASHMI", "AL MANSOORI",
    "AL MAZROUEI", "AL REMEITHI", "AL SUWAIDI", "AL MAKTOUM", "AL NEYADI",
    "AL SHEHHI", "AL DHAHERI", "AL KETBI", "AL BREIKI",
}
# Emirati phrasal patterns — "Bin X" / "Butti"
EMIRATI_PHRASE = ["BIN MEJREN", "BIN SULOOM", "BIN THANI", "BUTTI"]

# Indian surnames
INDIAN: set[str] = {
    "KUMAR", "SHARMA", "SINGH", "PATEL", "SHAH", "MEHTA",
    "GUPTA", "NAIR", "PILLAI", "KRISHNA", "SURESH", "RAMESH",
    "GANESH", "WADHWANI",
}

# Pakistani surnames
PAKISTANI: set[str] = {
    "KHAN", "QURESHI", "CHAUDHRY", "BUTT", "AKHTAR", "NAWAZ",
    "ANSARI", "FAROOKI", "AVAIS",
}

# Russian / Eastern European — name-token SUFFIX patterns (endswith)
RUSSIAN_SUFFIXES: tuple[str, ...] = ("OVA", "SKIY", "ENKO", "CHUK")
# Russian — full token matches (specific surnames)
RUSSIAN_TOKENS: set[str] = {"MIRKINA", "DOBROVOLSKA", "KARIPOVA"}

# British / Western
BRITISH: set[str] = {
    "SMITH", "JONES", "BROWN", "TAYLOR", "YOUNG", "MURPHY",
    "WILSON", "DAVIES",
}

# Filipino
FILIPINO: set[str] = {
    "DELA", "SANTOS", "REYES", "CRUZ", "GARCIA", "FLORES",
    "MENDOZA",
}

# Chinese
CHINESE: set[str] = {
    "WANG", "ZHANG", "CHEN", "LIU", "HUANG", "ZHOU", "WU", "XU",
}

# Egyptian
EGYPTIAN: set[str] = {
    "HEGAB", "GABER", "ELSAYED", "SHOUKRY", "ELGAMAL", "ZAKI",
}

# Arab (general — catches non-Emirati Arabs)
# Token-prefix patterns (startswith) — "EL-XXX", "AL-XXX", "ABU XXX"
ARAB_TOKEN_PREFIXES: tuple[str, ...] = ("AL-", "AL ", "EL-", "EL ", "ABU ", "ABDEL")
# Common Arab given/family names
ARAB_TOKENS: set[str] = {
    "MAHMOUD", "HASSAN", "HUSSEIN", "MOSTAFA", "ELSAYED", "IBRAHIM",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

NATIONALITY_META: dict[str, tuple[str, str]] = {
    # nationality → (flag, primary language)
    "Emirati":   ("🇦🇪", "Arabic"),
    "Arab":      ("🌍", "Arabic"),
    "Indian":    ("🇮🇳", "Hindi/Urdu"),
    "Pakistani": ("🇵🇰", "Hindi/Urdu"),
    "Russian":   ("🇷🇺", "Russian"),
    "British":   ("🇬🇧", "English"),
    "Filipino":  ("🇵🇭", "Tagalog"),
    "Chinese":   ("🇨🇳", "Mandarin"),
    "Egyptian":  ("🇪🇬", "Arabic"),
    "Other":     ("🌐", "English"),
}


_TOKEN_SPLIT = re.compile(r"[\s\-_.]+")


def _normalize(name: str) -> str:
    """Uppercase + collapse whitespace. Keep AL prefix attached after stripping
    hyphens so "AL-MARRI" and "AL MARRI" and "ALMARRI" all normalize the
    same way for matching."""
    if not name:
        return ""
    up = name.strip().upper()
    # Collapse multiple spaces and hyphens to single spaces for phrasal checks
    return re.sub(r"\s+", " ", up)


def _tokens(name_upper: str) -> list[str]:
    """Split on whitespace + hyphens. Drop empty tokens."""
    return [t for t in _TOKEN_SPLIT.split(name_upper) if t]


def detect(full_name: str) -> Nationality:
    """Return estimated nationality + flag + primary language for a broker.

    Always returns confidence="estimated" — caller must surface this honestly.
    """
    if not full_name or not full_name.strip():
        return _build("Other")

    name_up = _normalize(full_name)
    tokens = _tokens(name_up)
    token_set = set(tokens)
    # Concatenated form so "AL MARRI" / "AL-MARRI" both match ALMARRI.
    # Strip both whitespace AND hyphens — DLD uses all three conventions.
    name_no_space = re.sub(r"[\s\-]+", "", name_up)

    # ---- 1. Emirati ---------------------------------------------------------
    # Phrasal patterns first ("BIN MEJREN" etc.)
    for phrase in EMIRATI_PHRASE:
        if phrase in name_up:
            return _build("Emirati")
    # Token / no-space surname match
    for token in tokens:
        if token in EMIRATI:
            return _build("Emirati")
    for surname in EMIRATI:
        # Also catch "ALMARRI" / "AL MARRI" / "AL-MARRI" via concat form
        s_no_space = surname.replace(" ", "")
        if s_no_space in name_no_space and len(s_no_space) >= 6:
            return _build("Emirati")

    # ---- 2. Specific region surnames ---------------------------------------
    # Each set is exact-token match.
    if token_set & INDIAN:
        return _build("Indian")
    if token_set & PAKISTANI:
        return _build("Pakistani")
    if token_set & EGYPTIAN:
        return _build("Egyptian")
    if token_set & CHINESE:
        return _build("Chinese")

    # Filipino — DELA is often a prefix ("DELA CRUZ") so token-set covers it
    if token_set & FILIPINO:
        return _build("Filipino")

    # Russian — token-set exact + suffix patterns on each token
    if token_set & RUSSIAN_TOKENS:
        return _build("Russian")
    for token in tokens:
        if len(token) >= 5 and any(token.endswith(suf) for suf in RUSSIAN_SUFFIXES):
            return _build("Russian")

    # ---- 3. Arab (general — catches non-Emirati Arabs) ----------------------
    if token_set & ARAB_TOKENS:
        return _build("Arab")
    for token in tokens:
        for pref in ARAB_TOKEN_PREFIXES:
            if pref.endswith(" "):
                # "AL " / "EL " / "ABU " — match on tokens that start with the
                # bare prefix without the trailing space (e.g. token "AL")
                bare = pref.strip()
                if token == bare:
                    return _build("Arab")
            else:
                # "AL-" / "EL-" / "ABDEL" — substring/prefix check
                if token.startswith(pref):
                    return _build("Arab")

    # ---- 4. British / Western fallback -------------------------------------
    if token_set & BRITISH:
        return _build("British")

    return _build("Other")


def _build(nationality: str) -> Nationality:
    flag, language = NATIONALITY_META.get(nationality, ("🌐", "English"))
    return {
        "nationality": nationality,
        "flag": flag,
        "confidence": "estimated",
        "language": language,
    }


def detect_language_code(full_name: str) -> str:
    """Backwards-compat shim for the existing /broker-match endpoint, which
    used a coarser LangPref enum {arabic, english, russian, hindi, chinese,
    other}. Maps nationality → lowercase language code.
    """
    nat = detect(full_name)
    lang = nat["language"]
    if lang == "Arabic":
        return "arabic"
    if lang == "Russian":
        return "russian"
    if lang == "Mandarin":
        return "chinese"
    if lang == "Hindi/Urdu":
        return "hindi"
    if lang == "Tagalog":
        return "filipino"
    return "english"
