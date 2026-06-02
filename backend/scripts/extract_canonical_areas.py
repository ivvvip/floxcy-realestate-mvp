"""Build the canonical DLD area registry from the raw CSV exports.

Sources of truth (in this order):
    1. ~/dld-data/transactions_2021_2026.csv  (column: area_name_en)
    2. ~/dld-data/rents_2021_2026.csv         (column: area_name_en)
    3. ~/dld-data/lands-2026-06-01.csv        (column: AREA_EN)

Standardisation rules (applied in order):
    a) trim whitespace, normalise internal whitespace
    b) insert a space between any letter and a trailing digit run:
       'AlLayan1' → 'AlLayan 1'   'WadiAlSafa5' → 'WadiAlSafa 5'
    c) insert a space between camelCase transitions:
       'AlLayan' → 'Al Layan'     'WadiAlSafa' → 'Wadi Al Safa'
    d) collapse multiple internal spaces
    e) Title-case the result. Small Arabic prefixes ('Al', 'El', 'Bin',
       'Bint', 'Abu', 'Umm') are kept capitalised because Python's
       str.title() does that natively.
    f) preserve apostrophes/hyphens; fix Me'aisem → Me'Aisem etc

Output:
    - JSON: ~/floxcy-realestate-mvp/data/areas.json
        [
          {"area_name": "Business Bay",
           "area_name_upper": "BUSINESS BAY",
           "area_name_slug": "business-bay",
           "source_datasets": ["transactions","rents"],
           "first_seen_year": 2021,
           "occurrence_count": 482137},
          ...
        ]
    - DB: dld_canonical_areas (when --to-db)

Run:
    python scripts/extract_canonical_areas.py
    python scripts/extract_canonical_areas.py --to-db
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Optional

csv.field_size_limit(sys.maxsize)

# ---------------------------------------------------------------------------
# File locations + column conventions
# ---------------------------------------------------------------------------

HOME = Path.home()
DATA_DIR = HOME / "dld-data"
OUT_JSON = Path(__file__).resolve().parent.parent.parent / "data" / "areas.json"

SOURCES = [
    {
        "label": "transactions",
        "path": DATA_DIR / "transactions_2021_2026.csv",
        "area_col": "area_name_en",
        "date_col": "instance_date",
        "progress_every": 1_000_000,
    },
    {
        "label": "rents",
        "path": DATA_DIR / "rents_2021_2026.csv",
        "area_col": "area_name_en",
        "date_col": "contract_start_date",
        "progress_every": 1_000_000,
    },
    {
        "label": "lands",
        "path": DATA_DIR / "lands-2026-06-01.csv",
        "area_col": "AREA_EN",
        "date_col": None,
        "progress_every": 50_000,
    },
]


# ---------------------------------------------------------------------------
# Standardisation
# ---------------------------------------------------------------------------

_RE_LETTER_DIGIT = re.compile(r"([A-Za-z])(\d+)$")
_RE_CAMEL = re.compile(r"([a-z])([A-Z])")
_RE_INTERNAL_LETTER_DIGIT = re.compile(r"([A-Za-z])(\d+)")
_RE_MULTI_SPACE = re.compile(r"\s+")


def standardise_area(raw: str) -> str | None:
    """Return the canonical Title-Case spelling, or None for empty/garbage."""
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None

    # camelCase split first (so 'AlLayan1' doesn't become 'Al Layan1' — we want
    # 'Al Layan 1'); then digit-split; then collapse whitespace; then title.
    s = _RE_CAMEL.sub(r"\1 \2", s)
    s = _RE_INTERNAL_LETTER_DIGIT.sub(r"\1 \2", s)
    s = _RE_MULTI_SPACE.sub(" ", s).strip()
    # Title case — preserves capitals after apostrophes ("Me'aisem" → "Me'Aisem")
    s = s.title()
    # Edge: keep & / hyphen as-is — title() handles them fine
    return s or None


def slugify(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

def stream_areas_from(path: Path, area_col: str, date_col: Optional[str],
                      progress_every: int):
    """Yield (raw_area, year_or_None) for every row in a CSV.

    Avoids DictReader for speed — we only need one or two columns. Falls back
    to DictReader when the file's header is missing the expected column."""
    print(f"Streaming {path.name}", flush=True)
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if area_col not in reader.fieldnames:
            # Try a case-insensitive match
            lower_map = {c.lower(): c for c in (reader.fieldnames or [])}
            actual = lower_map.get(area_col.lower())
            if not actual:
                raise RuntimeError(
                    f"column {area_col!r} not in {path.name} headers: "
                    f"{reader.fieldnames}"
                )
            area_col = actual
        if date_col and date_col not in reader.fieldnames:
            lower_map = {c.lower(): c for c in (reader.fieldnames or [])}
            date_col = lower_map.get(date_col.lower())

        total = 0
        last_report = 0
        for row in reader:
            total += 1
            if total - last_report >= progress_every:
                print(f"  [{total:>11,} rows]", flush=True)
                last_report = total
            raw = row.get(area_col)
            if not raw:
                continue
            year: Optional[int] = None
            if date_col:
                d = row.get(date_col, "") or ""
                if len(d) >= 4 and d[:4].isdigit():
                    year = int(d[:4])
            yield raw, year

    print(f"  [DONE · {total:,} rows]", flush=True)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

