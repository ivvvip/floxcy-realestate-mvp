"""Pytest config: ensure environment vars are set so config.py imports work without a real .env."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-very-long-for-bcrypt-and-jwt-sake")
os.environ.setdefault("ADMIN_API_KEY", "test-admin")
os.environ.setdefault("ENVIRONMENT", "test")
