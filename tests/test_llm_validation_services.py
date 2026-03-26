"""Tests for LLM-assisted validation services."""

from backend.shared.models.canonical import (
    CanonicalCompanyRecord,
    CanonicalMerchantSnapshot,
    CanonicalRepresentative,
)
from backend.shared.models.contracts import CrossValidationCheck
from backend.shared.services.cross_validation_llm import CrossValidationLLMService
from backend.shared.services.legal_assessment_llm import LegalAssessmentLLMService


class FakeGeminiClient:
    def __init__(self, response: dict) -> None:
        self.response = response
        self.calls: list[dict] = []

    def analyze_json(self, *, model: str, prompt: str, payload: dict) -> dict:
        self.calls.append({"model": model, "prompt": prompt, "payload": payload})
        return self.response


def build_snapshot() -> CanonicalMerchantSnapshot:
    return CanonicalMerchantSnapshot(
        merchant_id="merchant-1",
        legal_mode="sociedad_mercantil",
        rif_number="J-41036436-0",
        rif_company_name="ALFA BELLEZA C.A.",
        rif_expiration_date="22/01/2029",
        primary_cedula_id="V-12.048.047",
        company_record=CanonicalCompanyRecord(
            company_name="ALFA BELLEZA C.A.",
            source_document_type="acta_mercantil",
            board_status="VIGENTE",
        ),
        representatives=[
            CanonicalRepresentative(
                full_name="FREDDY RAMON CONTRERAS DIAZ",
                id_number="V-12.048.047",
                role="Presidente",
                signature_type="SEPARADA",
                authority_details="Facultades generales",
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


def test_cross_validation_llm_mock_returns_review_for_material_mismatch() -> None:
    checks = [
        CrossValidationCheck(
            code="COMPANY_NAME_MATCH",
            status="FAILED",
            message="Mismatch.",
        )
    ]
    review = CrossValidationLLMService(mock_mode=True).review(
        snapshot=build_snapshot(),
        checks=checks,
    )

    assert review.recommendation == "REQUIRES_REVIEW"
    assert any(finding.code == "MATERIAL_IDENTITY_MISMATCH" for finding in review.findings)


def test_legal_assessment_llm_mock_rejects_expired_rif() -> None:
    checks = [
        CrossValidationCheck(
            code="RIF_VALIDITY",
            status="FAILED",
            message="RIF vencido.",
        )
    ]
    review = LegalAssessmentLLMService(mock_mode=True).assess(
        snapshot=build_snapshot(),
        checks=checks,
    )

    assert review.recommendation == "REJECTED"
    assert review.findings[0].code == "FISCAL_REGISTRATION_INVALID"


def test_cross_validation_llm_real_path_uses_prompt_and_payload() -> None:
    client = FakeGeminiClient(
        {
            "recommendation": "APPROVED",
            "confidence": 87,
            "summary": "Todo consistente.",
            "findings": [],
        }
    )
    review = CrossValidationLLMService(
        mock_mode=False,
        gemini_client=client,
    ).review(
        snapshot=build_snapshot(),
        checks=[],
    )

    assert review.recommendation == "APPROVED"
    assert len(client.calls) == 1
    assert "snapshot" in client.calls[0]["payload"]
    assert "checks" in client.calls[0]["payload"]
    assert "consistencia documental" in client.calls[0]["prompt"].lower()
