"""Temporary in-memory job store used by the initial scaffold."""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime

from backend.shared.models.contracts import (
    CrossValidationCheck,
    CrossValidationResult,
    DocumentResultItem,
    DocumentsResult,
    OverallResult,
    ProgressInfo,
    StatusResponseItem,
    SubmitValidationRequest,
    SubmitValidationResponse,
    utc_now,
)


@dataclass
class StoredJob:
    """Internal representation for a mock job lifecycle."""

    request: SubmitValidationRequest
    response: SubmitValidationResponse
    poll_count: int = 0
    created_at: datetime = field(default_factory=utc_now)


class InMemoryJobStore:
    """Very small in-memory store to exercise the API contract before Firestore."""

    def __init__(self) -> None:
        self._jobs: dict[str, StoredJob] = {}

    def create_job(
        self,
        request: SubmitValidationRequest,
        response: SubmitValidationResponse,
    ) -> StatusResponseItem:
        """Persist the initial job state and return it."""

        stored = StoredJob(
            request=request,
            response=response,
            created_at=response.created_at,
        )
        self._jobs[response.job_id] = stored

        item = StatusResponseItem(
            job_id=response.job_id,
            merchant_id=response.merchant_id,
            status=response.status,
            created_at=response.created_at,
            updated_at=response.created_at,
        )
        return item

    def get_many(self, job_ids: Iterable[str]) -> list[StatusResponseItem]:
        """Return known jobs or a minimal pending placeholder for unknown ids."""

        results: list[StatusResponseItem] = []
        for job_id in job_ids:
            stored = self._jobs.get(job_id)
            if stored is None:
                results.append(StatusResponseItem(job_id=job_id, status="PENDING"))
                continue

            stored.poll_count += 1
            if stored.poll_count == 1:
                results.append(
                    StatusResponseItem(
                        job_id=stored.response.job_id,
                        merchant_id=stored.response.merchant_id,
                        status="PROCESSING",
                        progress=ProgressInfo(
                            stage="mock_processing",
                            percentage=45,
                            message="Procesando documentos con mock mode habilitado.",
                        ),
                        created_at=stored.created_at,
                        updated_at=utc_now(),
                    )
                )
                continue

            results.append(self._build_completed_response(stored))
        return results

    def _build_completed_response(self, stored: StoredJob) -> StatusResponseItem:
        """Return a deterministic mock completed response."""

        documents = self._build_documents_result(stored.request)
        checks = self._build_checks(stored.request)
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

        return StatusResponseItem(
            job_id=stored.response.job_id,
            merchant_id=stored.response.merchant_id,
            status="COMPLETED",
            overall_result=overall_result,
            documents=documents,
            cross_validation=CrossValidationResult(checks=checks),
            created_at=stored.created_at,
            updated_at=utc_now(),
        )

    def _build_documents_result(
        self,
        request: SubmitValidationRequest,
    ) -> DocumentsResult:
        """Transform submitted documents into a mock typed result."""

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
        """Return a simple successful document result for the submitted file."""

        return DocumentResultItem(
            document_id=document_id,
            status="APPROVED",
            confidence=90,
            extracted_data={
                "document_type": document_type,
                "source_url": url,
                "mock": True,
            },
            errors=[],
        )

    def _build_checks(self, request: SubmitValidationRequest) -> list[CrossValidationCheck]:
        """Build base mock checks from document presence."""

        has_rif = bool(request.documents.rif)
        has_cedula = bool(request.documents.cedula)
        has_constitutive = bool(
            request.documents.acta_constitutiva
            or request.documents.acta_mercantil
            or request.documents.certificado_emprendimiento
        )

        checks = [
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
        return checks


job_store = InMemoryJobStore()
