"""Worker job handlers scaffold."""

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from backend.shared.config import get_settings
from backend.shared.repositories.firestore_job_repository import FirestoreJobRepository
from backend.shared.repositories.in_memory_job_repository import InMemoryJobRepository
from backend.shared.services.job_processor import JobProcessor


class ProcessJobRequest(BaseModel):
    """Placeholder payload for a background job handler."""

    job_id: str


router = APIRouter(prefix="/internal", tags=["jobs"])
settings = get_settings()


def _get_repository():
    if settings.job_repository_mode == "firestore":
        return FirestoreJobRepository()
    return InMemoryJobRepository()


@router.post("/process-job")
async def process_job(
    payload: ProcessJobRequest,
    x_worker_token: str | None = Header(default=None),
) -> dict[str, str]:
    """Process a job from Cloud Tasks or a local caller."""

    if settings.worker_auth_token and x_worker_token != settings.worker_auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid worker token.",
        )

    processor = JobProcessor(
        repository=_get_repository(),
        mock_mode=settings.mock_mode,
    )
    processor.process(payload.job_id)

    return {
        "job_id": payload.job_id,
        "status": "processed",
        "message": "Worker processed the job.",
    }
