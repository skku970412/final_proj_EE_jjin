from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, Field


class Settings(BaseModel):
    database_url: str = Field(
        default=os.getenv("DATABASE_URL", "sqlite:///./data/ev_charging.db")
    )
    business_timezone: str = Field(
        default=os.getenv("BUSINESS_TIMEZONE", "Asia/Seoul")
    )
    admin_email: str = Field(default=os.getenv("ADMIN_EMAIL", "admin@demo.dev"))
    admin_password: str = Field(default=os.getenv("ADMIN_PASSWORD", "admin123"))
    admin_token: str = Field(default=os.getenv("ADMIN_TOKEN", "admin-demo-token"))
    auto_seed_sessions: bool = Field(
        default=os.getenv("AUTO_SEED_SESSIONS", "0").lower()
        in {"1", "true", "yes", "on"}
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "").split(",")
            if origin.strip()
        ]
    )
    # License Plate service endpoint (full URL)
    # e.g. direct: http://<school-ip>:8001/v1/recognize
    #      proxy : http://<proxy-host>:8000/api/license-plates
    plate_service_endpoint: str = Field(
        default=os.getenv(
            "PLATE_SERVICE_URL", "http://localhost:8001/v1/recognize"
        )
    )


@lru_cache(1)
def get_settings() -> Settings:
    return Settings()
