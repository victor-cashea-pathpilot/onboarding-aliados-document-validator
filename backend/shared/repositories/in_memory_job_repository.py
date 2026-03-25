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
