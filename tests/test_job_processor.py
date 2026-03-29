"""Tests for job processor technical validation behavior."""

from datetime import timedelta

from backend.shared.models.contracts import SubmitValidationRequest
from backend.shared.models.jobs import JobRecord
from backend.shared.repositories.in_memory_job_repository import InMemoryJobRepository
from backend.shared.services.document_intake import IntakeResult
from backend.shared.services.job_processor import JobProcessor
from backend.worker.routes.jobs import _build_worker_received_fields


def build_request(url: str) -> SubmitValidationRequest:
    return SubmitValidationRequest.model_validate(
        {
            "merchant_id": "98765",
            "documents": {
                "rif": [{"url": url, "document_id": "rif-1"}],
                "cedula": [],
                "certificado_emprendimiento": [],
                "acta_constitutiva": [],
                "acta_mercantil": [],
            },
        }
    )


def test_job_processor_rejects_technical_document_failures(monkeypatch) -> None:
    repository = InMemoryJobRepository()
    request = build_request("https://example.com/bad")
    record = JobRecord(
        job_id="val_test_1",
        merchant_id=request.merchant_id,
        request=request,
    )
    repository.save(record)

    processor = JobProcessor(repository=repository, mock_mode=True)

    monkeypatch.setattr(
        processor.document_intake,
        "validate_url",
        lambda url, **_: IntakeResult(
            ok=False,
            url=url,
            error_code="DOCUMENT_CONTENT_TYPE_INVALID",
            message="Unsupported content type.",
        ),
    )

    processor.process("val_test_1")
    updated = repository.get("val_test_1")

    assert updated is not None
    assert updated.status == "COMPLETED"
    assert updated.overall_result is not None
    assert updated.overall_result.status == "REJECTED"
    assert "DOCUMENT_CONTENT_TYPE_INVALID" in updated.overall_result.error_codes


def test_job_processor_adds_mock_extracted_fields_for_valid_docs(monkeypatch) -> None:
    repository = InMemoryJobRepository()
    request = build_request("https://example.com/good.pdf")
    record = JobRecord(
        job_id="val_test_2",
        merchant_id=request.merchant_id,
        request=request,
    )
    repository.save(record)

    processor = JobProcessor(repository=repository, mock_mode=True)

    monkeypatch.setattr(
        processor.document_intake,
        "validate_url",
        lambda url, **_: IntakeResult(
            ok=True,
            url=url,
            content_type="application/pdf",
            content_length=1024,
        ),
    )

    processor.process("val_test_2")
    updated = repository.get("val_test_2")

    assert updated is not None
    assert updated.documents is not None
    assert updated.cross_validation is not None
    assert updated.cross_validation.legal_mode == "unknown"
    assert updated.cross_validation.llm_cross_validation is not None
    assert updated.cross_validation.llm_legal_assessment is not None
    rif_result = updated.documents.rif[0]
    assert rif_result.status == "APPROVED"
    assert rif_result.extracted_data["extraction_status"] == "completed"
    assert "rif_number" in rif_result.extracted_data["extracted_fields"]


def test_job_processor_duration_helper_returns_milliseconds() -> None:
    processor = JobProcessor(repository=InMemoryJobRepository(), mock_mode=True)

    assert processor._duration_ms(1.0, 1.25) == 250.0
    assert processor._duration_ms(None, 1.25) is None
    assert processor._duration_ms(1.0, None) is None


def test_build_worker_received_fields_includes_queue_wait() -> None:
    request = build_request("https://example.com/good.pdf")
    record = JobRecord(
        job_id="val_test_3",
        merchant_id=request.merchant_id,
        request=request,
    )
    record.created_at = record.created_at - timedelta(seconds=5)
    record.status = "PENDING"

    fields = _build_worker_received_fields(record)

    assert fields["merchant_id"] == request.merchant_id
    assert fields["job_status"] == "PENDING"
    assert fields["queue_wait_ms"] >= 5000
