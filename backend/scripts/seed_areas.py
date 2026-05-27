"""Seed initial Dubai areas data."""
import asyncio
import sys
from pathlib import Path

# Add parent dir to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_maker
from app.models.area import Area


DUBAI_AREAS = [
    {
        "name": "Dubai Marina",
        "name_arabic": "دبي مارينا",
        "area_type": "mixed",
        "description": "Iconic waterfront community with high-rise apartments, marina views, restaurants, and beach access.",
        "latitude": 25.0805,
        "longitude": 55.1403,
    },
    {
        "name": "Downtown Dubai",
        "name_arabic": "وسط مدينة دبي",
        "area_type": "mixed",
        "description": "Premium central location featuring Burj Khalifa, Dubai Mall, and luxury residences.",
        "latitude": 25.1972,
        "longitude": 55.2744,
    },
    {
        "name": "Business Bay",
        "name_arabic": "الخليج التجاري",
        "area_type": "mixed",
        "description": "Business district with luxury apartments, offices, and Dubai Canal waterfront.",
        "latitude": 25.1872,
        "longitude": 55.2631,
    },
    {
        "name": "Jumeirah Village Circle",
        "name_arabic": "قرية جميرا الدائرية",
        "area_type": "residential",
        "description": "Family-friendly affordable community with parks, schools, and amenities.",
        "latitude": 25.0588,
        "longitude": 55.2103,
    },
    {
        "name": "Palm Jumeirah",
        "name_arabic": "نخلة جميرا",
        "area_type": "residential",
        "description": "Iconic luxury island living with beachfront villas and apartments.",
        "latitude": 25.1124,
        "longitude": 55.1390,
    },
    {
        "name": "Dubai Hills Estate",
        "name_arabic": "دبي هيلز إستيت",
        "area_type": "residential",
        "description": "Master-planned community with golf course, parks, and modern residences.",
        "latitude": 25.1067,
        "longitude": 55.2497,
    },
    {
        "name": "Dubai South",
        "name_arabic": "دبي الجنوب",
        "area_type": "mixed",
        "description": "Emerging area near Al Maktoum Airport with affordable housing and growth potential.",
        "latitude": 24.8856,
        "longitude": 55.1605,
    },
    {
        "name": "Arjan",
        "name_arabic": "أرجان",
        "area_type": "residential",
        "description": "Affordable residential community in Dubailand with family-friendly amenities.",
        "latitude": 25.0488,
        "longitude": 55.2436,
    },
    {
        "name": "Jumeirah Lake Towers",
        "name_arabic": "أبراج بحيرات جميرا",
        "area_type": "mixed",
        "description": "Mixed-use waterfront community with offices, residences, and dining options.",
        "latitude": 25.0697,
        "longitude": 55.1429,
    },
    {
        "name": "Meydan",
        "name_arabic": "ميدان",
        "area_type": "mixed",
        "description": "Luxury community near Meydan Racecourse with villas and townhouses.",
        "latitude": 25.1611,
        "longitude": 55.3025,
    },
]


async def seed_areas():
    """Seed Dubai areas into database."""
    async with async_session_maker() as session:
        # Check if areas already exist
        from sqlalchemy import select
        result = await session.execute(select(Area))
        existing = result.scalars().all()
        
        if existing:
            print(f"⚠️  Database already has {len(existing)} areas. Skipping seed.")
            return
        
        # Add areas
        for area_data in DUBAI_AREAS:
            area = Area(**area_data)
            session.add(area)
        
        await session.commit()
        print(f"✅ Seeded {len(DUBAI_AREAS)} Dubai areas successfully!")
        
        # Display them
        result = await session.execute(select(Area))
        areas = result.scalars().all()
        print("\n📋 Areas in database:")
        for area in areas:
            print(f"  - {area.name} ({area.name_arabic})")


if __name__ == "__main__":
    asyncio.run(seed_areas())
