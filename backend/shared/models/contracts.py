"""External API contracts used by the MVP scaffold."""

from datetime import datetime, timezone
from typing import Any
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl


def utc_now() -> datetime:
    """Return an aware UTC timestamp."""

    return datetime.now(timezone.utc)


class DocumentReference(BaseModel):
    """Single document pointer received from Cashea."""

    url: HttpUrl
    document_id: str | None = None


class DocumentsPayload(BaseModel):
    """Typed document collections provided by the caller."""

    rif: list[DocumentReference] = Field(default_factory=list)
    cedula: list[DocumentReference] = Field(default_factory=list)
    certificado_emprendimiento: list[DocumentReference] = Field(default_factory=list)
    acta_constitutiva: list[DocumentReference] = Field(default_factory=list)
    acta_mercantil: list[DocumentReference] = Field(default_factory=list)

    def total_documents(self) -> int:
        """Return the number of submitted documents across all buckets."""

        return sum(
            len(bucket)
            for bucket in (
                self.rif,
                self.cedula,
                self.certificado_emprendimiento,
                self.acta_constitutiva,
                self.acta_mercantil,
            )
        )


class SubmitValidationRequest(BaseModel):
    """Customer-facing submit request."""

    merchant_id: str
    request_id: str | None = None
    documents: DocumentsPayload
    metadata: dict[str, str] = Field(default_factory=dict)


class SubmitValidationResponse(BaseModel):
    """Submit response returned immediately after job creation."""

    job_id: str = Field(default_factory=lambda: f"val_{uuid4().hex[:10]}")
    status: Literal["PENDING"] = "PENDING"
    merchant_id: str
    request_id: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class StatusRequest(BaseModel):
    """Bulk status lookup payload."""

    job_ids: list[str]


class ProgressInfo(BaseModel):
    """Progress payload for jobs in flight."""

    stage: str
    percentage: int
    message: str


class DocumentError(BaseModel):
    """Document-level error or alert."""

    error_code: str
    message: str


class DocumentResultItem(BaseModel):
    """Mock document-level validation output."""

    document_id: str | None = None
    status: Literal["APPROVED", "REJECTED", "REQUIRES_REVIEW"]
    confidence: int
    extracted_data: dict[str, Any] = Field(default_factory=dict)
    errors: list[DocumentError] = Field(default_factory=list)


class DocumentsResult(BaseModel):
    """Typed document result buckets."""

    rif: list[DocumentResultItem] = Field(default_factory=list)
    cedula: list[DocumentResultItem] = Field(default_factory=list)
    certificado_emprendimiento: list[DocumentResultItem] = Field(default_factory=list)
    acta_constitutiva: list[DocumentResultItem] = Field(default_factory=list)
    acta_mercantil: list[DocumentResultItem] = Field(default_factory=list)


class OverallResult(BaseModel):
    """Case-level outcome."""

    status: Literal["APPROVED", "REJECTED", "REQUIRES_REVIEW"]
    confidence: int
    summary: str
    error_codes: list[str] = Field(default_factory=list)


class CrossValidationCheck(BaseModel):
    """Single cross-validation check."""

    code: str
    status: Literal["PASSED", "FAILED", "SKIPPED"]
    message: str


class CrossValidationResult(BaseModel):
    """Cross-validation section in the final response."""

    checks: list[CrossValidationCheck] = Field(default_factory=list)


class StatusResponseItem(BaseModel):
    """Minimal job status model for phase 1 and 2 testing."""

    job_id: str
    status: Literal["PENDING", "PROCESSING", "COMPLETED", "FAILED"]
    merchant_id: str | None = None
    progress: ProgressInfo | None = None
    overall_result: OverallResult | None = None
    documents: DocumentsResult | None = None
    cross_validation: CrossValidationResult | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
