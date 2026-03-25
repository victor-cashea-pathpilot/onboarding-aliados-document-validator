"""Centralized application settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings shared by API and worker."""

    model_config = SettingsConfigDict(
        env_file="backend/.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    api_title: str = Field(
        default="Cashea Onboarding Document Validator",
        alias="API_TITLE",
    )
    api_version: str = Field(default="0.1.0", alias="API_VERSION")
    gcp_project_id: str | None = Field(default=None, alias="GCP_PROJECT_ID")
    firestore_database: str = Field(default="(default)", alias="FIRESTORE_DATABASE")
    firestore_collection: str = Field(
        default="validation_jobs",
        alias="FIRESTORE_COLLECTION",
    )
    job_repository_mode: str = Field(
        default="inmemory",
        alias="JOB_REPOSITORY_MODE",
    )
    job_queue_mode: str = Field(default="cloud_tasks", alias="JOB_QUEUE_MODE")
    gcp_region: str | None = Field(default=None, alias="GCP_REGION")
    cloud_tasks_queue_id: str | None = Field(
        default=None,
        alias="CLOUD_TASKS_QUEUE_ID",
    )
    worker_base_url: str | None = Field(default=None, alias="WORKER_BASE_URL")
    worker_auth_token: str | None = Field(default=None, alias="WORKER_AUTH_TOKEN")
    api_key: str | None = Field(default=None, alias="API_KEY")
    mock_mode: bool = Field(default=True, alias="MOCK_MODE")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""

    return Settings()
