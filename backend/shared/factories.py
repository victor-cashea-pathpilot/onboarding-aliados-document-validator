"""Shared factories for infrastructure-backed services."""

from __future__ import annotations

from backend.shared.config import get_settings
from backend.shared.dispatchers.cloud_tasks_dispatcher import CloudTasksJobDispatcher
from backend.shared.dispatchers.inline_job_dispatcher import InlineJobDispatcher
from backend.shared.dispatchers.mock_job_dispatcher import MockJobDispatcher
from backend.shared.repositories.firestore_job_repository import FirestoreJobRepository
from backend.shared.repositories.in_memory_job_repository import InMemoryJobRepository
from backend.shared.services.job_processor import JobProcessor


def build_repository():
    """Build the configured job repository."""

    settings = get_settings()
    if settings.job_repository_mode == "firestore":
        return FirestoreJobRepository()
    return InMemoryJobRepository()


def build_processor(*, repository=None) -> JobProcessor:
    """Build a processor with the configured repository."""

    settings = get_settings()
    return JobProcessor(
        repository=repository or build_repository(),
        mock_mode=settings.mock_mode,
    )


def build_dispatcher(*, repository=None):
    """Build the configured dispatcher."""

    settings = get_settings()
    if settings.job_queue_mode == "cloud_tasks":
        return CloudTasksJobDispatcher()
    if settings.job_queue_mode == "inline":
        effective_repository = repository or build_repository()
        return InlineJobDispatcher(
            processor=build_processor(repository=effective_repository),
        )
    return MockJobDispatcher()
