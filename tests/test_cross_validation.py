"""Tests for deterministic cross-validation over normalized data."""

from backend.shared.models.canonical import (
    CanonicalCompanyRecord,
    CanonicalMerchantSnapshot,
    CanonicalRepresentative,
)
from backend.shared.services.cross_validation import CrossValidationService


def test_cross_validation_detects_matching_identity_and_name() -> None:
    snapshot = CanonicalMerchantSnapshot(
        merchant_id="merchant-1",
        rif_number="J-41036436-0",
        rif_company_name="FREDLOU STILO Y BELLEZA, C.A.",
        rif_expiration_date="22/01/2029",
        primary_cedula_id="V-12.048.047",
        company_record=CanonicalCompanyRecord(
            company_name="Fredlou Stilo y Belleza C.A.",
            board_status="VIGENTE",
        ),
        representatives=[
            CanonicalRepresentative(
                full_name="FREDDY RAMON CONTRERAS DIAZ",
                id_number="V-12.048.047",
                signature_type="SEPARADA",
                authority_details="Facultades generales",
            )
        ],
        presence={
            "rif": True,
            "cedula": True,
            "acta_constitutiva": True,
            "acta_mercantil": False,
            "certificado_emprendimiento": False,
        },
    )

    checks = {check.code: check for check in CrossValidationService().validate(snapshot)}

    assert checks["COMPANY_NAME_MATCH"].status == "PASSED"
    assert checks["CEDULA_MATCHES_LEGAL_REPRESENTATIVE"].status == "PASSED"
    assert checks["BOARD_VALIDITY"].status == "PASSED"
    assert checks["RIF_VALIDITY"].status == "PASSED"
    assert checks["SIGNATURE_AUTHORITY_PRESENT"].status == "PASSED"


def test_cross_validation_detects_failed_board_and_id_mismatch() -> None:
    snapshot = CanonicalMerchantSnapshot(
        merchant_id="merchant-2",
        rif_number="J-41036436-0",
        rif_company_name="FREDLOU STILO Y BELLEZA, C.A.",
        rif_expiration_date="22/01/2020",
        primary_cedula_id="V-99.999.999",
        company_record=CanonicalCompanyRecord(
            company_name="OTRA COMPANIA C.A.",
            board_status="VENCIDA",
        ),
        representatives=[
            CanonicalRepresentative(
                full_name="FREDDY RAMON CONTRERAS DIAZ",
                id_number="V-12.048.047",
                signature_type="",
                authority_details="",
            )
        ],
        presence={
            "rif": True,
            "cedula": True,
            "acta_constitutiva": True,
            "acta_mercantil": False,
            "certificado_emprendimiento": False,
        },
    )

    checks = {check.code: check for check in CrossValidationService().validate(snapshot)}

    assert checks["COMPANY_NAME_MATCH"].status == "FAILED"
    assert checks["CEDULA_MATCHES_LEGAL_REPRESENTATIVE"].status == "FAILED"
    assert checks["BOARD_VALIDITY"].status == "FAILED"
    assert checks["RIF_VALIDITY"].status == "FAILED"
