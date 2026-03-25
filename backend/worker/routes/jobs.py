"""Worker job handlers scaffold."""

from fastapi import APIRouter
from pydantic import BaseModel


class ProcessJobRequest(BaseModel):
    """Placeholder payload for a background job handler."""

    job_id: str


router = APIRouter(prefix="/internal", tags=["jobs"])


@router.post("/process-job")
async def process_job(payload: ProcessJobRequest) -> dict[str, str]:
    """Stub worker handler for future Cloud Tasks or Pub/Sub integration."""

    return {
        "job_id": payload.job_id,
        "status": "accepted",
        "message": "Worker scaffold received the job.",
    }
