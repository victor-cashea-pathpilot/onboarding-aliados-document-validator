"""Canonical internal models used for normalization and cross-validation."""

from typing import Literal

from pydantic import BaseModel, Field


class CanonicalRepresentative(BaseModel):
    """Normalized legal representative record."""

    full_name: str = ""
    id_number: str = ""
    role: str = ""
    source_document_type: str = ""
    source_document_id: str | None = None
    signature_type: str = ""
    signature_quote: str = ""
    authority_details: str = ""
    board_status: str = ""
    signature_validity_probability: str = ""
    source_document_date: str = ""


class CanonicalCompanyRecord(BaseModel):
    """Normalized company-level snapshot."""

    company_name: str = ""
    source_document_type: str = ""
    source_document_id: str | None = None
    source_document_date: str = ""
    fiscal_address: str = ""
    registration_number: str = ""
    registration_tomo: str = ""
    registration_date: str = ""
    company_status: str = ""
    company_expiration_date: str = ""
    board_status: str = ""
    board_expiration_date: str = ""
    board_source_document_type: str = ""
    board_source_document_id: str | None = None
    board_source_document_date: str = ""
    signature_type: str = ""
    signature_quote: str = ""
    authority_details: str = ""
    signature_source_document_type: str = ""
    signature_source_document_id: str | None = None
    signature_source_document_date: str = ""
    line_code: str = ""


class CanonicalMerchantSnapshot(BaseModel):
    """Single normalized snapshot for downstream rule evaluation."""

    merchant_id: str
    rif_number: str = ""
    rif_company_name: str = ""
    rif_expiration_date: str = ""
    rif_fiscal_address: str = ""
    primary_cedula_id: str = ""
    primary_cedula_full_name: str = ""
    primary_cedula_expiration_date: str = ""
    primary_cedula_is_expired: bool | None = None
    primary_cedula_expiration_years: int | None = None
    primary_cedula_policy_outcome: Literal[
        "valid",
        "expired_within_10_years",
        "expired_over_10_years",
        "unknown",
    ] = "unknown"
    legal_mode: Literal[
        "sociedad_mercantil",
        "firma_personal",
        "emprendimiento",
        "unknown",
    ] = "unknown"
    company_record: CanonicalCompanyRecord = Field(
        default_factory=CanonicalCompanyRecord
    )
    representatives: list[CanonicalRepresentative] = Field(default_factory=list)
    source_document_types: list[str] = Field(default_factory=list)
    presence: dict[str, bool] = Field(default_factory=dict)
    normalization_status: Literal["complete", "partial"] = "partial"
