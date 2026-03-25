"""Internal job models."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from backend.shared.models.canonical import CanonicalMerchantSnapshot
from backend.shared.models.contracts import (
    CrossValidationResult,
    DocumentsResult,
    OverallResult,
    ProgressInfo,
    SubmitValidationRequest,
    utc_now,
)


class JobRecord(BaseModel):
    """Internal representation of a validation job."""

    job_id: str
    merchant_id: str
    request_id: str | None = None
    status: Literal["PENDING", "PROCESSING", "COMPLETED", "FAILED"] = "PENDING"
    poll_count: int = 0
    request: SubmitValidationRequest
    progress: ProgressInfo | None = None
    overall_result: OverallResult | None = None
    documents: DocumentsResult | None = None
    normalized_snapshot: CanonicalMerchantSnapshot | None = None
    cross_validation: CrossValidationResult | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
