"""Temporary in-memory job store used by the initial scaffold."""

from collections.abc import Iterable

from backend.shared.models.contracts import StatusResponseItem, SubmitValidationResponse


class InMemoryJobStore:
    """Very small in-memory store to exercise the API contract before Firestore."""

    def __init__(self) -> None:
        self._jobs: dict[str, StatusResponseItem] = {}

    def create_job(self, response: SubmitValidationResponse) -> StatusResponseItem:
        """Persist the initial job state and return it."""

        item = StatusResponseItem(
            job_id=response.job_id,
            merchant_id=response.merchant_id,
            status=response.status,
            created_at=response.created_at,
            updated_at=response.created_at,
        )
        self._jobs[item.job_id] = item
        return item

    def get_many(self, job_ids: Iterable[str]) -> list[StatusResponseItem]:
        """Return known jobs or a minimal pending placeholder for unknown ids."""

        results: list[StatusResponseItem] = []
        for job_id in job_ids:
            results.append(
                self._jobs.get(
                    job_id,
                    StatusResponseItem(job_id=job_id, status="PENDING"),
                )
            )
        return results


job_store = InMemoryJobStore()
