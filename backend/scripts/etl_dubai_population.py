"""Digital Dubai 2024 population ETL.

Reads backend/data/dubai_population_2024.json (126 inhabited Dubai
communities, sourced from the official Digital Dubai Statistics Bulletin
2024 PDF) and bulk-loads dld_area_population. Idempotent: TRUNCATE +
INSERT every run.

Match step: tries to backfill community_code on dld_canonical_areas by
normalized area_name_en. Reports the join hit-rate but does not fail
on unmatched rows — DLD's canonical roster is a superset of the
inhabited communities in the population data, so some misses are
expected (industrial / land-only zones).

Run patterns:
    python scripts/etl_dubai_population.py             # dry-run
    python scripts/etl_dubai_population.py --to-db     # write to Postgres
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path

DATA_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "dubai_population_2024.json"
)

# Community-code → DldArea.name_norm overrides. The PDF uses spellings that
# don't always match DLD's internal area roster (e.g. "Jumeira" vs
# "Jumeirah", "Al Qouz" vs "Al Goze", "Umm" vs "Um"). Without these,
# /areas/[id] pages can't join population → area on a single SQL key. Built
# from a one-shot prod audit + difflib spot-check against dld_areas.name_norm
# (43 unmatched rows analysed; 40 with clean single-candidate matches are
# aliased here; 3 with no good match — Deira Corniche, Al Qusais First/Second
# — are intentionally left to fall through to matched=false).
COMMUNITY_CODE_ALIASES: dict[int, str] = {
    111: "al-cornich",
    113: "al dhagaya",
    116: "eyal nasser",
    117: "al mararr",
    119: "al rega",
    124: "al murqabat",
    125: "rega al buteen",
    128: "al khabeesi",
    132: "al waheda",
    134: "al mamzer",
    213: "nad shamma",
    215: "um ramool",
    265: "oud al muteena",
    281: "al khawaneej first",
    282: "al khawaneej second",
    311: "shandagha",
    312: "al suq al kabeer",
    321: "madinat dubai almelaheyah",
    323: "al jafliya",
    332: "jumeirah first",
    342: "jumeirah second",
    352: "jumeirah third",
    353: "al saffa first",
    354: "al goze first",
    356: "um suqaim first",
    357: "al saffa second",
    358: "al goze third",
    359: "al goze fourth",
    362: "um suqaim second",
    366: "um suqaim third",
    394: "al thanayah fourth",
    415: "al khairan first",
    416: "nad al hamar",
    671: "al barshaa south first",
    672: "al barshaa south second",
    673: "al barshaa south third",
    685: "me'aisem first",
    811: "al warsan third",
    921: "al yelayiss 1",
    922: "al yelayiss 2",
}


def normalize(s: str) -> str:
    """Lowercase, collapse separators to single space — matches the
    canonical area_name_norm convention used elsewhere."""
    return re.sub(r"\s+", " ", s.strip().lower())


def resolve_norm(code: int, en_name: str) -> str:
    """Pick the DLD-aligned area_name_norm for an inbound population row.
    Falls back to a plain normalisation of the PDF's English name when no
    override is known."""
    if code in COMMUNITY_CODE_ALIASES:
        return COMMUNITY_CODE_ALIASES[code]
    return normalize(en_name)


def get_sync_db_url() -> str:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


def load_json() -> list[dict]:
    rows = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"Expected non-empty list in {DATA_PATH}")
    return rows


def write_to_db(rows: list[dict]) -> dict:
    import psycopg2

    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    stats: dict = {}
    try:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE dld_area_population RESTART IDENTITY")
            inserted = 0
            for r in rows:
                cur.execute(
                    """
                    INSERT INTO dld_area_population (
                        id, community_code, area_name_en, area_name_norm,
                        area_name_ar, sector, total_population, area_km2,
                        population_density, source
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        r["community_code"],
                        r["area_name_en"],
                        resolve_norm(r["community_code"], r["area_name_en"]),
                        r.get("area_name_ar"),
                        r["sector"],
                        r["total_population"],
                        r.get("area_km2"),
                        r.get("population_density"),
                        "Digital Dubai 2024",
                    ),
                )
                inserted += 1
            stats["inserted"] = inserted

            # ---- Match step: count DLD-area hits (what /community-profile
            # joins on) plus canonical hits for reference. ----
            cur.execute(
                """
                SELECT COUNT(DISTINCT p.community_code)
                FROM dld_area_population p
                INNER JOIN dld_areas a ON a.name_norm = p.area_name_norm
                """
            )
            dld_matched = int(cur.fetchone()[0] or 0)
            cur.execute(
                """
                SELECT COUNT(DISTINCT p.community_code)
                FROM dld_area_population p
                INNER JOIN dld_canonical_areas c
                    ON LOWER(c.area_name) = p.area_name_norm
                """
            )
            canon_matched = int(cur.fetchone()[0] or 0)
            stats["dld_matches"] = dld_matched
            stats["dld_match_rate"] = (
                round(dld_matched / inserted * 100, 1) if inserted else 0
            )
            stats["canonical_matches"] = canon_matched
            stats["canonical_match_rate"] = (
                round(canon_matched / inserted * 100, 1) if inserted else 0
            )

            # ---- Headline summaries ----
            cur.execute(
                "SELECT SUM(total_population), COUNT(*), MAX(population_density), "
                "MIN(population_density) FROM dld_area_population"
            )
            sum_pop, n, max_d, min_d = cur.fetchone()
            stats.update(
                {
                    "total_population": int(sum_pop or 0),
                    "areas_loaded": int(n or 0),
                    "max_density": float(max_d or 0),
                    "min_density": float(min_d or 0),
                }
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--to-db", action="store_true", help="actually write to Postgres")
    args = ap.parse_args()

    print(f"Loading {DATA_PATH}...", flush=True)
    rows = load_json()
    print(f"  {len(rows)} community rows in JSON", flush=True)
    print(
        f"  total population: {sum(r['total_population'] for r in rows):,}",
        flush=True,
    )
    print(
        f"  sectors covered: {sorted({r['sector'] for r in rows})}",
        flush=True,
    )
    print(
        f"  Business Bay (346) → "
        f"{next((r for r in rows if r['community_code'] == 346), {}).get('total_population', '—')}",
        flush=True,
    )

    if not args.to_db:
        print("\nDry-run only. Re-run with --to-db to write.", flush=True)
        return 0

    print("\nWriting to dld_area_population...", flush=True)
    stats = write_to_db(rows)
    print("\nDone.", flush=True)
    for k, v in stats.items():
        print(f"  {k}: {v}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
