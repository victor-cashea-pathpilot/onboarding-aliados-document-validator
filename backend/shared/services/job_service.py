"""Service layer for job lifecycle orchestration."""

from functools import lru_cache

from backend.shared.factories import build_dispatcher, build_repository
from backend.shared.logging import get_logger, log_event
from backend.shared.models.contracts import (
    StatusRequest,
    StatusResponseItem,
    SubmitValidationRequest,
    SubmitValidationResponse,
)
from backend.shared.models.jobs import JobRecord
from backend.shared.config import get_settings

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
