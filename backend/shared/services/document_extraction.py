"""Parallel document extraction orchestration."""

from concurrent.futures import ThreadPoolExecutor, as_completed
import time

import httpx

from backend.shared.clients.gemini import get_gemini_client
from backend.shared.config import get_settings
from backend.shared.extraction.registry import ExtractorRegistry
from backend.shared.logging import get_logger, log_event, sanitize_url
from backend.shared.models.contracts import DocumentError, DocumentsResult

logger = get_logger(__name__)


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

    def extract_documents(
        self,
        documents: DocumentsResult,
        *,
        job_id: str | None = None,
        merchant_id: str | None = None,
        request_id: str | None = None,
    ) -> DocumentsResult:
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
        log_event(
            logger,
            "document.extraction.batch.started",
            job_id=job_id,
            merchant_id=merchant_id,
            request_id=request_id,
            task_count=len(tasks),
            max_workers=max_workers,
        )
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self._extract_single,
                    document_type,
                    item,
                    {
                        "job_id": job_id,
                        "merchant_id": merchant_id,
                        "request_id": request_id,
                    },
                ): (
                    bucket_name,
                    index,
                )
                for document_type, bucket_name, index, item in tasks
            }
            for future in as_completed(futures):
                bucket_name, index = futures[future]
                updated_item = future.result()
                getattr(documents, bucket_name)[index] = updated_item

        log_event(
            logger,
            "document.extraction.batch.completed",
            job_id=job_id,
            merchant_id=merchant_id,
            request_id=request_id,
            task_count=len(tasks),
        )
        return documents

    def _extract_single(self, document_type: str, item, context: dict[str, str | None]):
        extractor = self.registry.get(document_type)
        source_url = item.extracted_data.get("source_url")
        mime_type = item.extracted_data.get("content_type") or "application/pdf"
        started_at = time.perf_counter()
        log_event(
            logger,
            "document.extraction.started",
            document_type=document_type,
            document_id=item.document_id,
            model=getattr(extractor, "model_name", None),
            source_url=sanitize_url(source_url),
            **context,
        )

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
            log_event(
                logger,
                "document.extraction.completed",
                document_type=document_type,
                document_id=item.document_id,
                model=getattr(extractor, "model_name", None),
                duration_ms=round((time.perf_counter() - started_at) * 1000, 2),
                source_url=sanitize_url(source_url),
                **context,
            )
            return item
        except NotImplementedError as exc:
            item.status = "REQUIRES_REVIEW"
            item.errors.append(
                DocumentError(
                    error_code="EXTRACTION_NOT_IMPLEMENTED",
                    message=str(exc),
                )
            )
            log_event(
                logger,
                "document.extraction.not_implemented",
                level=30,
                document_type=document_type,
                document_id=item.document_id,
                duration_ms=round((time.perf_counter() - started_at) * 1000, 2),
                error=str(exc),
                source_url=sanitize_url(source_url),
                **context,
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
            log_event(
                logger,
                "document.extraction.failed",
                level=40,
                document_type=document_type,
                document_id=item.document_id,
                model=getattr(extractor, "model_name", None),
                duration_ms=round((time.perf_counter() - started_at) * 1000, 2),
                error=str(exc),
                source_url=sanitize_url(source_url),
                **context,
                exc_info=exc,
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
