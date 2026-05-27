"""Seed logic for market snapshots — importable from the running app.

Lives in app/services/ so it ships in the Docker image (scripts/ doesn't).
The CLI wrapper at scripts/seed_market_snapshots.py delegates here.
"""
from datetime import date
from sqlalchemy import select, delete

from app.models.area import Area
from app.models.market_snapshot import MarketSnapshot


# Realistic Dubai baseline numbers (May 2026).
AREA_BASELINES = {
    "Dubai Marina": {
        "price_per_sqft": 1820, "avg_size_sqft": 1050, "rental_yield": 6.4,
        "occupancy": 91, "appreciation_1y": 8.2, "appreciation_3y": 24.5,
        "tx_volume": 1450, "demand": 9.1, "risk": 4.2, "investment": 8.5,
    },
    "Downtown Dubai": {
        "price_per_sqft": 2420, "avg_size_sqft": 1100, "rental_yield": 5.6,
        "occupancy": 93, "appreciation_1y": 9.8, "appreciation_3y": 31.2,
        "tx_volume": 980, "demand": 9.4, "risk": 3.8, "investment": 8.7,
    },
    "Business Bay": {
        "price_per_sqft": 1650, "avg_size_sqft": 950, "rental_yield": 6.8,
        "occupancy": 89, "appreciation_1y": 7.4, "appreciation_3y": 21.0,
        "tx_volume": 1320, "demand": 8.6, "risk": 4.5, "investment": 8.2,
    },
    "Jumeirah Village Circle": {
        "price_per_sqft": 950, "avg_size_sqft": 880, "rental_yield": 8.4,
        "occupancy": 87, "appreciation_1y": 11.5, "appreciation_3y": 28.0,
        "tx_volume": 2150, "demand": 8.8, "risk": 5.2, "investment": 8.6,
    },
    "Palm Jumeirah": {
        "price_per_sqft": 2820, "avg_size_sqft": 1450, "rental_yield": 5.1,
        "occupancy": 92, "appreciation_1y": 10.4, "appreciation_3y": 38.5,
        "tx_volume": 620, "demand": 9.0, "risk": 3.5, "investment": 8.4,
    },
    "Dubai Hills Estate": {
        "price_per_sqft": 1760, "avg_size_sqft": 1280, "rental_yield": 6.2,
        "occupancy": 90, "appreciation_1y": 8.8, "appreciation_3y": 26.8,
        "tx_volume": 1080, "demand": 8.7, "risk": 4.0, "investment": 8.5,
    },
    "Dubai South": {
        "price_per_sqft": 860, "avg_size_sqft": 920, "rental_yield": 8.8,
        "occupancy": 82, "appreciation_1y": 12.6, "appreciation_3y": 22.4,
        "tx_volume": 1680, "demand": 7.9, "risk": 6.1, "investment": 8.0,
    },
    "Arjan": {
        "price_per_sqft": 920, "avg_size_sqft": 850, "rental_yield": 8.2,
        "occupancy": 85, "appreciation_1y": 10.1, "appreciation_3y": 19.5,
        "tx_volume": 1240, "demand": 7.5, "risk": 5.4, "investment": 7.8,
    },
    "Jumeirah Lake Towers": {
        "price_per_sqft": 1410, "avg_size_sqft": 970, "rental_yield": 7.2,
        "occupancy": 88, "appreciation_1y": 6.9, "appreciation_3y": 18.2,
        "tx_volume": 1390, "demand": 8.2, "risk": 4.7, "investment": 8.1,
    },
    "Meydan": {
        "price_per_sqft": 1560, "avg_size_sqft": 1180, "rental_yield": 6.6,
        "occupancy": 89, "appreciation_1y": 9.2, "appreciation_3y": 25.1,
        "tx_volume": 910, "demand": 8.4, "risk": 4.3, "investment": 8.3,
    },
}


def month_offset(target: date, months_back: int) -> date:
    total = target.year * 12 + (target.month - 1) - months_back
    y, m = divmod(total, 12)
    return date(y, m + 1, 1)


def build_snapshots(area_id, baseline: dict, today: date) -> list[dict]:
    """Build 12 monthly snapshots trending back 12 months."""
    snapshots = []
    appreciation = baseline["appreciation_1y"] / 100.0
    current_pps = baseline["price_per_sqft"]
    size = baseline["avg_size_sqft"]

    for i in range(12):
        months_ago = 11 - i
        progress = (12 - months_ago) / 12.0
        factor = (1 / (1 + appreciation)) + (1 - 1 / (1 + appreciation)) * progress
        noise = 1 + ((i * 37 + 13) % 30 - 15) / 1000.0
        pps = current_pps * factor * noise
        sale_price = pps * size
        annual_rent = sale_price * (baseline["rental_yield"] / 100.0) * noise
        vol_factor = 0.85 + 0.3 * ((i + 3) % 12) / 12.0
        tx_vol = int(baseline["tx_volume"] * vol_factor / 12)

        snapshots.append({
            "area_id": area_id,
            "snapshot_date": month_offset(today, months_ago),
            "avg_sale_price": round(sale_price, 2),
            "avg_price_per_sqft": round(pps, 2),
            "avg_annual_rent": round(annual_rent, 2),
            "rental_yield": round(baseline["rental_yield"] * noise, 2),
            "occupancy_rate": round(baseline["occupancy"] - (11 - i) * 0.15, 2),
            "appreciation_1y": round(baseline["appreciation_1y"] * (0.7 + 0.3 * progress), 2),
            "appreciation_3y": round(baseline["appreciation_3y"], 2),
            "transaction_volume": tx_vol,
            "demand_score": round(baseline["demand"], 1),
            "risk_score": round(baseline["risk"], 1),
            "investment_score": round(baseline["investment"], 1),
            "data_source": "seed_v1",
        })
    return snapshots


async def seed_snapshots_with_session(session) -> dict:
    """Re-seed snapshots within an existing session. Idempotent."""
    today = date.today()
    result = await session.execute(select(Area))
    areas = result.scalars().all()
    if not areas:
        return {"areas": 0, "snapshots": 0, "error": "no areas seeded"}

    await session.execute(delete(MarketSnapshot))
    await session.commit()

    total = 0
    seeded_areas = 0
    for area in areas:
        baseline = AREA_BASELINES.get(area.name)
        if not baseline:
            continue
        for snap in build_snapshots(area.id, baseline, today):
            session.add(MarketSnapshot(**snap))
        total += 12
        seeded_areas += 1

    await session.commit()
    return {"areas": seeded_areas, "snapshots": total}
