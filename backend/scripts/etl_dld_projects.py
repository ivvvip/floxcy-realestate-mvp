"""ETL — DLD official off-plan registry (Phase 3, TIER 1).

Ingests ~/dld-data/projects-2026-06-01.csv (255 projects) and
developers-2026-06-01.csv (133 developers) into dld_projects / dld_developers.
Idempotent: upserts by project_number / developer_number (ON CONFLICT), so
re-running on a fresh snapshot refreshes in place without touching the TIER 2
project_enrichment table.

Run with the IP-swapped DB (see CLAUDE.md), e.g.:
    PYTHONPATH=. DATABASE_URL=...@10.0.1.7:... python scripts/etl_dld_projects.py
"""
import asyncio
import csv
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import async_session_maker
from app.models.dld_project import DldDeveloper, DldProject

DATA_DIR = Path.home() / "dld-data"
PROJECTS_CSV = DATA_DIR / "projects-2026-06-01.csv"
DEVELOPERS_CSV = DATA_DIR / "developers-2026-06-01.csv"


def _s(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    return v or None


def _dt(v: Optional[str]) -> Optional[datetime]:
    v = (v or "").strip()
    if not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None


def _num(v: Optional[str]) -> Optional[float]:
    v = (v or "").strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _int(v: Optional[str]) -> Optional[int]:
    f = _num(v)
    return int(f) if f is not None else None


def _read_developers() -> list[dict]:
    rows = []
    with open(DEVELOPERS_CSV, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            num = _s(r.get("DEVELOPER_NUMBER"))
            if not num:
                continue
            rows.append(dict(
                developer_number=num,
                developer_name=_s(r.get("DEVELOPER_EN")) or num,
                registration_date=_dt(r.get("REGISTRATION_DATE")),
                license_source=_s(r.get("LICENSE_SOURCE_EN")),
                license_type=_s(r.get("LICENSE_TYPE_EN")),
                legal_status=_s(r.get("LEGAL_STATUS_EN")),
                webpage=_s(r.get("WEBPAGE")),
                phone=_s(r.get("PHONE")),
                fax=_s(r.get("FAX")),
                license_number=_s(r.get("LICENSE_NUMBER")),
                license_issue_date=_dt(r.get("LICENSE_ISSUE_DATE")),
                license_expiry_date=_dt(r.get("LICENSE_EXPIRY_DATE")),
                chamber_of_commerce_no=_s(r.get("CHAMBER_OF_COMMERCE_NO")),
            ))
    return rows


def _read_projects() -> list[dict]:
    rows = []
    with open(PROJECTS_CSV, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            num = _s(r.get("PROJECT_NUMBER"))
            if not num:
                continue
            area = _s(r.get("AREA_EN"))
            rows.append(dict(
                project_number=num,
                project_name=_s(r.get("PROJECT_EN")),
                developer_number=_s(r.get("DEVELOPER_NUMBER")),
                developer_name=_s(r.get("DEVELOPER_EN")),
                project_type=_s(r.get("PRJ_TYPE_EN")),
                project_status=_s(r.get("PROJECT_STATUS")),
                percent_completed=_num(r.get("PERCENT_COMPLETED")),
                project_value=_num(r.get("PROJECT_VALUE")),
                escrow_account_number=_s(r.get("ESCROW_ACCOUNT_NUMBER")),
                start_date=_dt(r.get("START_DATE")),
                end_date=_dt(r.get("END_DATE")),
                adoption_date=_dt(r.get("ADOPTION_DATE")),
                inspection_date=_dt(r.get("INSPECTION_DATE")),
                completion_date=_dt(r.get("COMPLETION_DATE")),
                area_en=area,
                area_name_norm=area.lower() if area else None,
                zone_en=_s(r.get("ZONE_EN")),
                master_project=_s(r.get("MASTER_PROJECT_EN")),
                cnt_land=_int(r.get("CNT_LAND")),
                cnt_building=_int(r.get("CNT_BUILDING")),
                cnt_villa=_int(r.get("CNT_VILLA")),
                cnt_unit=_int(r.get("CNT_UNIT")),
                description=_s(r.get("DESCRIPTION_EN")),
            ))
    return rows


async def _upsert(session, model, rows, conflict_col):
    if not rows:
        return 0
    update_cols = {c: None for c in rows[0] if c != conflict_col}
    for batch_start in range(0, len(rows), 500):
        batch = rows[batch_start:batch_start + 500]
        stmt = pg_insert(model).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=[conflict_col],
            set_={c: getattr(stmt.excluded, c) for c in update_cols},
        )
        await session.execute(stmt)
    await session.commit()
    return len(rows)


async def main():
    devs = _read_developers()
    projs = _read_projects()
    print(f"parsed: {len(devs)} developers, {len(projs)} projects")
    async with async_session_maker() as session:
        nd = await _upsert(session, DldDeveloper, devs, "developer_number")
        npj = await _upsert(session, DldProject, projs, "project_number")
    print(f"upserted: {nd} developers, {npj} projects")


if __name__ == "__main__":
    asyncio.run(main())
