from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_service_key: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""
    device_api_key: str = ""
    match_threshold: float = Field(default=0.60, ge=0.0, le=1.0)
    debounce_minutes: int = Field(default=20, ge=1, le=1440)
    insightface_ctx_id: int = -1
    environment: str = "development"
    allow_in_memory_fallback: bool = True

    @property
    def effective_service_role_key(self) -> str:
        return self.supabase_service_role_key or self.supabase_service_key

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
