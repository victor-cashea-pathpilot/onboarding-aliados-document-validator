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


def test_cross_validation_allows_emprendimiento_name_match_against_representative() -> None:
    snapshot = CanonicalMerchantSnapshot(
        merchant_id="merchant-3",
        rif_number="V-25610388-1",
        rif_company_name="PARRA GARCIA RAUL AMERICO",
        rif_expiration_date="04/03/2029",
        primary_cedula_id="V-25.610.388",
        company_record=CanonicalCompanyRecord(
            company_name="EMPRENDIMIENTO RAUL PARRA 3",
            source_document_type="certificado_emprendimiento",
            board_status="VIGENTE",
        ),
        representatives=[
            CanonicalRepresentative(
                full_name="RAUL AMERICO PARRA GARCIA",
                id_number="V-25.610.388",
                signature_type="SEPARADA",
                authority_details="Titular del emprendimiento",
                board_status="VIGENTE",
            )
        ],
        presence={
            "rif": True,
            "cedula": True,
            "acta_constitutiva": False,
            "acta_mercantil": False,
            "certificado_emprendimiento": True,
        },
    )

    checks = {check.code: check for check in CrossValidationService().validate(snapshot)}

    assert checks["COMPANY_NAME_MATCH"].status == "PASSED"


def test_cross_validation_allows_firma_personal_name_match_against_owner_identity() -> None:
    snapshot = CanonicalMerchantSnapshot(
        merchant_id="merchant-4",
        rif_number="V-12224346-6",
        rif_company_name="MARIANA SINAY PRIMERA GUERRA",
        rif_expiration_date="14/05/2028",
        primary_cedula_id="V-12.224.346",
        company_record=CanonicalCompanyRecord(
            company_name="LAS COQUETERIAS DE MARIANA PRIMERA, F.P.",
            source_document_type="acta_constitutiva",
            board_status="N/A (FIRMA PERSONAL)",
        ),
        representatives=[
            CanonicalRepresentative(
                full_name="MARIANA SINAY PRIMERA GUERRA",
                id_number="V-12.224.346",
                role="PROPIETARIA",
                signature_type="SEPARADA",
                authority_details="Titular de la firma personal",
                board_status="N/A (FIRMA PERSONAL)",
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


def test_cross_validation_detects_unsupported_joint_signature_scheme() -> None:
    snapshot = CanonicalMerchantSnapshot(
        merchant_id="merchant-5",
        legal_mode="sociedad_mercantil",
        rif_number="J-41036436-0",
        rif_company_name="ALFA BELLEZA C.A.",
        rif_expiration_date="22/01/2029",
        primary_cedula_id="V-12.048.047",
        company_record=CanonicalCompanyRecord(
            company_name="ALFA BELLEZA C.A.",
            source_document_type="acta_mercantil",
            source_document_date="12/06/2024",
            board_status="VIGENTE",
        ),
        representatives=[
            CanonicalRepresentative(
                full_name="FREDDY RAMON CONTRERAS DIAZ",
                id_number="V-12.048.047",
                role="Presidente",
                source_document_type="acta_mercantil",
                source_document_date="12/06/2024",
                signature_type="CONJUNTA",
                authority_details="Firma conjunta de la directiva",
                signature_validity_probability="100",
            )
        ],
        presence={
            "rif": True,
            "cedula": True,
            "acta_constitutiva": True,
            "acta_mercantil": True,
            "certificado_emprendimiento": False,
        },
    )

    checks = {check.code: check for check in CrossValidationService().validate(snapshot)}

    assert checks["LEGAL_MODE_DETECTED"].status == "PASSED"
    assert checks["CORPORATE_DOCUMENT_PRECEDENCE"].status == "PASSED"
    assert checks["SIGNATURE_AUTHORITY_PRESENT"].status == "PASSED"
    assert checks["SIGNATURE_SCHEME_SUPPORTED"].status == "FAILED"