class CanonicalAgg:
    __slots__ = ("sources", "first_year", "count")

    def __init__(self) -> None:
        self.sources: set[str] = set()
        self.first_year: Optional[int] = None
        self.count: int = 0

    def record(self, source: str, year: Optional[int]) -> None:
        self.sources.add(source)
        self.count += 1
        if year is not None:
            if self.first_year is None or year < self.first_year:
                self.first_year = year


def collect(sources: list[dict]) -> dict[str, CanonicalAgg]:
    """Walk every source file once; key by upper-cased canonical name."""
    aggs: dict[str, CanonicalAgg] = collections.defaultdict(CanonicalAgg)
    for src in sources:
        path = src["path"]
        if not path.exists():
            print(f"SKIP (missing): {path}", flush=True)
            continue
        for raw, year in stream_areas_from(
            path, src["area_col"], src["date_col"], src["progress_every"]
        ):
            canon = standardise_area(raw)
            if not canon:
                continue
            aggs[canon.upper()].record(src["label"], year)
    return aggs


def build_records(aggs: dict[str, CanonicalAgg]) -> list[dict]:
    """Final list of dicts ready for JSON + DB. Sorted A→Z by name."""
    records: list[dict] = []
    # We lost the case mapping when keying by upper — recompute Title-Case
    # from the upper key (lossless because we already standardised before
    # uppercasing during collect).
    for upper, a in aggs.items():
        # Reverse the uppercase by re-applying title() to a lowered form.
        name = upper.title()
        records.append({
            "area_name": name,
            "area_name_upper": upper,
            "area_name_slug": slugify(name),
            "source_datasets": sorted(a.sources),
            "first_seen_year": a.first_year,
            "occurrence_count": a.count,
        })
    records.sort(key=lambda r: r["area_name"])
    return records


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_json(records: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(records, indent=2, ensure_ascii=False))
    print(f"  → wrote {len(records):,} records to {path}", flush=True)


def get_sync_db_url() -> str:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            return url.replace("postgresql+asyncpg://", "postgresql://")
    raise RuntimeError("DATABASE_URL not found in backend/.env")


def write_to_db(records: list[dict]) -> None:
    import psycopg2
    import psycopg2.extras

    dsn = get_sync_db_url()
    print(f"Connecting to {dsn.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dld_canonical_areas")
            rows = [
                (
                    str(uuid.uuid4()),
                    r["area_name"],
                    r["area_name_upper"],
                    r["area_name_slug"],
                    None,                                  # area_name_ar
                    json.dumps(r["source_datasets"]),
                    r["first_seen_year"],
                    r["occurrence_count"],
                )
                for r in records
            ]
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO dld_canonical_areas (
                    id, area_name, area_name_upper, area_name_slug,
                    area_name_ar, source_datasets, first_seen_year,
                    occurrence_count
                ) VALUES %s
                """,
                rows,
                page_size=500,
            )
            print(f"  inserted {len(rows):,} canonical area rows", flush=True)
        conn.commit()
        print("✓ committed", flush=True)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def report(records: list[dict]) -> None:
    print(f"\n=== Summary ===", flush=True)
    print(f"  Total unique canonical areas: {len(records):,}", flush=True)
    by_source = collections.Counter()
    for r in records:
        for s in r["source_datasets"]:
            by_source[s] += 1
    for s, n in sorted(by_source.items()):
        print(f"  in {s:<14}: {n:>4} areas", flush=True)
    in_all_three = sum(1 for r in records if len(r["source_datasets"]) == 3)
    in_one_only = sum(1 for r in records if len(r["source_datasets"]) == 1)
    print(f"  in all 3 sources: {in_all_three:>4}", flush=True)
    print(f"  in 1 source only: {in_one_only:>4}", flush=True)

    print(f"\n=== Top 20 A→Z ===", flush=True)
    for r in records[:20]:
        srcs = "/".join(s[0].upper() for s in r["source_datasets"])
        yr = r["first_seen_year"] or "—"
        print(
            f"  {r['area_name']:<40} [{srcs:<3}] first={yr} occ={r['occurrence_count']:>9,}",
            flush=True,
        )

    # Suspect names: too short, all uppercase remaining, contains non-ASCII
    print(f"\n=== Suspect names (flagged for review) ===", flush=True)
    suspects = []
    for r in records:
        name = r["area_name"]
        flags = []
        if len(name) < 4:
            flags.append("very-short")
        if any(c.isupper() and i > 0 and name[i - 1].isupper() for i, c in enumerate(name)):
            flags.append("consecutive-caps")
        if any(ord(c) > 127 for c in name):
            flags.append("non-ascii")
        if "  " in name:
            flags.append("double-space")
        if re.search(r"\d+\D+\d+", name):
            flags.append("multi-digit")
        if r["occurrence_count"] < 5:
            flags.append(f"low-occurrences={r['occurrence_count']}")
        if flags:
            suspects.append((name, flags))
    if not suspects:
        print("  (none)", flush=True)
    else:
        for name, flags in suspects[:25]:
            print(f"  {name:<40} {','.join(flags)}", flush=True)
        if len(suspects) > 25:
            print(f"  … and {len(suspects) - 25} more", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to-db", action="store_true")
    parser.add_argument("--json", default=str(OUT_JSON))
    args = parser.parse_args()

    started_at = dt.datetime.utcnow()
    aggs = collect(SOURCES)
    records = build_records(aggs)
    write_json(records, Path(args.json))
    if args.to_db:
        write_to_db(records)
    report(records)
    elapsed = dt.datetime.utcnow() - started_at
    print(f"\nWall time: {elapsed.total_seconds():.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
