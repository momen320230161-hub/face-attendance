from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    supabase_url: str
    supabase_service_key: str
    supabase_jwt_secret: str
    device_api_key: str
    match_threshold: float = Field(default=0.60, ge=0.0, le=1.0)
    debounce_minutes: int = Field(default=20, ge=1, le=1440)
    insightface_ctx_id: int = -1


@lru_cache
def get_settings() -> Settings:
    return Settings()

