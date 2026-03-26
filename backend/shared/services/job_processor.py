"""Background job processing logic."""

from __future__ import annotations

from backend.shared.models.contracts import (
    CrossValidationFinding,
    CrossValidationResult,
    DocumentError,
    DocumentResultItem,
    DocumentsResult,
    OverallResult,
    ProgressInfo,
    utc_now,
)
from backend.shared.services.cross_validation import CrossValidationService
from backend.shared.services.cross_validation_llm import CrossValidationLLMService
from backend.shared.services.document_extraction import DocumentExtractionService
from backend.shared.services.document_intake import DocumentIntakeService
from backend.shared.services.document_normalization import DocumentNormalizationService
from backend.shared.services.legal_assessment_llm import LegalAssessmentLLMService


class JobProcessor:
    """Processes jobs and writes status updates through the repository."""

    def __init__(self, repository, mock_mode: bool) -> None:
        self.repository = repository
        self.mock_mode = mock_mode
        self.document_intake = DocumentIntakeService()
        self.document_extraction = DocumentExtractionService(mock_mode=mock_mode)
        self.document_normalization = DocumentNormalizationService()
        self.cross_validation = CrossValidationService()
        self.cross_validation_llm = CrossValidationLLMService(mock_mode=mock_mode)
        self.legal_assessment_llm = LegalAssessmentLLMService(mock_mode=mock_mode)

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
        llm_cross_validation = self.cross_validation_llm.review(
            snapshot=normalized_snapshot,
            checks=checks,
        )
        llm_legal_assessment = self.legal_assessment_llm.assess(
            snapshot=normalized_snapshot,
            checks=checks,
        )

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
        else:
            overall_result = self._compose_cross_validation_result(
                failed_checks=failed_checks,
                llm_cross_validation=llm_cross_validation,
                llm_legal_assessment=llm_legal_assessment,
            )

        record.status = "COMPLETED"
        record.progress = ProgressInfo(
            stage="completed",
            percentage=100,
            message="Job completado.",
        )
        record.documents = documents
        record.normalized_snapshot = normalized_snapshot
        record.cross_validation = CrossValidationResult(
            legal_mode=normalized_snapshot.legal_mode,
            checks=checks,
            findings=[
                *self._build_rule_findings(checks),
                *llm_cross_validation.findings,
                *llm_legal_assessment.findings,
            ],
            llm_cross_validation=llm_cross_validation,
            llm_legal_assessment=llm_legal_assessment,
        )
        record.overall_result = overall_result
        record.updated_at = utc_now()
        self.repository.update(record)

    def _compose_cross_validation_result(
        self,
        *,
        failed_checks,
        llm_cross_validation,
        llm_legal_assessment,
    ) -> OverallResult:
        failed_codes = [check.code for check in failed_checks]
        if failed_checks:
            base_result = OverallResult(
                status="REQUIRES_REVIEW",
                confidence=78,
                summary=(
                    "El caso requiere revisión manual porque faltan documentos obligatorios."
                    if any(
                        code in {"HAS_RIF", "HAS_CEDULA", "HAS_CONSTITUTIVE_DOC"}
                        for code in failed_codes
                    )
                    else "El caso requiere revisión manual porque una o más validaciones cruzadas fallaron."
                ),
                error_codes=failed_codes,
            )
        else:
            base_result = OverallResult(
                status="APPROVED",
                confidence=91,
                summary="El caso pasó las validaciones técnicas, de extracción y las validaciones cruzadas actuales.",
                error_codes=[],
            )

        candidates = [
            ("rules", base_result.status, base_result.confidence, base_result.summary),
            (
                "llm_cross_validation",
                llm_cross_validation.recommendation,
                llm_cross_validation.confidence,
                llm_cross_validation.summary,
            ),
            (
                "llm_legal_assessment",
                llm_legal_assessment.recommendation,
                llm_legal_assessment.confidence,
                llm_legal_assessment.summary,
            ),
        ]
        severity_order = {"APPROVED": 0, "REQUIRES_REVIEW": 1, "REJECTED": 2}
        dominant_source, dominant_status, dominant_confidence, dominant_summary = max(
            candidates,
            key=lambda item: (severity_order[item[1]], item[2]),
        )
        if dominant_source == "rules":
            return base_result

        combined_error_codes = list(base_result.error_codes)
        for review in (llm_cross_validation, llm_legal_assessment):
            for finding in review.findings:
                for related_check in finding.related_checks:
                    if related_check not in combined_error_codes:
                        combined_error_codes.append(related_check)

        return OverallResult(
            status=dominant_status,
            confidence=dominant_confidence,
            summary=dominant_summary,
            error_codes=combined_error_codes,
        )

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

    def _build_rule_findings(self, checks) -> list[CrossValidationFinding]:
        findings: list[CrossValidationFinding] = []
        for check in checks:
            if check.status == "PASSED":
                continue
            findings.append(
                CrossValidationFinding(
                    source="rules",
                    severity="CRITICAL" if check.status == "FAILED" else "WARNING",
                    code=check.code,
                    message=check.message,
                    related_checks=[check.code],
                )
            )
        return findings
