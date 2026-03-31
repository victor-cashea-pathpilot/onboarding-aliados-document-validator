"""Service layer for job lifecycle orchestration."""

from functools import lru_cache

from backend.shared.factories import build_dispatcher, build_repository
from backend.shared.logging import get_logger, log_event
from backend.shared.models.contracts import (
    CaseExplorerListItem,
    CaseExplorerListResponse,
    CaseExplorerRequestView,
    CaseExplorerResponse,
    SanitizedDocumentReference,
    SanitizedDocumentsPayload,
    StatusRequest,
    StatusResponseItem,
    SubmitValidationRequest,
    SubmitValidationResponse,
)
from backend.shared.models.jobs import JobRecord
from backend.shared.config import get_settings
from backend.shared.logging import sanitize_url

logger = get_logger(__name__)


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
        log_event(
            logger,
            "job.persisted",
            job_id=record.job_id,
            merchant_id=record.merchant_id,
            request_id=record.request_id,
            repository=self.repository.__class__.__name__,
        )
        self.dispatcher.dispatch(record)
        return response

    def get_status(self, payload: StatusRequest) -> list[StatusResponseItem]:
        """Return status for one or more jobs."""

        results: list[StatusResponseItem] = []
        for job_id in payload.job_ids:
            record = self.repository.get(job_id)
            if record is None:
                log_event(
                    logger,
                    "job.status.missing",
                    job_id=job_id,
                )
                results.append(StatusResponseItem(job_id=job_id, status="PENDING"))
                continue
            log_event(
                logger,
                "job.status.loaded",
                job_id=record.job_id,
                merchant_id=record.merchant_id,
                status=record.status,
                repository=self.repository.__class__.__name__,
            )
            results.append(self._to_status_response(record))
        return results

    def get_case(self, job_id: str) -> CaseExplorerResponse | None:
        """Return an expanded and sanitized job detail by id."""

        record = self.repository.get(job_id)
        if record is None:
            log_event(
                logger,
                "job.case.missing",
                job_id=job_id,
            )
            return None
        log_event(
            logger,
            "job.case.loaded",
            job_id=record.job_id,
            merchant_id=record.merchant_id,
            status=record.status,
            repository=self.repository.__class__.__name__,
        )
        return self._to_case_explorer_response(record)

    def list_cases(self, page: int = 1, page_size: int = 20) -> CaseExplorerListResponse:
        """Return a paginated list of jobs for the internal explorer."""

        records, has_next = self.repository.list_page(page=page, page_size=page_size)
        return CaseExplorerListResponse(
            page=page,
            page_size=page_size,
            has_next=has_next,
            items=[self._to_case_list_item(record) for record in records],
        )

    def _to_status_response(self, record: JobRecord) -> StatusResponseItem:
        """Map an internal record to the public status contract."""

        return StatusResponseItem(
            job_id=record.job_id,
            merchant_id=record.merchant_id,
            status=record.status,
            progress=record.progress,
            overall_result=record.overall_result,
            documents=record.documents,
            cross_validation=record.cross_validation,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def _to_case_explorer_response(self, record: JobRecord) -> CaseExplorerResponse:
        """Map an internal record to the internal case explorer contract."""

        return CaseExplorerResponse(
            job_id=record.job_id,
            merchant_id=record.merchant_id,
            request_id=record.request_id,
            status=record.status,
            request=self._sanitize_request(record.request),
            progress=record.progress,
            overall_result=record.overall_result,
            documents=record.documents,
            normalized_snapshot=(
                record.normalized_snapshot.model_dump(mode="json")
                if record.normalized_snapshot is not None
                else None
            ),
            cross_validation=record.cross_validation,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def _to_case_list_item(self, record: JobRecord) -> CaseExplorerListItem:
        """Map an internal record to a compact case explorer list item."""

        return CaseExplorerListItem(
            job_id=record.job_id,
            merchant_id=record.merchant_id,
            request_id=record.request_id,
            status=record.status,
            overall_status=(
                record.overall_result.status if record.overall_result is not None else None
            ),
            overall_summary=(
                record.overall_result.summary if record.overall_result is not None else None
            ),
            legal_mode=(
                record.cross_validation.legal_mode
                if record.cross_validation is not None
                else None
            ),
            stage=record.progress.stage if record.progress is not None else None,
            document_count=record.request.documents.total_documents(),
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def _sanitize_request(
        self,
        payload: SubmitValidationRequest,
    ) -> CaseExplorerRequestView:
        """Strip query parameters and secrets from document URLs."""

        def sanitize_bucket(documents):
            return [
                SanitizedDocumentReference(
                    url=sanitize_url(str(document.url)) or str(document.url),
                    document_id=document.document_id,
                )
                for document in documents
            ]

        return CaseExplorerRequestView(
            merchant_id=payload.merchant_id,
            request_id=payload.request_id,
            metadata=payload.metadata,
            documents=SanitizedDocumentsPayload(
                rif=sanitize_bucket(payload.documents.rif),
                cedula=sanitize_bucket(payload.documents.cedula),
                certificado_emprendimiento=sanitize_bucket(
                    payload.documents.certificado_emprendimiento
                ),
                acta_constitutiva=sanitize_bucket(payload.documents.acta_constitutiva),
                acta_mercantil=sanitize_bucket(payload.documents.acta_mercantil),
            ),
        )


@lru_cache(maxsize=1)
def get_job_service() -> JobService:
    """Build the service with the configured repository and dispatcher."""

    settings = get_settings()
    repository = build_repository()
    dispatcher = build_dispatcher(repository=repository)

    return JobService(
        repository=repository,
        dispatcher=dispatcher,
        mock_mode=settings.mock_mode,
    )
