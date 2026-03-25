"""Service layer for job lifecycle orchestration."""

from functools import lru_cache

from backend.shared.config import get_settings
from backend.shared.dispatchers.cloud_tasks_dispatcher import CloudTasksJobDispatcher
from backend.shared.dispatchers.mock_job_dispatcher import MockJobDispatcher
from backend.shared.models.contracts import (
    CrossValidationCheck,
    CrossValidationResult,
    DocumentResultItem,
    DocumentsResult,
    OverallResult,
    ProgressInfo,
    StatusRequest,
    StatusResponseItem,
    SubmitValidationRequest,
    SubmitValidationResponse,
    utc_now,
)
from backend.shared.models.jobs import JobRecord
from backend.shared.repositories.firestore_job_repository import FirestoreJobRepository
from backend.shared.repositories.in_memory_job_repository import InMemoryJobRepository


class JobService:
    """Coordinates submit and status operations over abstract infra layers."""

    def __init__(self, repository, dispatcher, mock_mode: bool) -> None:
        self.repository = repository
        self.dispatcher = dispatcher
        self.mock_mode = mock_mode

    def submit(self, payload: SubmitValidationRequest) -> SubmitValidationResponse:
        """Create and dispatch a validation job."""

        response = SubmitValidationResponse(
            merchant_id=payload.merchant_id,
            request_id=payload.request_id,
        )
        record = JobRecord(
            job_id=response.job_id,
            merchant_id=response.merchant_id,
            request_id=response.request_id,
            request=payload,
            created_at=response.created_at,
            updated_at=response.created_at,
        )
        self.repository.save(record)
        self.dispatcher.dispatch(record)
        return response

    def get_status(self, payload: StatusRequest) -> list[StatusResponseItem]:
        """Return status for one or more jobs."""

        results: list[StatusResponseItem] = []
        for job_id in payload.job_ids:
            record = self.repository.get(job_id)
            if record is None:
                results.append(StatusResponseItem(job_id=job_id, status="PENDING"))
                continue

            if self.mock_mode:
                record = self._advance_mock_job(record)
                self.repository.update(record)

            results.append(self._to_status_response(record))
        return results

    def _advance_mock_job(self, record: JobRecord) -> JobRecord:
        """Advance a job through a deterministic local mock lifecycle."""

        if record.status == "PENDING":
            record.status = "PROCESSING"
            record.poll_count += 1
            record.updated_at = utc_now()
            return record

        if record.status == "PROCESSING":
            record.status = "COMPLETED"
            record.poll_count += 1
            record.updated_at = utc_now()
            return record

        return record

    def _to_status_response(self, record: JobRecord) -> StatusResponseItem:
        """Map an internal record to the public status contract."""

        if record.status == "PROCESSING":
            return StatusResponseItem(
                job_id=record.job_id,
                merchant_id=record.merchant_id,
                status=record.status,
                progress=ProgressInfo(
                    stage="mock_processing",
                    percentage=45,
                    message="Procesando documentos con mock mode habilitado.",
                ),
                created_at=record.created_at,
                updated_at=record.updated_at,
            )

        if record.status == "COMPLETED":
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

            return StatusResponseItem(
                job_id=record.job_id,
                merchant_id=record.merchant_id,
                status=record.status,
                overall_result=overall_result,
                documents=documents,
                cross_validation=CrossValidationResult(checks=checks),
                created_at=record.created_at,
                updated_at=record.updated_at,
            )

        return StatusResponseItem(
            job_id=record.job_id,
            merchant_id=record.merchant_id,
            status=record.status,
            created_at=record.created_at,
            updated_at=record.updated_at,
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

    def _build_checks(
        self,
        request: SubmitValidationRequest,
    ) -> list[CrossValidationCheck]:
        """Build base mock checks from document presence."""

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


@lru_cache(maxsize=1)
def get_job_service() -> JobService:
    """Build the service with the configured repository and dispatcher."""

    settings = get_settings()

    if settings.job_queue_mode == "cloud_tasks":
        dispatcher = MockJobDispatcher() if settings.mock_mode else CloudTasksJobDispatcher()
    else:
        dispatcher = MockJobDispatcher()

    repository = InMemoryJobRepository()
    if not settings.mock_mode:
        repository = FirestoreJobRepository()

    return JobService(
        repository=repository,
        dispatcher=dispatcher,
        mock_mode=settings.mock_mode,
    )
