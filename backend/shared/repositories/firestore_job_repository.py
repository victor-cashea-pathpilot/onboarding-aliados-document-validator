"""Firestore repository placeholder for future job persistence."""

from backend.shared.models.jobs import JobRecord


class FirestoreJobRepository:
    """Future Firestore-backed repository."""

    def save(self, job: JobRecord) -> JobRecord:
        raise NotImplementedError("FirestoreJobRepository is not implemented yet.")

    def get(self, job_id: str) -> JobRecord | None:
        raise NotImplementedError("FirestoreJobRepository is not implemented yet.")

    def update(self, job: JobRecord) -> JobRecord:
        raise NotImplementedError("FirestoreJobRepository is not implemented yet.")
