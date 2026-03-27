"""Tests for Firestore-backed repository behavior."""

from backend.shared.models.contracts import SubmitValidationRequest
from backend.shared.models.jobs import JobRecord
from backend.shared.repositories import firestore_job_repository as repo_module
from backend.shared.repositories.firestore_job_repository import FirestoreJobRepository


class FakeSnapshot:
    def __init__(self, data):
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self):
        return self._data


class FakeDocument:
    def __init__(self, store: dict, key: str) -> None:
        self.store = store
        self.key = key

    def set(self, data: dict) -> None:
        self.store[self.key] = data

    def get(self) -> FakeSnapshot:
        return FakeSnapshot(self.store.get(self.key))


class FakeCollection:
    def __init__(self, store: dict) -> None:
        self.store = store

    def document(self, key: str) -> FakeDocument:
        return FakeDocument(self.store, key)


class FakeClient:
    def __init__(self, store: dict) -> None:
        self.store = store

    def collection(self, name: str) -> FakeCollection:
        _ = name
        return FakeCollection(self.store)


def _request() -> SubmitValidationRequest:
    return SubmitValidationRequest.model_validate(
        {
            "merchant_id": "merchant-1",
            "documents": {
                "rif": [],
                "cedula": [],
                "certificado_emprendimiento": [],
                "acta_constitutiva": [],
                "acta_mercantil": [],
            },
        }
    )


def test_firestore_repository_round_trips_job_record(monkeypatch) -> None:
    store: dict = {}
    monkeypatch.setattr(repo_module, "get_firestore_client", lambda: FakeClient(store))
    monkeypatch.setenv("FIRESTORE_COLLECTION", "validation_jobs_test")

    repository = FirestoreJobRepository()
    record = JobRecord(
        job_id="job-fire-1",
        merchant_id="merchant-1",
        request=_request(),
    )

    repository.save(record)
    loaded = repository.get(record.job_id)

    assert loaded is not None
    assert loaded.job_id == record.job_id
    assert loaded.merchant_id == record.merchant_id


def test_firestore_repository_update_overwrites_job_record(monkeypatch) -> None:
    store: dict = {}
    monkeypatch.setattr(repo_module, "get_firestore_client", lambda: FakeClient(store))
    monkeypatch.setenv("FIRESTORE_COLLECTION", "validation_jobs_test")

    repository = FirestoreJobRepository()
    record = JobRecord(
        job_id="job-fire-2",
        merchant_id="merchant-2",
        request=_request(),
        status="PROCESSING",
    )

    repository.save(record)
    record.status = "COMPLETED"
    repository.update(record)
    loaded = repository.get(record.job_id)

    assert loaded is not None
    assert loaded.status == "COMPLETED"
