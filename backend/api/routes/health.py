"""Health endpoints for the public API."""

from fastapi import APIRouter

from backend.shared.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/")
async def root() -> dict[str, str]:
    """Basic root payload for smoke testing."""

    settings = get_settings()
    return {
        "service": "onboarding-document-validator-api",
        "environment": settings.environment,
        "docs": "/docs",
    }


@router.get("/health")
async def health() -> dict[str, str]:
    """Cloud Run health endpoint."""

    settings = get_settings()
    return {
        "status": "healthy",
        "service": "api",
        "environment": settings.environment,
        "version": settings.api_version,
    }
