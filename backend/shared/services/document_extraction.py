"""Parallel document extraction orchestration."""

from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

from backend.shared.clients.gemini import get_gemini_client
from backend.shared.config import get_settings
from backend.shared.extraction.registry import ExtractorRegistry
from backend.shared.models.contracts import DocumentError, DocumentsResult


class DocumentExtractionService:
    """Executes extraction for approved documents in parallel."""

    def __init__(self, mock_mode: bool, registry=None, gemini_client=None) -> None:
        self.settings = get_settings()
        self.mock_mode = mock_mode
        self.registry = registry or ExtractorRegistry()
        self.gemini_client = gemini_client
        self.timeout = self.settings.download_timeout_seconds
        self.max_size = self.settings.max_document_size_bytes
        self.max_workers = max(1, self.settings.max_extraction_concurrency)

    def extract_documents(self, documents: DocumentsResult) -> DocumentsResult:
        """Run extraction for all approved documents."""

        tasks = []
        for document_type, bucket_name in (
            ("rif", "rif"),
            ("cedula", "cedula"),
            ("certificado_emprendimiento", "certificado_emprendimiento"),
            ("acta_constitutiva", "acta_constitutiva"),
            ("acta_mercantil", "acta_mercantil"),
        ):
            bucket = getattr(documents, bucket_name)
            for index, item in enumerate(bucket):
                if item.status == "APPROVED":
                    tasks.append((document_type, bucket_name, index, item))

        if not tasks:
            return documents

        max_workers = min(self.max_workers, len(tasks))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self._extract_single, document_type, item): (
                    bucket_name,
                    index,
                )
                for document_type, bucket_name, index, item in tasks
            }
            for future in as_completed(futures):
                bucket_name, index = futures[future]
                updated_item = future.result()
                getattr(documents, bucket_name)[index] = updated_item

        return documents

    def _extract_single(self, document_type: str, item):
        extractor = self.registry.get(document_type)
        source_url = item.extracted_data.get("source_url")
        mime_type = item.extracted_data.get("content_type") or "application/pdf"

        try:
            if self.mock_mode:
                extracted = extractor.mock_extract(
                    document_id=item.document_id,
                    source_url=source_url,
                )
            else:
                file_bytes = self._download_bytes(source_url)
                client = self.gemini_client or get_gemini_client()
                extracted = extractor.extract(
                    client=client,
                    file_bytes=file_bytes,
                    mime_type=mime_type,
                )

            item.extracted_data = {
                **item.extracted_data,
                "extraction_status": "completed",
                "extracted_fields": extracted,
            }
            item.confidence = 90 if self.mock_mode else item.confidence
            return item
        except NotImplementedError as exc:
            item.status = "REQUIRES_REVIEW"
            item.errors.append(
                DocumentError(
                    error_code="EXTRACTION_NOT_IMPLEMENTED",
                    message=str(exc),
                )
            )
            return item
        except Exception as exc:  # noqa: BLE001
            item.status = "REQUIRES_REVIEW"
            item.errors.append(
                DocumentError(
                    error_code="EXTRACTION_FAILED",
                    message=f"Extraction failed: {exc}",
                )
            )
            return item

    def _download_bytes(self, url: str) -> bytes:
        response = httpx.get(url, follow_redirects=True, timeout=self.timeout)
        response.raise_for_status()
        content = response.content
        if len(content) > self.max_size:
            raise ValueError(
                f"Downloaded document exceeds max size of {self.max_size} bytes."
            )
        return content
