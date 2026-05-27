"""One-shot bootstrap: ensure an admin user exists on first startup.

Reads BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD from env.
If either is missing, no admin is created — login flow simply won't work
until you create one via psql or `python -m app.scripts.create_admin`.
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select

from app.config import settings
from app.core.security import hash_password
from app.database import async_session_maker
from app.models.user import User


logger = logging.getLogger("floxcy.bootstrap")


async def ensure_bootstrap_admin() -> None:
    username = settings.BOOTSTRAP_ADMIN_USERNAME
    password = settings.BOOTSTRAP_ADMIN_PASSWORD
    if not username or not password:
        logger.info("bootstrap: BOOTSTRAP_ADMIN_USERNAME/PASSWORD unset, skipping")
        return
    async with async_session_maker() as session:
        existing = (
            await session.execute(select(User).where(User.username == username))
        ).scalar_one_or_none()
        if existing:
            # Refresh password if it has changed (so password rotation via env works)
            from app.core.security import verify_password
            if not verify_password(password, existing.password_hash):
                existing.password_hash = hash_password(password)
                existing.updated_at = datetime.utcnow()
                await session.commit()
                logger.info("bootstrap: refreshed password for admin '%s'", username)
            else:
                logger.info("bootstrap: admin '%s' already present", username)
            return
        user = User(
            username=username,
            password_hash=hash_password(password),
            role="admin",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        logger.info("bootstrap: created admin user '%s'", username)
