"""FastAPI application for the public onboarding validation API."""

from fastapi import FastAPI

from backend.api.routes.health import router as health_router
from backend.api.routes.validation import router as validation_router
from backend.shared.config import get_settings
from backend.shared.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Async API for validating onboarding documents for Cashea.",
)

app.include_router(health_router)
app.include_router(validation_router)
