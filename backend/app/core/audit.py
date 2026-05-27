"""Audit log writer."""
from __future__ import annotations

from typing import Optional, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def write_audit(
    db: AsyncSession,
    *,
    actor_label: str,
    action: str,
    actor_user_id: Optional[UUID] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    status: str = "ok",
) -> AuditLog:
    """Persist an audit log row. Caller is responsible for db.commit().

    Use this from any privileged endpoint to record who did what."""
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_label=actor_label,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
        ip=ip,
        user_agent=user_agent,
        status=status,
    )
    db.add(entry)
    await db.flush()
    return entry
