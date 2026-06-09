"""UserFeedback — inbound page-level feedback from the floating widget."""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    page_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True, index=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)  # 1–5
    looking_for: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    missing: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
