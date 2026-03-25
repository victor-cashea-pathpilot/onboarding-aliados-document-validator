"""Firestore client factory."""

from functools import lru_cache

from backend.shared.config import get_settings


@lru_cache(maxsize=1)
def get_firestore_client():
    """Build a Firestore client using real GCP auth or the local emulator."""

    try:
        from google.cloud import firestore
    except ImportError as exc:
        raise RuntimeError(
            "google-cloud-firestore is not installed. Install backend/requirements.txt."
        ) from exc

    settings = get_settings()
    kwargs = {}
    if settings.gcp_project_id:
        kwargs["project"] = settings.gcp_project_id
    if settings.firestore_database:
        kwargs["database"] = settings.firestore_database

    return firestore.Client(**kwargs)
