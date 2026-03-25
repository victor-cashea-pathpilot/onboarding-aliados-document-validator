"""Cloud Tasks client factory."""

from functools import lru_cache

from backend.shared.config import get_settings


@lru_cache(maxsize=1)
def get_cloud_tasks_client():
    """Build a Cloud Tasks client."""

    try:
        from google.cloud import tasks_v2
    except ImportError as exc:
        raise RuntimeError(
            "google-cloud-tasks is not installed. Install backend/requirements.txt."
        ) from exc

    _ = get_settings()
    return tasks_v2.CloudTasksClient()
