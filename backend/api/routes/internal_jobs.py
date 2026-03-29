"""Internal job detail endpoints for case exploration."""

from fastapi import APIRouter, HTTPException, status

from backend.shared.logging import get_logger, log_event
from backend.shared.models.contracts import CaseExplorerResponse
from backend.shared.services.job_service import get_job_service

router = APIRouter(prefix="/internal/jobs", tags=["internal"])
logger = get_logger(__name__)


@router.get("/{job_id}", response_model=CaseExplorerResponse)
async def get_job_detail(job_id: str) -> CaseExplorerResponse:
    """Return a sanitized and expanded job view for internal exploration."""

    response = get_job_service().get_case(job_id)
    if response is None:
        log_event(
            logger,
            "api.internal.job_detail.missing",
            job_id=job_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found.",
        )

    log_event(
        logger,
        "api.internal.job_detail.returned",
        job_id=response.job_id,
        merchant_id=response.merchant_id,
        status=response.status,
    )
    return response
