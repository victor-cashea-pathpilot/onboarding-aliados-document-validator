"""Worker job handlers scaffold."""

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from backend.shared.config import get_settings
from backend.shared.factories import build_processor


class ProcessJobRequest(BaseModel):
    """Placeholder payload for a background job handler."""

    job_id: str


router = APIRouter(prefix="/internal", tags=["jobs"])


@router.post("/process-job")
async def process_job(
    payload: ProcessJobRequest,
    x_worker_token: str | None = Header(default=None),
) -> dict[str, str]:
    """Process a job from Cloud Tasks or a local caller."""

    settings = get_settings()
    if settings.worker_auth_token and x_worker_token != settings.worker_auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid worker token.",
        )

    processor = build_processor()
    processor.process(payload.job_id)

    return {
        "job_id": payload.job_id,
        "status": "processed",
        "message": "Worker processed the job.",
    }
