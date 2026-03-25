"""Cloud Tasks dispatcher placeholder for future integration."""

from backend.shared.models.jobs import JobRecord


class CloudTasksJobDispatcher:
    """Future Cloud Tasks dispatcher."""

    def dispatch(self, job: JobRecord) -> None:
        _ = job
        raise NotImplementedError("CloudTasksJobDispatcher is not implemented yet.")
