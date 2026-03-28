"""Inline dispatcher for local end-to-end testing."""

from backend.shared.logging import get_logger, log_event
from backend.shared.models.jobs import JobRecord

logger = get_logger(__name__)


class InlineJobDispatcher:
    """Dispatch jobs by invoking the processor in-process."""

    def __init__(self, processor) -> None:
        self.processor = processor

    def dispatch(self, job: JobRecord) -> None:
        log_event(
            logger,
            "job.dispatched.inline",
            job_id=job.job_id,
            merchant_id=job.merchant_id,
            request_id=job.request_id,
        )
        self.processor.process(job.job_id)
