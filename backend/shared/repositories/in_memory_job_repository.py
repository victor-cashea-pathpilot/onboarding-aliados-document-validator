"""In-memory job repository for local development and tests."""

from backend.shared.models.jobs import JobRecord


class InMemoryJobRepository:
    """Simple in-memory persistence for the mock phase."""

    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}

    def save(self, job: JobRecord) -> JobRecord:
        self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    def update(self, job: JobRecord) -> JobRecord:
        self._jobs[job.job_id] = job
        return job

    def list_page(self, page: int, page_size: int) -> tuple[list[JobRecord], bool]:
        ordered = sorted(
            self._jobs.values(),
            key=lambda job: job.updated_at,
            reverse=True,
        )
        start = max(page - 1, 0) * page_size
        end = start + page_size
        items = ordered[start:end]
        has_next = end < len(ordered)
        return items, has_next
