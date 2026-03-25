"""Tests for technical document intake validation."""

import httpx

from backend.shared.services.document_intake import DocumentIntakeService


class MockStreamResponse:
    """Minimal context manager that mimics httpx.stream."""

    def __init__(self, status_code: int, headers: dict[str, str]):
        self.status_code = status_code
        self.headers = headers

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_validate_url_accepts_supported_pdf(monkeypatch) -> None:
    service = DocumentIntakeService()

    def fake_stream(*args, **kwargs):
        return MockStreamResponse(
            200,
            {
                "content-type": "application/pdf",
                "content-length": "1024",
            },
        )

    monkeypatch.setattr(httpx, "stream", fake_stream)

    result = service.validate_url("https://example.com/file.pdf")

    assert result.ok is True
    assert result.content_type == "application/pdf"


def test_validate_url_rejects_unsupported_content_type(monkeypatch) -> None:
    service = DocumentIntakeService()

    def fake_stream(*args, **kwargs):
        return MockStreamResponse(
            200,
            {
                "content-type": "text/html",
                "content-length": "128",
            },
        )

    monkeypatch.setattr(httpx, "stream", fake_stream)

    result = service.validate_url("https://example.com/file.html")

    assert result.ok is False
    assert result.error_code == "DOCUMENT_CONTENT_TYPE_INVALID"


def test_validate_url_rejects_large_file(monkeypatch) -> None:
    service = DocumentIntakeService()

    def fake_stream(*args, **kwargs):
        return MockStreamResponse(
            200,
            {
                "content-type": "application/pdf",
                "content-length": str(service.max_size + 1),
            },
        )

    monkeypatch.setattr(httpx, "stream", fake_stream)

    result = service.validate_url("https://example.com/big.pdf")

    assert result.ok is False
    assert result.error_code == "DOCUMENT_TOO_LARGE"


def test_validate_url_rejects_invalid_scheme() -> None:
    service = DocumentIntakeService()

    result = service.validate_url("file:///tmp/local.pdf")

    assert result.ok is False
    assert result.error_code == "DOCUMENT_URL_INVALID"
