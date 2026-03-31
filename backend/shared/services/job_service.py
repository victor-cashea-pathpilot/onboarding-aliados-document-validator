"""Service layer for job lifecycle orchestration."""

from functools import lru_cache
from statistics import median

from backend.shared.factories import build_dispatcher, build_repository
from backend.shared.logging import get_logger, log_event
from backend.shared.models.contracts import (
    CaseExplorerListItem,
    CaseExplorerListResponse,
    CaseExplorerListStats,
    CaseExplorerOutcomeCounts,
    CaseExplorerRequestView,
    CaseExplorerResponse,
    SanitizedDocumentReference,
    SanitizedDocumentsPayload,
    StatusRequest,
    StatusResponseItem,
    SubmitValidationRequest,
    SubmitValidationResponse,
    utc_now,
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

    def list_cases(
        self,
        page: int = 1,
        page_size: int = 20,
        query: str | None = None,
    ) -> CaseExplorerListResponse:
        """Return a paginated list of jobs for the internal explorer."""

        normalized_query = (query or "").strip().lower()
        recent_records, _ = self.repository.list_page(page=1, page_size=500)
        filtered_records = self._filter_case_records(recent_records, normalized_query)
        start = max(page - 1, 0) * page_size
        end = start + page_size
        records = filtered_records[start:end]
        has_next = end < len(filtered_records)
        return CaseExplorerListResponse(
            page=page,
            page_size=page_size,
            has_next=has_next,
            query=query,
            total_items=len(filtered_records),
            stats=self._build_case_list_stats(recent_records),
            items=[self._to_case_list_item(record) for record in records],
        )

    def _filter_case_records(
        self,
        records: list[JobRecord],
        query: str,
    ) -> list[JobRecord]:
        """Filter case records by a simple free-text query."""

        if not query:
            return records

        matched: list[JobRecord] = []
        for record in records:
            legal_mode = (
                record.cross_validation.legal_mode
                if record.cross_validation is not None
                and record.cross_validation.legal_mode is not None
                else (
                    record.normalized_snapshot.legal_mode
                    if record.normalized_snapshot is not None
                    else None
                )
            )
            haystack = " ".join(
                part
                for part in (
                    record.job_id,
                    record.merchant_id,
                    record.request_id or "",
                    record.status,
                    legal_mode or "",
                    record.overall_result.status if record.overall_result is not None else "",
                )
                if part
            ).lower()
            if query in haystack:
                matched.append(record)
        return matched

    def _build_case_list_stats(self, records: list[JobRecord]) -> CaseExplorerListStats:
        """Build summary metrics for the explorer header."""

        cutoff = utc_now().timestamp() - 24 * 60 * 60
        last_24h = [record for record in records if record.created_at.timestamp() >= cutoff]
        durations = sorted(
            (record.updated_at - record.created_at).total_seconds()
            for record in last_24h
            if record.status in {"COMPLETED", "FAILED"}
        )
        return CaseExplorerListStats(
            cases_last_24h=len(last_24h),
            p50_duration_seconds=median(durations) if durations else None,
            p90_duration_seconds=self._percentile(durations, 0.9),
            outcome_counts=CaseExplorerOutcomeCounts(
                approved=sum(
                    1
                    for record in last_24h
                    if record.overall_result is not None
                    and record.overall_result.status == "APPROVED"
                ),
                rejected=sum(
                    1
                    for record in last_24h
                    if record.overall_result is not None
                    and record.overall_result.status == "REJECTED"
                ),
                requires_review=sum(
                    1
                    for record in last_24h
                    if record.overall_result is not None
                    and record.overall_result.status == "REQUIRES_REVIEW"
                ),
            ),
        )

    def _percentile(self, values: list[float], percentile: float) -> float | None:
        """Compute a discrete percentile over sorted durations."""

        if not values:
            return None
        if len(values) == 1:
            return values[0]
        index = round((len(values) - 1) * percentile)
        return values[index]

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
            progress_percentage=(
                record.progress.percentage if record.progress is not None else None
            ),
            progress_message=(
                record.progress.message if record.progress is not None else None
            ),
            document_count=record.request.documents.total_documents(),
            duration_seconds=(
                (record.updated_at - record.created_at).total_seconds()
                if record.status in {"COMPLETED", "FAILED"}
                else None
            ),
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
