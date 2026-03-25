"""Tests for the mock job lifecycle."""

from backend.shared.models.contracts import SubmitValidationRequest
from backend.shared.services.job_store import InMemoryJobStore


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
    store = InMemoryJobStore()
    request = build_request()
    response = store.create_job(
        request=request,
        response=request_to_response(request),
    )

    processing = store.get_many([response.job_id])[0]
    completed = store.get_many([response.job_id])[0]

    assert processing.status == "PROCESSING"
    assert completed.status == "COMPLETED"
    assert completed.overall_result is not None
    assert completed.documents is not None
    assert completed.cross_validation is not None


def request_to_response(request: SubmitValidationRequest):
    from backend.shared.models.contracts import SubmitValidationResponse

    return SubmitValidationResponse(
        merchant_id=request.merchant_id,
        request_id=request.request_id,
    )
