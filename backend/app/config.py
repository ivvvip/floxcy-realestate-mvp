"""Application configuration."""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
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
    
    # Security
    ADMIN_API_KEY: str = "change-me"
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # API
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "Floxcy MVP"


settings = Settings()
