"""Health endpoints for the worker service."""

from fastapi import APIRouter

from backend.shared.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Cloud Run health endpoint for the worker."""

    settings = get_settings()
    return {
        "status": "healthy",
        "service": "worker",
        "environment": settings.environment,
        "version": settings.api_version,
    }
