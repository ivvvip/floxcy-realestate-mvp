"""MarketSnapshot model - Real estate market data."""
from datetime import datetime, date
from uuid import UUID, uuid4
from sqlalchemy import String, Numeric, Integer, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, Optional

from app.database import Base

if TYPE_CHECKING:
    from app.models.area import Area


class MarketSnapshot(Base):
    __tablename__ = "market_snapshots"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    area_id: Mapped[UUID] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    avg_sale_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    avg_price_per_sqft: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    avg_annual_rent: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    rental_yield: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    occupancy_rate: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    appreciation_1y: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    appreciation_3y: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    transaction_volume: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    demand_score: Mapped[Optional[float]] = mapped_column(Numeric(3, 1), nullable=True)
    risk_score: Mapped[Optional[float]] = mapped_column(Numeric(3, 1), nullable=True)
    investment_score: Mapped[Optional[float]] = mapped_column(Numeric(3, 1), nullable=True)
    data_source: Mapped[str] = mapped_column(String(255), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    area: Mapped["Area"] = relationship("Area", back_populates="snapshots")

    def __repr__(self):
        return f"<MarketSnapshot {self.area_id} {self.snapshot_date}>"
