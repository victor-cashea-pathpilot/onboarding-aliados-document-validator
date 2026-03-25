"""Document download and technical validation."""

from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from backend.shared.config import get_settings

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


@dataclass
class IntakeResult:
    """Technical validation result for one document URL."""

    ok: bool
    url: str
    content_type: str | None = None
    content_length: int | None = None
    error_code: str | None = None
    message: str | None = None


class DocumentIntakeService:
    """Downloads document metadata and validates basic technical constraints."""

    def __init__(self) -> None:
        settings = get_settings()
        self.timeout = settings.download_timeout_seconds
        self.max_size = settings.max_document_size_bytes

    def validate_url(self, url: str) -> IntakeResult:
        """Validate one document URL."""

        if not self._is_supported_scheme(url):
            return IntakeResult(
                ok=False,
                url=url,
                error_code="DOCUMENT_URL_INVALID",
                message="Only http and https URLs are supported.",
            )

        try:
            with httpx.stream(
                "GET",
                url,
                follow_redirects=True,
                timeout=self.timeout,
            ) as response:
                if response.status_code >= 400:
                    return IntakeResult(
                        ok=False,
                        url=url,
                        error_code="DOCUMENT_URL_UNREACHABLE",
                        message=f"Document URL returned HTTP {response.status_code}.",
                    )

                content_type = self._normalize_content_type(
                    response.headers.get("content-type")
                )
                content_length = self._parse_content_length(
                    response.headers.get("content-length")
                )

                if content_length is not None and content_length > self.max_size:
                    return IntakeResult(
                        ok=False,
                        url=url,
                        content_type=content_type,
                        content_length=content_length,
                        error_code="DOCUMENT_TOO_LARGE",
                        message=(
                            f"Document exceeds max size of {self.max_size} bytes."
                        ),
                    )

                if content_type not in ALLOWED_MIME_TYPES:
                    return IntakeResult(
                        ok=False,
                        url=url,
                        content_type=content_type,
                        content_length=content_length,
                        error_code="DOCUMENT_CONTENT_TYPE_INVALID",
                        message=(
                            "Document content type is not supported. "
                            f"Received: {content_type or 'unknown'}."
                        ),
                    )

                return IntakeResult(
                    ok=True,
                    url=url,
                    content_type=content_type,
                    content_length=content_length,
                )
        except httpx.TimeoutException:
            return IntakeResult(
                ok=False,
                url=url,
                error_code="DOCUMENT_DOWNLOAD_TIMEOUT",
                message="Timed out while downloading the document.",
            )
        except httpx.HTTPError as exc:
            return IntakeResult(
                ok=False,
                url=url,
                error_code="DOCUMENT_DOWNLOAD_FAILED",
                message=f"Failed to download the document: {exc}.",
            )

    def _is_supported_scheme(self, url: str) -> bool:
        parsed = urlparse(url)
        return parsed.scheme in {"http", "https"}

    def _normalize_content_type(self, raw: str | None) -> str | None:
        if not raw:
            return None
        return raw.split(";")[0].strip().lower()

    def _parse_content_length(self, raw: str | None) -> int | None:
        if not raw:
            return None
        try:
            return int(raw)
        except ValueError:
            return None
