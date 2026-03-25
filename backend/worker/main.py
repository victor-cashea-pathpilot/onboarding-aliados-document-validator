"""FastAPI application for background worker entrypoints."""

from fastapi import FastAPI

from backend.shared.config import get_settings
from backend.shared.logging import configure_logging
from backend.worker.routes.health import router as health_router
from backend.worker.routes.jobs import router as jobs_router

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(
    title=f"{settings.api_title} Worker",
    version=settings.api_version,
    description="Background worker endpoints for async onboarding validation jobs.",
)

app.include_router(health_router)
app.include_router(jobs_router)
