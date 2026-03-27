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
    cloud_tasks_service_account_email: str | None = Field(
        default=None,
        alias="CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL",
    )
    worker_base_url: str | None = Field(default=None, alias="WORKER_BASE_URL")
    worker_audience: str | None = Field(default=None, alias="WORKER_AUDIENCE")
    worker_auth_token: str | None = Field(default=None, alias="WORKER_AUTH_TOKEN")
    api_key: str | None = Field(default=None, alias="API_KEY")
    mock_mode: bool = Field(default=True, alias="MOCK_MODE")
    download_timeout_seconds: int = Field(
        default=20,
        alias="DOWNLOAD_TIMEOUT_SECONDS",
    )
    max_document_size_bytes: int = Field(
        default=15 * 1024 * 1024,
        alias="MAX_DOCUMENT_SIZE_BYTES",
    )
    gemini_location: str = Field(default="global", alias="GEMINI_LOCATION")
    gemini_model_simple: str = Field(
        default="gemini-2.5-flash",
        alias="GEMINI_MODEL_SIMPLE",
    )
    gemini_model_complex: str = Field(
        default="gemini-2.5-pro",
        alias="GEMINI_MODEL_COMPLEX",
    )
    max_extraction_concurrency: int = Field(
        default=4,
        alias="MAX_EXTRACTION_CONCURRENCY",
    )
    enable_llm_cross_validation: bool = Field(
        default=True,
        alias="ENABLE_LLM_CROSS_VALIDATION",
    )
    enable_llm_legal_assessment: bool = Field(
        default=True,
        alias="ENABLE_LLM_LEGAL_ASSESSMENT",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""

    return Settings()
