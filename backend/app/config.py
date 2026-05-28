"""Application configuration."""
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # App
    APP_NAME: str = "Floxcy MVP API"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str

    # Auth & security
    # Legacy: kept only for one-shot migration from old admin-token mechanism.
    # New surface uses JWT cookies issued via /api/v1/auth/login.
    ADMIN_API_KEY: str = "change-me"
    # JWT signing secret. MUST be overridden in production.
    JWT_SECRET: str = "change-me-jwt"
    JWT_ALGORITHM: str = "HS256"
    # Session TTL in minutes (default 8h)
    JWT_TTL_MINUTES: int = 480
    # Auth cookie name
    AUTH_COOKIE_NAME: str = "floxcy_session"
    # Cookie domain ("" for host-only)
    COOKIE_DOMAIN: str = ""
    # Secure cookies (set False only in local dev)
    COOKIE_SECURE: bool = True
    # Bootstrap admin from env vars on first startup
    BOOTSTRAP_ADMIN_USERNAME: Optional[str] = None
    BOOTSTRAP_ADMIN_PASSWORD: Optional[str] = None

    # CORS — comma-separated list when set as env var
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "https://floxcy.com"]

    # Rate limiting (per minute, per IP/key)
    RATE_LIMIT_ANONYMOUS_PER_MIN: int = 60
    RATE_LIMIT_FREE_TIER_PER_MIN: int = 120
    RATE_LIMIT_PRO_TIER_PER_MIN: int = 600
    RATE_LIMIT_API_TIER_PER_MIN: int = 2000
    RATE_LIMIT_ENTERPRISE_PER_MIN: int = 10000

    # API
    API_V1_PREFIX: str = "/api/v1"

    # n8n webhook shared secret. Empty = accept unsigned (dev / early trial).
    N8N_WEBHOOK_SECRET: str = ""
    PROJECT_NAME: str = "Floxcy MVP"

    # OpenRouter (LLM advisor)
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_DEFAULT_MODEL: str = "openrouter/free"
    OPENROUTER_PREMIUM_MODEL: str = "anthropic/claude-sonnet-4.6"
    OPENROUTER_FALLBACK_MODEL: str = "deepseek/deepseek-v4-flash:free"
    OPENROUTER_APP_NAME: str = "floxcy"
    OPENROUTER_APP_URL: str = "https://floxcy.com"
    OPENROUTER_MAX_TOKENS: int = 1000
    OPENROUTER_TIMEOUT_S: float = 30.0
    OPENROUTER_CACHE_TTL_S: int = 3600

    # AI advisor rate limits (per hour)
    AI_RATE_LIMIT_ANONYMOUS_PER_HOUR: int = 5
    AI_RATE_LIMIT_USER_PER_HOUR: int = 50


settings = Settings()
