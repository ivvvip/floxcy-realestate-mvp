"""Redis client for caching and background jobs."""
import redis.asyncio as redis
from app.config import settings


# Create Redis client
redis_client = redis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
)


async def get_redis():
    """Dependency to get Redis client."""
    return redis_client


async def check_redis_connection() -> bool:
    """Check if Redis is reachable."""
    try:
        await redis_client.ping()
        return True
    except Exception:
        return False
