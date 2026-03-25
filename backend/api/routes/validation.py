"""Validation endpoints scaffold."""

from fastapi import APIRouter, HTTPException, status

from backend.shared.models.contracts import (
    StatusRequest,
    StatusResponseItem,
    SubmitValidationRequest,
    SubmitValidationResponse,
)
from backend.shared.services.job_service import get_job_service

router = APIRouter(prefix="/v1/onboarding", tags=["validation"])
job_service = get_job_service()


@router.post(
    "/validate",
    response_model=SubmitValidationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_validation(
    payload: SubmitValidationRequest,
) -> SubmitValidationResponse:
    """Create a validation job placeholder for integration testing."""

    if payload.documents.total_documents() == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one document must be provided.",
        )

    return job_service.submit(payload)


@router.post("/status", response_model=list[StatusResponseItem])
async def get_status(payload: StatusRequest) -> list[StatusResponseItem]:
    """Return current status for one or more jobs."""

    if not payload.job_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one job_id must be provided.",
        )

    return job_service.get_status(payload)
