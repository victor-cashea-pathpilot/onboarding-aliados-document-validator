"""Validation endpoints scaffold."""

import logging

from fastapi import APIRouter, HTTPException, status

from backend.shared.config import get_settings
from backend.shared.logging import get_logger, log_event
from backend.shared.models.contracts import (
    StatusRequest,
    StatusResponseItem,
    SubmitValidationRequest,
    SubmitValidationResponse,
)
from backend.shared.services.job_service import get_job_service

router = APIRouter(prefix="/v1/onboarding", tags=["validation"])
logger = get_logger(__name__)


@router.post(
    "/validate",
    response_model=SubmitValidationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_validation(
    payload: SubmitValidationRequest,
) -> SubmitValidationResponse:
    """Create a validation job placeholder for integration testing."""

    log_event(
        logger,
        "api.validation.submit.received",
        merchant_id=payload.merchant_id,
        request_id=payload.request_id,
        document_count=payload.documents.total_documents(),
    )

    if payload.documents.total_documents() == 0:
        log_event(
            logger,
            "api.validation.submit.rejected",
            level=logging.WARNING,
            merchant_id=payload.merchant_id,
            request_id=payload.request_id,
            reason="no_documents",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one document must be provided.",
        )

    response = get_job_service().submit(payload)
    settings = get_settings()
    log_event(
        logger,
        "api.validation.submit.accepted",
        job_id=response.job_id,
        merchant_id=response.merchant_id,
        request_id=response.request_id,
        queue_mode=settings.job_queue_mode,
        repository_mode=settings.job_repository_mode,
    )
    return response


@router.post("/status", response_model=list[StatusResponseItem])
async def get_status(payload: StatusRequest) -> list[StatusResponseItem]:
    """Return current status for one or more jobs."""

    if not payload.job_ids:
        log_event(
            logger,
            "api.validation.status.rejected",
            level=logging.WARNING,
            reason="no_job_ids",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one job_id must be provided.",
        )

    results = get_job_service().get_status(payload)
    log_event(
        logger,
        "api.validation.status.returned",
        job_count=len(payload.job_ids),
        statuses=[item.status for item in results],
    )
    return results
