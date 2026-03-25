"""Dispatcher contract for background job execution."""

from typing import Protocol

from backend.shared.models.jobs import JobRecord


class JobDispatcher(Protocol):
    """Dispatch abstraction for handing jobs to async infrastructure."""

    def dispatch(self, job: JobRecord) -> None:
        """Dispatch a job for background execution."""
