"""No-op dispatcher used for local mock mode."""

from backend.shared.models.jobs import JobRecord


class MockJobDispatcher:
    """No-op dispatcher while the flow remains local and mocked."""

    def dispatch(self, job: JobRecord) -> None:
        _ = job
