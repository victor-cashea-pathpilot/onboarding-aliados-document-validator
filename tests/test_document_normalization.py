"""Tests for normalization from extraction outputs into canonical snapshot."""

from backend.shared.models.contracts import DocumentResultItem, DocumentsResult
from backend.shared.services.document_normalization import DocumentNormalizationService


def test_normalization_builds_canonical_snapshot_from_documents() -> None:
    documents = DocumentsResult(
        rif=[
            DocumentResultItem(
                document_id="rif-1",
                status="APPROVED",
                confidence=90,
                extracted_data={
                    "document_type": "rif",
                    "extraction_status": "completed",
                    "extracted_fields": {
                        "rif_number": "J-41036436-0",
                        "company_name": "FREDLOU STILO Y BELLEZA, C.A.",
                        "fiscal_address": "Direccion fiscal",
                        "expiration_date": "22/01/2029",
                    },
                },
            )
        ],
        cedula=[
            DocumentResultItem(
                document_id="ced-1",
                status="APPROVED",
                confidence=90,
                extracted_data={
                    "document_type": "cedula",
                    "extraction_status": "completed",
                    "extracted_fields": {
                        "id_number": "V-12.048.047",
                        "first_name": "FREDDY RAMON",
                        "last_name": "CONTRERAS DIAZ",
                    },
                },
            )
        ],
        acta_constitutiva=[
            DocumentResultItem(
                document_id="acta-1",
                status="APPROVED",
                confidence=90,
                extracted_data={
                    "document_type": "acta_constitutiva",
                    "extraction_status": "completed",
                    "extracted_fields": {
                        "razon_social": "FREDLOU STILO Y BELLEZA C.A.",
                        "registro_mercantil": {
                            "numero": "15",
                            "tomo": "54-A",
                            "fecha_registro": "07/09/2017",
                        },
                        "company_validity": {
                            "status": "VIGENTE",
                            "expiration_date": "07/09/2037",
                        },
                        "business_classification": {"line_code": "LP"},
                        "corporate_structure": {
                            "board": {
                                "status": "VENCIDA",
                                "expiration_date": "07/09/2022",
                            },
                            "legal_representative": {
                                "signature_type": "SEPARADA",
                                "signature_quote": "Texto de firma",
                                "authority_details": "Facultades generales",
                                "representatives": [
                                    {
                                        "full_name": "FREDDY RAMON CONTRERAS DIAZ",
                                        "id_number": "V-12.048.047",
                                        "specific_role": "Director",
                                        "signature_validity_probability": "100",
                                    }
                                ],
                            },
                        },
                        "locations": {"fiscal_address": "Direccion acta"},
                    },
                },
            )
        ],
    )

    snapshot = DocumentNormalizationService().normalize(
        merchant_id="merchant-1",
        documents=documents,
    )

    assert snapshot.rif_number == "J-41036436-0"
    assert snapshot.primary_cedula_id == "V-12.048.047"
    assert snapshot.company_record.company_name == "FREDLOU STILO Y BELLEZA C.A."
    assert snapshot.company_record.board_status == "VENCIDA"
    assert snapshot.company_record.registration_number == "15"
    assert snapshot.representatives[0].id_number == "V-12.048.047"
    assert snapshot.legal_mode == "sociedad_mercantil"
    assert snapshot.normalization_status == "complete"


def test_normalization_prefers_latest_corporate_document_and_derives_legal_mode() -> None:
    documents = DocumentsResult(
        acta_constitutiva=[
            DocumentResultItem(
                document_id="acta-1",
                status="APPROVED",
                confidence=90,
                extracted_data={
                    "document_type": "acta_constitutiva",
                    "extraction_status": "completed",
                    "extracted_fields": {
                        "razon_social": "ALFA BELLEZA C.A.",
                        "registro_mercantil": {"fecha_registro": "07/09/2017"},
                        "corporate_structure": {
                            "board": {"status": "VENCIDA", "expiration_date": "07/09/2022"},
                            "legal_representative": {
                                "signature_type": "SEPARADA",
                                "authority_details": "Presidencia original",
                                "representatives": [
                                    {
                                        "full_name": "ANA PEREZ",
                                        "id_number": "V-10.000.001",
                                        "specific_role": "Presidenta",
                                        "signature_validity_probability": "100",
                                    }
                                ],
                            },
                        },
                    },
                },
            )
        ],
        acta_mercantil=[
            DocumentResultItem(
                document_id="merc-1",
                status="APPROVED",
                confidence=90,
                extracted_data={
                    "document_type": "acta_mercantil",
                    "extraction_status": "completed",
                    "extracted_fields": {
                        "razon_social": "ALFA BELLEZA C.A.",
                        "registro_mercantil": {"fecha_registro": "12/06/2024"},
                        "corporate_structure": {
                            "board": {"status": "VIGENTE", "expiration_date": "12/06/2029"},
                            "legal_representative": {
                                "signature_type": "SEPARADA",
                                "authority_details": "Directiva ratificada",
                                "representatives": [
                                    {
                                        "full_name": "BEATRIZ PEREZ",
                                        "id_number": "V-10.000.002",
                                        "specific_role": "Presidenta",
                                        "signature_validity_probability": "100",
                                    }
                                ],
                            },
                        },
                    },
                },
            )
        ],
    )

    snapshot = DocumentNormalizationService().normalize(
        merchant_id="merchant-2",
        documents=documents,
    )

    assert snapshot.company_record.source_document_type == "acta_mercantil"
    assert snapshot.company_record.source_document_id == "merc-1"
    assert snapshot.company_record.registration_date == "12/06/2024"
    assert snapshot.company_record.board_status == "VIGENTE"
    assert snapshot.legal_mode == "sociedad_mercantil"
