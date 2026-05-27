"""API key model for paid API access."""
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import String, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

from app.database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # Stored as the prefix shown to user (e.g., "fxc_live_1a2b3c")
    prefix: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    # Bcrypt hash of the full key
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Subscription tier: free, pro, api, enterprise
    tier: Mapped[str] = mapped_column(String(32), default="free", nullable=False)
    # Rate limit override (per minute); null = use tier default
    rate_limit_per_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ApiKey {self.prefix} ({self.tier})>"
