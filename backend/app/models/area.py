"""Area model - Dubai real estate areas."""
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import String, Text, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, Optional, List

from app.database import Base

if TYPE_CHECKING:
    from app.models.market_snapshot import MarketSnapshot


class Area(Base):
    __tablename__ = "areas"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name_arabic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(100), default="Dubai", nullable=False)
    emirate: Mapped[str] = mapped_column(String(100), default="Dubai", nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    area_type: Mapped[str] = mapped_column(String(100), default="residential")
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    snapshots: Mapped[List["MarketSnapshot"]] = relationship(
        "MarketSnapshot", back_populates="area", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Area {self.name}>"
