"""Repository contract for job persistence."""

from typing import Protocol

from backend.shared.models.jobs import JobRecord


class JobRepository(Protocol):
    """Persistence abstraction for validation jobs."""

    def save(self, job: JobRecord) -> JobRecord:
        """Create a new job record."""

    def get(self, job_id: str) -> JobRecord | None:
        """Fetch a job by id."""

    def update(self, job: JobRecord) -> JobRecord:
        """Persist a job mutation."""

    def list_page(self, page: int, page_size: int) -> tuple[list[JobRecord], bool]:
        """Return a page of jobs ordered by recency and whether another page exists."""
