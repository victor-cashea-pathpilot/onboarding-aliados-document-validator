"""Tests for service factory selection."""

from functools import lru_cache

from backend.shared.config import get_settings
from backend.shared.services import job_service as job_service_module
from backend.shared.services.job_service import get_job_service


def clear_caches() -> None:
    get_job_service.cache_clear()
    get_settings.cache_clear()


def test_job_service_factory_defaults_to_inmemory(monkeypatch) -> None:
    clear_caches()
    monkeypatch.delenv("JOB_REPOSITORY_MODE", raising=False)
    monkeypatch.setenv("MOCK_MODE", "true")
    monkeypatch.setenv("JOB_QUEUE_MODE", "mock")

    service = get_job_service()

    assert service.repository.__class__.__name__ == "InMemoryJobRepository"


def test_job_service_factory_can_select_firestore(monkeypatch) -> None:
    clear_caches()
    monkeypatch.setenv("JOB_REPOSITORY_MODE", "firestore")
    monkeypatch.setenv("MOCK_MODE", "true")
    monkeypatch.setenv("JOB_QUEUE_MODE", "mock")

    class FakeFirestoreRepository:
        def save(self, job):
            return job

        def get(self, job_id):
            return None

        def update(self, job):
            return job

    monkeypatch.setattr(
        job_service_module,
        "build_repository",
        lambda: FakeFirestoreRepository(),
    )

    service = get_job_service()

    assert service.repository.__class__.__name__ == "FakeFirestoreRepository"


def test_job_service_factory_can_select_cloud_tasks_dispatcher(monkeypatch) -> None:
    clear_caches()
    monkeypatch.setenv("JOB_REPOSITORY_MODE", "inmemory")
    monkeypatch.setenv("MOCK_MODE", "true")
    monkeypatch.setenv("JOB_QUEUE_MODE", "cloud_tasks")

    class FakeCloudTasksDispatcher:
        def dispatch(self, job):
            return None

    monkeypatch.setattr(
        job_service_module,
        "build_dispatcher",
        lambda repository=None: FakeCloudTasksDispatcher(),
    )

    service = get_job_service()

    assert service.dispatcher.__class__.__name__ == "FakeCloudTasksDispatcher"


def test_job_service_factory_can_select_inline_dispatcher(monkeypatch) -> None:
    clear_caches()
    monkeypatch.setenv("JOB_REPOSITORY_MODE", "inmemory")
    monkeypatch.setenv("MOCK_MODE", "true")
    monkeypatch.setenv("JOB_QUEUE_MODE", "inline")

    class FakeInlineDispatcher:
        def dispatch(self, job):
            return None

    monkeypatch.setattr(
        job_service_module,
        "build_dispatcher",
        lambda repository=None: FakeInlineDispatcher(),
    )

    service = get_job_service()

    assert service.dispatcher.__class__.__name__ == "FakeInlineDispatcher"
