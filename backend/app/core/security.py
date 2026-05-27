"""Password hashing + JWT issuance/verification."""
from __future__ import annotations

import base64
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import bcrypt
import jwt

from app.config import settings


# ---------- Passwords ----------

def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ---------- JWT ----------

def create_session_token(user_id: UUID, role: str, username: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_TTL_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "iss": "floxcy",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_session_token(token: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            issuer="floxcy",
        )
    except jwt.PyJWTError:
        return None


# ---------- API keys ----------
# Format: "fxc_<env>_<24-char-token>"
#   prefix stored unhashed: "fxc_<env>_<first-8-chars>"
#   full key bcrypt-hashed in DB

API_KEY_PREFIX = "fxc"


def generate_api_key(env: str = "live") -> tuple[str, str]:
    """Returns (full_key, prefix). Prefix is what we store unhashed for lookup."""
    raw = secrets.token_urlsafe(24)
    # Strip non-alnum for cleaner display
    raw = "".join(c for c in raw if c.isalnum())[:24]
    full = f"{API_KEY_PREFIX}_{env}_{raw}"
    prefix = f"{API_KEY_PREFIX}_{env}_{raw[:8]}"
    return full, prefix


def hash_api_key(full_key: str) -> str:
    return hash_password(full_key)


def verify_api_key(full_key: str, hashed: str) -> bool:
    return verify_password(full_key, hashed)


def extract_prefix(full_key: str) -> Optional[str]:
    parts = full_key.split("_")
    if len(parts) < 3 or parts[0] != API_KEY_PREFIX:
        return None
    return f"{parts[0]}_{parts[1]}_{parts[2][:8]}"


# ---------- Session IDs for anonymous alerts ----------

def generate_session_id() -> str:
    """Opaque random session ID for anonymous (cookie-keyed) features."""
    return base64.urlsafe_b64encode(secrets.token_bytes(24)).decode("ascii").rstrip("=")
