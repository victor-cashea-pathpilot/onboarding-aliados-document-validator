"""Tests for the internal case explorer view."""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.routes import internal_jobs
from backend.shared.models.canonical import CanonicalMerchantSnapshot
from backend.shared.models.contracts import (
    CrossValidationResult,
    DocumentsResult,
    OverallResult,
    ProgressInfo,
    SubmitValidationRequest,
)
from backend.shared.models.jobs import JobRecord
from backend.shared.repositories.in_memory_job_repository import InMemoryJobRepository
from backend.shared.services.job_service import JobService


class _NoopDispatcher:
    def dispatch(self, job):  # pragma: no cover - trivial
        return None


def build_request() -> SubmitValidationRequest:
    return SubmitValidationRequest.model_validate(
        {
            "merchant_id": "merchant-123",
            "request_id": "req-123",
            "metadata": {"source": "case-explorer-test"},
            "documents": {
                "rif": [
                    {
                        "url": "https://storage.googleapis.com/bucket/rif.pdf?X-Goog-Signature=secret&token=123",
                        "document_id": "rif-1",
                    }
                ],
                "cedula": [
                    {
                        "url": "https://example.com/cedula.jpg?sig=hidden",
                        "document_id": "ced-1",
                    }
                ],
                "certificado_emprendimiento": [],
                "acta_constitutiva": [],
                "acta_mercantil": [],
            },
        }
    )


def build_service_with_record() -> JobService:
    repository = InMemoryJobRepository()
    request = build_request()
    record = JobRecord(
        job_id="val_case123",
        merchant_id=request.merchant_id,
        request_id=request.request_id,
        request=request,
        status="COMPLETED",
        progress=ProgressInfo(
            stage="cross_validation",
            percentage=100,
            message="Completed",
        ),
        overall_result=OverallResult(
            status="REQUIRES_REVIEW",
            confidence=84,
            summary="Review requested.",
        ),
        documents=DocumentsResult(),
        normalized_snapshot=CanonicalMerchantSnapshot(
            merchant_id=request.merchant_id,
            rif_number="J123456789",
            primary_cedula_id="V12345678",
            legal_mode="sociedad_mercantil",
        ),
        cross_validation=CrossValidationResult(
            legal_mode="sociedad_mercantil",
            checks=[],
            findings=[],
        ),
    )
    repository.save(record)
    return JobService(
        repository=repository,
        dispatcher=_NoopDispatcher(),
        mock_mode=True,
    )


def test_case_explorer_service_sanitizes_request_urls() -> None:
    service = build_service_with_record()

    response = service.get_case("val_case123")

    assert response is not None
    assert response.request.documents.rif[0].url == "https://storage.googleapis.com/bucket/rif.pdf"
    assert response.request.documents.cedula[0].url == "https://example.com/cedula.jpg"
    assert response.normalized_snapshot is not None
    assert response.normalized_snapshot["legal_mode"] == "sociedad_mercantil"
    assert response.overall_result is not None
    assert response.overall_result.status == "REQUIRES_REVIEW"


def test_case_explorer_endpoint_returns_sanitized_job_detail(monkeypatch) -> None:
    service = build_service_with_record()
    monkeypatch.setattr(internal_jobs, "get_job_service", lambda: service)
    client = TestClient(app)

    response = client.get("/internal/jobs/val_case123")

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_id"] == "val_case123"
    assert payload["request"]["documents"]["rif"][0]["url"] == "https://storage.googleapis.com/bucket/rif.pdf"
    assert payload["normalized_snapshot"]["legal_mode"] == "sociedad_mercantil"


def test_case_explorer_endpoint_returns_404_when_missing(monkeypatch) -> None:
    service = build_service_with_record()
    monkeypatch.setattr(internal_jobs, "get_job_service", lambda: service)
    client = TestClient(app)

    response = client.get("/internal/jobs/missing-job")

    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found."
