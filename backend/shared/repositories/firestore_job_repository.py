"""Firestore repository implementation."""

from datetime import datetime, timezone

from google.cloud import firestore

from backend.shared.clients.firestore import get_firestore_client
from backend.shared.models.jobs import JobRecord
from backend.shared.config import get_settings


class FirestoreJobRepository:
    """Firestore-backed repository for validation jobs."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = get_firestore_client()
        self._collection = self._client.collection(settings.firestore_collection)

    def save(self, job: JobRecord) -> JobRecord:
        self._collection.document(job.job_id).set(self._serialize(job))
        return job

    def get(self, job_id: str) -> JobRecord | None:
        snapshot = self._collection.document(job_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        return self._deserialize(data)

    def update(self, job: JobRecord) -> JobRecord:
        self._collection.document(job.job_id).set(self._serialize(job))
        return job

    def list_page(self, page: int, page_size: int) -> tuple[list[JobRecord], bool]:
        offset = max(page - 1, 0) * page_size
        query = (
            self._collection.order_by("updated_at", direction=firestore.Query.DESCENDING)
            .offset(offset)
            .limit(page_size + 1)
        )
        records = [self._deserialize(snapshot.to_dict() or {}) for snapshot in query.stream()]
        has_next = len(records) > page_size
        return records[:page_size], has_next

    def _serialize(self, job: JobRecord) -> dict:
        data = job.model_dump(mode="json")
        return data

    def _deserialize(self, data: dict) -> JobRecord:
        if isinstance(data.get("created_at"), str):
            data["created_at"] = self._parse_datetime(data["created_at"])
        if isinstance(data.get("updated_at"), str):
            data["updated_at"] = self._parse_datetime(data["updated_at"])
        return JobRecord.model_validate(data)

    def _parse_datetime(self, value: str) -> datetime:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
            timezone.utc
        )
