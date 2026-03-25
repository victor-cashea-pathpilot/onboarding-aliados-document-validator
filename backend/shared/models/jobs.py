"""Internal job models."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from backend.shared.models.contracts import SubmitValidationRequest, utc_now


class JobRecord(BaseModel):
    """Internal representation of a validation job."""

    job_id: str
    merchant_id: str
    request_id: str | None = None
    status: Literal["PENDING", "PROCESSING", "COMPLETED", "FAILED"] = "PENDING"
    poll_count: int = 0
    request: SubmitValidationRequest
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
