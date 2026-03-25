"""Background job processing logic."""

from backend.shared.models.contracts import DocumentError
from backend.shared.models.contracts import (
    CrossValidationResult,
    DocumentResultItem,
    DocumentsResult,
    OverallResult,
    ProgressInfo,
    utc_now,
)
from backend.shared.services.cross_validation import CrossValidationService
from backend.shared.services.document_extraction import DocumentExtractionService
from backend.shared.services.document_intake import DocumentIntakeService
from backend.shared.services.document_normalization import DocumentNormalizationService


class JobProcessor:
    """Processes jobs and writes status updates through the repository."""

    def __init__(self, repository, mock_mode: bool) -> None:
        self.repository = repository
        self.mock_mode = mock_mode
        self.document_intake = DocumentIntakeService()
        self.document_extraction = DocumentExtractionService(mock_mode=mock_mode)
        self.document_normalization = DocumentNormalizationService()
        self.cross_validation = CrossValidationService()

    def process(self, job_id: str) -> None:
        """Process a single job end to end."""

        record = self.repository.get(job_id)
        if record is None:
            raise ValueError(f"Job {job_id} not found.")

        record.status = "PROCESSING"
        record.progress = ProgressInfo(
            stage="document_intake",
            percentage=25,
            message="Validando acceso y formato de documentos.",
        )
        record.updated_at = utc_now()
        self.repository.update(record)

        documents = self._build_documents_result(record.request)
        if self._count_extractable_documents(documents) > 0:
            record.progress = ProgressInfo(
                stage="document_extraction",
                percentage=65,
                message="Extrayendo datos de documentos en paralelo.",
            )
            record.updated_at = utc_now()
            self.repository.update(record)
            documents = self.document_extraction.extract_documents(documents)

        record.progress = ProgressInfo(
            stage="document_normalization",
            percentage=80,
            message="Normalizando datos extraídos y consolidando snapshot canónico.",
        )
        record.updated_at = utc_now()
        self.repository.update(record)
        normalized_snapshot = self.document_normalization.normalize(
            merchant_id=record.merchant_id,
            documents=documents,
        )

        record.progress = ProgressInfo(
            stage="cross_validation",
            percentage=90,
            message="Ejecutando validaciones cruzadas sobre datos normalizados.",
        )
        record.updated_at = utc_now()
        self.repository.update(record)
        checks = self.cross_validation.validate(normalized_snapshot)
        failed_checks = [check for check in checks if check.status == "FAILED"]
        technical_failures = self._count_technical_failures(documents)
        extraction_failures = self._count_extraction_failures(documents)

        if technical_failures > 0:
            overall_result = OverallResult(
                status="REJECTED",
                confidence=95,
                summary="El caso fue rechazado por errores técnicos en uno o más documentos.",
                error_codes=self._collect_document_error_codes(documents),
            )
        elif extraction_failures > 0:
            overall_result = OverallResult(
                status="REQUIRES_REVIEW",
                confidence=70,
                summary="El caso requiere revisión manual porque una o más extracciones fallaron.",
                error_codes=self._collect_document_error_codes(documents),
            )
        elif failed_checks:
            failed_codes = [check.code for check in failed_checks]
            if any(code in {"HAS_RIF", "HAS_CEDULA", "HAS_CONSTITUTIVE_DOC"} for code in failed_codes):
                summary = "El caso requiere revisión manual porque faltan documentos obligatorios."
            else:
                summary = "El caso requiere revisión manual porque una o más validaciones cruzadas fallaron."
            overall_result = OverallResult(
                status="REQUIRES_REVIEW",
                confidence=78,
                summary=summary,
                error_codes=failed_codes,
            )
        else:
            overall_result = OverallResult(
                status="APPROVED",
                confidence=91,
                summary="El caso pasó las validaciones técnicas, de extracción y las validaciones cruzadas actuales.",
                error_codes=[],
            )

        record.status = "COMPLETED"
        record.progress = ProgressInfo(
            stage="completed",
            percentage=100,
            message="Job completado.",
        )
        record.documents = documents
        record.normalized_snapshot = normalized_snapshot
        record.cross_validation = CrossValidationResult(checks=checks)
        record.overall_result = overall_result
        record.updated_at = utc_now()
        self.repository.update(record)

    def _build_documents_result(self, request) -> DocumentsResult:
        return DocumentsResult(
            rif=[
                self._mock_document_result("rif", doc.document_id, str(doc.url))
                for doc in request.documents.rif
            ],
            cedula=[
                self._mock_document_result("cedula", doc.document_id, str(doc.url))
                for doc in request.documents.cedula
            ],
            certificado_emprendimiento=[
                self._mock_document_result(
                    "certificado_emprendimiento",
                    doc.document_id,
                    str(doc.url),
                )
                for doc in request.documents.certificado_emprendimiento
            ],
            acta_constitutiva=[
                self._mock_document_result(
                    "acta_constitutiva",
                    doc.document_id,
                    str(doc.url),
                )
                for doc in request.documents.acta_constitutiva
            ],
            acta_mercantil=[
                self._mock_document_result(
                    "acta_mercantil",
                    doc.document_id,
                    str(doc.url),
                )
                for doc in request.documents.acta_mercantil
            ],
        )

    def _mock_document_result(
        self,
        document_type: str,
        document_id: str | None,
        url: str,
    ) -> DocumentResultItem:
        intake = self.document_intake.validate_url(url)

        if not intake.ok:
            return DocumentResultItem(
                document_id=document_id,
                status="REJECTED",
                confidence=100,
                extracted_data={
                    "document_type": document_type,
                    "source_url": url,
                    "mock": self.mock_mode,
                    "content_type": intake.content_type,
                    "content_length": intake.content_length,
                },
                errors=[
                    DocumentError(
                        error_code=intake.error_code or "DOCUMENT_VALIDATION_FAILED",
                        message=intake.message or "Document validation failed.",
                    )
                ],
            )

        return DocumentResultItem(
            document_id=document_id,
            status="APPROVED",
            confidence=90,
            extracted_data={
                "document_type": document_type,
                "source_url": url,
                "mock": self.mock_mode,
                "content_type": intake.content_type,
                "content_length": intake.content_length,
            },
            errors=[],
        )

    def _count_technical_failures(self, documents: DocumentsResult) -> int:
        return sum(
            1
            for bucket in (
                documents.rif,
                documents.cedula,
                documents.certificado_emprendimiento,
                documents.acta_constitutiva,
                documents.acta_mercantil,
            )
            for item in bucket
            if item.status == "REJECTED" and item.errors
        )

    def _collect_document_error_codes(self, documents: DocumentsResult) -> list[str]:
        codes: list[str] = []
        for bucket in (
            documents.rif,
            documents.cedula,
            documents.certificado_emprendimiento,
            documents.acta_constitutiva,
            documents.acta_mercantil,
        ):
            for item in bucket:
                for error in item.errors:
                    if error.error_code not in codes:
                        codes.append(error.error_code)
        return codes

    def _count_extractable_documents(self, documents: DocumentsResult) -> int:
        return sum(
            1
            for bucket in (
                documents.rif,
                documents.cedula,
                documents.certificado_emprendimiento,
                documents.acta_constitutiva,
                documents.acta_mercantil,
            )
            for item in bucket
            if item.status == "APPROVED"
        )

    def _count_extraction_failures(self, documents: DocumentsResult) -> int:
        return sum(
            1
            for bucket in (
                documents.rif,
                documents.cedula,
                documents.certificado_emprendimiento,
                documents.acta_constitutiva,
                documents.acta_mercantil,
            )
            for item in bucket
            for error in item.errors
            if error.error_code in {"EXTRACTION_FAILED", "EXTRACTION_NOT_IMPLEMENTED"}
        )
