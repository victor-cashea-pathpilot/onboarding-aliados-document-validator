"""Tests for Cloud Tasks dispatcher wiring."""

import json

from backend.shared.config import get_settings
from backend.shared.dispatchers.cloud_tasks_dispatcher import CloudTasksJobDispatcher
from backend.shared.models.contracts import SubmitValidationRequest
from backend.shared.models.jobs import JobRecord
from backend.shared.dispatchers import cloud_tasks_dispatcher as dispatcher_module


class FakeCloudTasksClient:
    def __init__(self) -> None:
        self.created: list[dict] = []

    def queue_path(self, project: str, region: str, queue_id: str) -> str:
        return f"projects/{project}/locations/{region}/queues/{queue_id}"

    def create_task(self, *, parent: str, task: dict) -> dict:
        self.created.append({"parent": parent, "task": task})
        return {"name": "task-1"}


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


def test_cloud_tasks_dispatcher_builds_expected_task(monkeypatch) -> None:
    get_settings.cache_clear()
    fake_client = FakeCloudTasksClient()
    fake_tasks_module = type(
        "FakeTasksModule",
        (),
        {"HttpMethod": type("HttpMethod", (), {"POST": "POST"})},
    )

    monkeypatch.setenv("GCP_PROJECT_ID", "project-1")
    monkeypatch.setenv("GCP_REGION", "us-central1")
    monkeypatch.setenv("CLOUD_TASKS_QUEUE_ID", "queue-1")
    monkeypatch.setenv("WORKER_BASE_URL", "https://worker.example.com")
    monkeypatch.setenv("WORKER_AUTH_TOKEN", "secret-token")
    monkeypatch.setattr(dispatcher_module, "get_cloud_tasks_client", lambda: fake_client)

    import builtins

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "google.cloud" and fromlist == ("tasks_v2",):
            return type("googlecloud", (), {"tasks_v2": fake_tasks_module})
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    dispatcher = CloudTasksJobDispatcher()
    record = JobRecord(job_id="job-1", merchant_id="merchant-1", request=_request())

    dispatcher.dispatch(record)

    created = fake_client.created[0]
    assert created["parent"] == "projects/project-1/locations/us-central1/queues/queue-1"
    http_request = created["task"]["http_request"]
    assert http_request["url"] == "https://worker.example.com/internal/process-job"
    assert http_request["headers"]["X-Worker-Token"] == "secret-token"
    assert json.loads(http_request["body"].decode()) == {"job_id": "job-1"}
    get_settings.cache_clear()
