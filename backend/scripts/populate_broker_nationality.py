"""Populate dld_rera_brokers nationality columns from name patterns.

Run AFTER the e1f2a3b4c5d6 migration has been applied. Idempotent: safe
to re-run (every UPDATE writes the same value for a given name).

Run from backend/ with .env IP-swapped (DNS doesn't resolve from host):
    venv/bin/python scripts/populate_broker_nationality.py [--dry-run]

Prints a distribution summary at the end so the user can sanity-check
against the rough expected counts.
"""
from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import psycopg2
from psycopg2.extras import execute_values

from app.services.broker_nationality import detect


def get_sync_db_url() -> str:
    """Read DATABASE_URL from .env. Caller is expected to have IP-swapped."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        raise SystemExit(".env not found")
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            # Convert async URL → sync psycopg2 URL
            url = url.replace("+asyncpg", "")
            return url
    raise SystemExit("DATABASE_URL not in .env")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Compute distribution but skip DB writes")
    parser.add_argument("--batch", type=int, default=2000,
                        help="Rows per UPDATE batch (default 2000)")
    args = parser.parse_args()

    url = get_sync_db_url()
    print(f"Connecting to {url.split('@')[-1].split('/')[0]}...", flush=True)
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    cur.execute("SELECT broker_number, full_name FROM dld_rera_brokers")
    rows = cur.fetchall()
    n = len(rows)
    print(f"Loaded {n:,} brokers", flush=True)

    counter: Counter[str] = Counter()
    by_lang: Counter[str] = Counter()
    updates: list[tuple[str, str, str, str]] = []
    start = time.time()
    for broker_number, full_name in rows:
        nat = detect(full_name or "")
        counter[nat["nationality"]] += 1
        by_lang[nat["language"]] += 1
        updates.append(
            (broker_number, nat["nationality"], nat["language"], nat["flag"])
        )
    print(f"Detected in {time.time() - start:.1f}s", flush=True)

    if not args.dry_run:
        # Bulk update via UPDATE ... FROM (VALUES ...) pattern
        n_written = 0
        for i in range(0, n, args.batch):
            chunk = updates[i : i + args.batch]
            # page_size must cover the whole chunk in one statement — psycopg2's
            # default 100 splits silently, making cur.rowcount unreliable across
            # the full batch. Use len(chunk) to track progress honestly.
            execute_values(
                cur,
                """
                UPDATE dld_rera_brokers AS b
                SET detected_nationality = v.nat,
                    detected_language    = v.lang,
                    nationality_flag     = v.flag
                FROM (VALUES %s) AS v(broker_number, nat, lang, flag)
                WHERE b.broker_number = v.broker_number
                """,
                chunk,
                template="(%s,%s,%s,%s)",
                page_size=args.batch,
            )
            n_written += len(chunk)
            print(f"  wrote {n_written:,}/{n:,}", flush=True)
        conn.commit()
        print(f"Committed {n_written:,} updates", flush=True)
    else:
        print("(dry-run, no writes)", flush=True)

    print("\n=== Detected nationality distribution ===")
    for nat, count in counter.most_common():
        pct = count / n * 100 if n else 0
        print(f"  {nat:12s} {count:>7,}  {pct:5.1f}%")

    print("\n=== Detected language distribution ===")
    for lang, count in by_lang.most_common():
        pct = count / n * 100 if n else 0
        print(f"  {lang:12s} {count:>7,}  {pct:5.1f}%")

    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
