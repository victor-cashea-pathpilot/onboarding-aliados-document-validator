"""Inline dispatcher for local end-to-end testing."""

from backend.shared.models.jobs import JobRecord


class InlineJobDispatcher:
    """Dispatch jobs by invoking the processor in-process."""

    def __init__(self, processor) -> None:
        self.processor = processor

    def dispatch(self, job: JobRecord) -> None:
        self.processor.process(job.job_id)
