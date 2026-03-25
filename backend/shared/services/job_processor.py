"""Background job processing logic."""

from backend.shared.models.contracts import (
    CrossValidationCheck,
    CrossValidationResult,
    DocumentResultItem,
    DocumentsResult,
    OverallResult,
    ProgressInfo,
    utc_now,
)


class JobProcessor:
    """Processes jobs and writes status updates through the repository."""

    def __init__(self, repository, mock_mode: bool) -> None:
        self.repository = repository
        self.mock_mode = mock_mode

    def process(self, job_id: str) -> None:
        """Process a single job end to end."""

        record = self.repository.get(job_id)
        if record is None:
            raise ValueError(f"Job {job_id} not found.")

        record.status = "PROCESSING"
        record.progress = ProgressInfo(
            stage="mock_processing",
            percentage=50,
            message="Procesando job en worker.",
        )
        record.updated_at = utc_now()
        self.repository.update(record)

        documents = self._build_documents_result(record.request)
        checks = self._build_checks(record.request)
        failed_checks = [check for check in checks if check.status == "FAILED"]

        if failed_checks:
            overall_result = OverallResult(
                status="REQUIRES_REVIEW",
                confidence=78,
                summary="El caso requiere revisión manual en el mock porque faltan documentos requeridos o un check base falló.",
                error_codes=[check.code for check in failed_checks],
            )
        else:
            overall_result = OverallResult(
                status="APPROVED",
                confidence=91,
                summary="Mock aprobado: se recibieron los documentos mínimos y los checks base pasaron.",
                error_codes=[],
            )

        record.status = "COMPLETED"
        record.progress = ProgressInfo(
            stage="completed",
            percentage=100,
            message="Job completado.",
        )
        record.documents = documents
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
        return DocumentResultItem(
            document_id=document_id,
            status="APPROVED",
            confidence=90,
            extracted_data={
                "document_type": document_type,
                "source_url": url,
                "mock": self.mock_mode,
            },
            errors=[],
        )

    def _build_checks(self, request) -> list[CrossValidationCheck]:
        has_rif = bool(request.documents.rif)
        has_cedula = bool(request.documents.cedula)
        has_constitutive = bool(
            request.documents.acta_constitutiva
            or request.documents.acta_mercantil
            or request.documents.certificado_emprendimiento
        )

        return [
            CrossValidationCheck(
                code="HAS_RIF",
                status="PASSED" if has_rif else "FAILED",
                message="Se recibió al menos un RIF."
                if has_rif
                else "No se recibió RIF.",
            ),
            CrossValidationCheck(
                code="HAS_CEDULA",
                status="PASSED" if has_cedula else "FAILED",
                message="Se recibió al menos una cédula."
                if has_cedula
                else "No se recibió cédula.",
            ),
            CrossValidationCheck(
                code="HAS_CONSTITUTIVE_DOC",
                status="PASSED" if has_constitutive else "FAILED",
                message="Se recibió al menos un documento constitutivo."
                if has_constitutive
                else "No se recibió documento constitutivo o certificado de emprendimiento.",
            ),
            CrossValidationCheck(
                code="MOCK_DATA_CONSISTENCY",
                status="PASSED",
                message="Mock mode asume consistencia entre documentos recibidos.",
            ),
        ]
