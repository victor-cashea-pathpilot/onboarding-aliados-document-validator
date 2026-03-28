"""Cloud Tasks dispatcher implementation."""

import json

from backend.shared.clients.cloud_tasks import get_cloud_tasks_client
from backend.shared.config import get_settings
from backend.shared.logging import get_logger, log_event
from backend.shared.models.jobs import JobRecord

logger = get_logger(__name__)


class CloudTasksJobDispatcher:
    """Dispatch jobs to the worker service through Cloud Tasks."""

    def dispatch(self, job: JobRecord) -> None:
        settings = get_settings()
        if not settings.gcp_project_id or not settings.gcp_region or not settings.cloud_tasks_queue_id:
            raise ValueError(
                "GCP_PROJECT_ID, GCP_REGION and CLOUD_TASKS_QUEUE_ID are required for cloud_tasks mode."
            )
        if not settings.worker_base_url:
            raise ValueError("WORKER_BASE_URL is required for cloud_tasks mode.")

        from google.cloud import tasks_v2

        client = get_cloud_tasks_client()
        parent = client.queue_path(
            settings.gcp_project_id,
            settings.gcp_region,
            settings.cloud_tasks_queue_id,
        )
        payload = json.dumps({"job_id": job.job_id}).encode()

        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": f"{settings.worker_base_url.rstrip('/')}/internal/process-job",
                "headers": {
                    "Content-Type": "application/json",
                },
                "body": payload,
            }
        }

        if settings.cloud_tasks_service_account_email:
            task["http_request"]["oidc_token"] = {
                "service_account_email": settings.cloud_tasks_service_account_email,
                "audience": settings.worker_audience
                or settings.worker_base_url.rstrip("/"),
            }

        if settings.worker_auth_token:
            task["http_request"]["headers"]["X-Worker-Token"] = settings.worker_auth_token

        client.create_task(parent=parent, task=task)
        log_event(
            logger,
            "job.dispatched.cloud_tasks",
            job_id=job.job_id,
            merchant_id=job.merchant_id,
            request_id=job.request_id,
            queue_id=settings.cloud_tasks_queue_id,
            worker_url=f"{settings.worker_base_url.rstrip('/')}/internal/process-job",
        )
