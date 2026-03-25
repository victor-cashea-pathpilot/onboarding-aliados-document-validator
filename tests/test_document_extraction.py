"""Tests for document extraction orchestration."""

import time

from backend.shared.models.contracts import DocumentResultItem, DocumentsResult
from backend.shared.services.document_extraction import DocumentExtractionService


class SleepingExtractor:
    """Fake extractor that simulates work and returns deterministic data."""

    def __init__(self, document_type: str, delay: float = 0.2, fail: bool = False):
        self.document_type = document_type
        self.delay = delay
        self.fail = fail

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        time.sleep(self.delay)
        if self.fail:
            raise RuntimeError("boom")
        return {
            "document_type": self.document_type,
            "document_id": document_id,
            "source_url": source_url,
        }


class FakeRegistry:
    """Minimal registry for tests."""

    def __init__(self, extractor):
        self.extractor = extractor

    def get(self, document_type: str):
        _ = document_type
        return self.extractor


def build_documents() -> DocumentsResult:
    return DocumentsResult(
        rif=[
            DocumentResultItem(
                document_id="rif-1",
                status="APPROVED",
                confidence=90,
                extracted_data={
                    "source_url": "https://example.com/rif.pdf",
                    "content_type": "application/pdf",
                },
            )
        ],
        cedula=[
            DocumentResultItem(
                document_id="cedula-1",
                status="APPROVED",
                confidence=90,
                extracted_data={
                    "source_url": "https://example.com/cedula.pdf",
                    "content_type": "application/pdf",
                },
            )
        ],
    )


def test_extraction_runs_in_parallel(monkeypatch) -> None:
    monkeypatch.setenv("MAX_EXTRACTION_CONCURRENCY", "2")
    service = DocumentExtractionService(
        mock_mode=True,
        registry=FakeRegistry(SleepingExtractor("test", delay=0.2)),
    )
    documents = build_documents()

    start = time.perf_counter()
    service.extract_documents(documents)
    elapsed = time.perf_counter() - start

    assert elapsed < 0.35
    assert documents.rif[0].extracted_data["extraction_status"] == "completed"
    assert documents.cedula[0].extracted_data["extraction_status"] == "completed"


def test_extraction_failure_marks_document_for_review() -> None:
    service = DocumentExtractionService(
        mock_mode=True,
        registry=FakeRegistry(SleepingExtractor("test", delay=0, fail=True)),
    )
    documents = build_documents()

    service.extract_documents(documents)

    assert documents.rif[0].status == "REQUIRES_REVIEW"
    assert documents.rif[0].errors[0].error_code == "EXTRACTION_FAILED"
