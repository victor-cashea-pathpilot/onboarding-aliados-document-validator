"""Configuration for the internal case explorer webapp."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WebappSettings(BaseSettings):
    """Environment-driven settings for the internal case explorer."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    app_title: str = Field(default="Onboarding Case Explorer", alias="WEBAPP_TITLE")
    session_secret: str = Field(default="replace-me", alias="WEBAPP_SESSION_SECRET")
    auth_mode: str = Field(default="disabled", alias="CASE_EXPLORER_AUTH_MODE")
    google_oauth_client_id: str | None = Field(
        default=None,
        alias="GOOGLE_OAUTH_CLIENT_ID",
    )
    allowed_google_domains: str = Field(default="", alias="ALLOWED_GOOGLE_DOMAINS")
    allowed_google_emails: str = Field(default="", alias="ALLOWED_GOOGLE_EMAILS")
    onboarding_api_url: str = Field(
        default="http://127.0.0.1:8000",
        alias="CASE_EXPLORER_API_URL",
    )
    onboarding_api_audience: str | None = Field(
        default=None,
        alias="CASE_EXPLORER_API_AUDIENCE",
    )

    def allowed_domains(self) -> set[str]:
        return {
            item.strip().lower()
            for item in self.allowed_google_domains.split(",")
            if item.strip()
        }

    def allowed_emails(self) -> set[str]:
        return {
            item.strip().lower()
            for item in self.allowed_google_emails.split(",")
            if item.strip()
        }


@lru_cache(maxsize=1)
def get_settings() -> WebappSettings:
    """Return cached settings."""

    return WebappSettings()
