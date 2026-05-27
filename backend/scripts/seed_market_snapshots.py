"""CLI wrapper to seed market snapshots (logic lives in app.services.seed_data)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import async_session_maker
from app.services.seed_data import seed_snapshots_with_session


async def main():
    async with async_session_maker() as session:
        summary = await seed_snapshots_with_session(session)
        if summary.get("error"):
            print(f"❌ {summary['error']}")
            return
        print(f"✅ Seeded {summary['snapshots']} snapshots across {summary['areas']} areas")


if __name__ == "__main__":
    asyncio.run(main())
