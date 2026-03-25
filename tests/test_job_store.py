"""Tests for the mock job lifecycle."""

from backend.shared.models.contracts import SubmitValidationRequest
from backend.shared.dispatchers.mock_job_dispatcher import MockJobDispatcher
from backend.shared.repositories.in_memory_job_repository import InMemoryJobRepository
from backend.shared.services.job_service import JobService


def build_request() -> SubmitValidationRequest:
    return SubmitValidationRequest.model_validate(
        {
            "merchant_id": "98765",
            "documents": {
                "rif": [{"url": "https://example.com/rif.pdf", "document_id": "rif-1"}],
                "cedula": [{"url": "https://example.com/cedula.jpg", "document_id": "ced-1"}],
                "certificado_emprendimiento": [],
                "acta_constitutiva": [
                    {"url": "https://example.com/acta.pdf", "document_id": "acta-1"}
                ],
                "acta_mercantil": [],
            },
        }
    )


def test_mock_job_lifecycle_progresses_to_completed() -> None:
    service = JobService(
        repository=InMemoryJobRepository(),
        dispatcher=MockJobDispatcher(),
        mock_mode=True,
    )
    request = build_request()
    response = service.submit(request)

    processing = service.get_status(job_ids_to_status_request([response.job_id]))[0]
    completed = service.get_status(job_ids_to_status_request([response.job_id]))[0]

    assert processing.status == "PROCESSING"
    assert completed.status == "COMPLETED"
    assert completed.overall_result is not None
    assert completed.documents is not None
    assert completed.cross_validation is not None


def job_ids_to_status_request(job_ids: list[str]):
    from backend.shared.models.contracts import StatusRequest

    return StatusRequest(job_ids=job_ids)
