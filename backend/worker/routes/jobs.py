"""Worker job handlers scaffold."""

import logging

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from backend.shared.config import get_settings
from backend.shared.factories import build_processor, build_repository
from backend.shared.logging import get_logger, log_event
from backend.shared.models.contracts import utc_now


class ProcessJobRequest(BaseModel):
    """Placeholder payload for a background job handler."""

    job_id: str


router = APIRouter(prefix="/internal", tags=["jobs"])
logger = get_logger(__name__)


def _build_worker_received_fields(record) -> dict[str, object]:
    """Build structured fields for the worker receipt log."""

    if record is None:
        return {}

    now = utc_now()
    queue_wait_ms = max(
        round((now - record.created_at).total_seconds() * 1000, 2),
        0.0,
    )
    return {
        "merchant_id": record.merchant_id,
        "request_id": record.request_id,
        "queue_wait_ms": queue_wait_ms,
        "job_status": record.status,
    }


@router.post("/process-job")
async def process_job(
    payload: ProcessJobRequest,
    x_worker_token: str | None = Header(default=None),
) -> dict[str, str]:
    """Process a job from Cloud Tasks or a local caller."""

    settings = get_settings()
    if settings.worker_auth_token and x_worker_token != settings.worker_auth_token:
        log_event(
            logger,
            "worker.job.unauthorized",
            level=logging.WARNING,
            job_id=payload.job_id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid worker token.",
        )

    repository = build_repository()
    record = repository.get(payload.job_id)
    processor = build_processor(repository=repository)
    log_event(
        logger,
        "worker.job.received",
        job_id=payload.job_id,
        **_build_worker_received_fields(record),
    )
    try:
        processor.process(payload.job_id)
    except Exception as exc:  # noqa: BLE001
        log_event(
            logger,
            "worker.job.failed",
            level=logging.ERROR,
            message="Worker failed to process the job.",
            job_id=payload.job_id,
            error=str(exc),
            exc_info=exc,
        )
        raise

    log_event(
        logger,
        "worker.job.processed",
        job_id=payload.job_id,
    )

    return {
        "job_id": payload.job_id,
        "status": "processed",
        "message": "Worker processed the job.",
    }
