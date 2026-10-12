"""Centralized configuration, loaded once from environment variables.

Never hardcode secrets here. All values come from the environment
(/etc/bot-control-center/bcc.env in production, .env.example as template).
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str
    session_cookie_name: str = "bcc_session"
    session_ttl_minutes: int = 720
    argon2_time_cost: int = 3
    argon2_memory_cost: int = 65536

    cors_origins: str = ""

    telegram_bot_token: str = ""
    telegram_admin_ids: str = ""

    monitor_default_interval_seconds: int = 15
    monitor_failure_threshold: int = 3
    notification_cooldown_seconds: int = 900

    log_fetch_limit: int = 500

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def telegram_admin_ids_list(self) -> list[int]:
        return [int(i) for i in self.telegram_admin_ids.split(",") if i.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
