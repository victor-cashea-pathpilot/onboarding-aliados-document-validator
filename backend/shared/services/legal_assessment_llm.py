"""LLM-assisted legal assessment and verdict recommendation."""

from __future__ import annotations

from backend.shared.clients.gemini import get_gemini_client
from backend.shared.config import get_settings
from backend.shared.models.canonical import CanonicalMerchantSnapshot
from backend.shared.models.contracts import (
    CrossValidationCheck,
    CrossValidationFinding,
    LLMValidationReview,
)
from backend.shared.validation_prompts import build_legal_assessment_prompt


class LegalAssessmentLLMService:
    """Final legal assessment layer over normalized data and checks."""

    def __init__(self, *, mock_mode: bool, gemini_client=None) -> None:
        self.settings = get_settings()
        self.mock_mode = mock_mode
        self.gemini_client = gemini_client
        self.model_name = self.settings.gemini_model_complex

    def assess(
        self,
        *,
        snapshot: CanonicalMerchantSnapshot,
        checks: list[CrossValidationCheck],
    ) -> LLMValidationReview:
        if not self.settings.enable_llm_legal_assessment:
            return LLMValidationReview(
                recommendation="APPROVED",
                confidence=0,
                summary="La evaluación legal asistida por LLM está deshabilitada.",
                findings=[],
            )

        if self.mock_mode:
            return self._mock_assessment(snapshot=snapshot, checks=checks)

        client = self.gemini_client or get_gemini_client()
        response = client.analyze_json(
            model=self.model_name,
            prompt=build_legal_assessment_prompt(),
            payload=self._build_payload(snapshot=snapshot, checks=checks),
        )
        return self._parse_response(response, source="llm_legal_assessment")

    def _mock_assessment(
        self,
        *,
        snapshot: CanonicalMerchantSnapshot,
        checks: list[CrossValidationCheck],
    ) -> LLMValidationReview:
        failed_codes = {check.code for check in checks if check.status == "FAILED"}

        if "RIF_VALIDITY" in failed_codes:
            return LLMValidationReview(
                recommendation="REJECTED",
                confidence=90,
                summary="La evaluación legal recomienda rechazo por un RIF no vigente o materialmente inválido.",
                findings=[
                    CrossValidationFinding(
                        source="llm_legal_assessment",
                        severity="CRITICAL",
                        code="FISCAL_REGISTRATION_INVALID",
                        message="Un RIF vencido o inválido impide sostener una aprobación operativa.",
                        related_checks=["RIF_VALIDITY"],
                    )
                ],
            )

        if snapshot.legal_mode == "unknown" or failed_codes:
            return LLMValidationReview(
                recommendation="REQUIRES_REVIEW",
                confidence=80,
                summary="La evaluación legal recomienda revisión manual por ambigüedad o contradicciones pendientes.",
                findings=[
                    CrossValidationFinding(
                        source="llm_legal_assessment",
                        severity="WARNING",
                        code="LEGAL_REVIEW_REQUIRED",
                        message="El expediente requiere criterio humano para validar representación, vigencia o consistencia material.",
                        related_checks=sorted(failed_codes) or ["LEGAL_MODE_DETECTED"],
                    )
                ],
            )

        return LLMValidationReview(
            recommendation="APPROVED",
            confidence=89,
            summary="La evaluación legal considera suficiente la evidencia para continuar con el onboarding.",
            findings=[
                CrossValidationFinding(
                    source="llm_legal_assessment",
                    severity="INFO",
                    code="LEGAL_SUFFICIENCY_OK",
                    message="La evidencia legal disponible es consistente con una aprobación inicial.",
                    related_checks=[],
                )
            ],
        )

    def _build_payload(
        self,
        *,
        snapshot: CanonicalMerchantSnapshot,
        checks: list[CrossValidationCheck],
    ) -> dict:
        return {
            "snapshot": snapshot.model_dump(mode="json"),
            "checks": [check.model_dump(mode="json") for check in checks],
        }

    def _parse_response(self, response: dict, *, source: str) -> LLMValidationReview:
        findings = [
            CrossValidationFinding(
                source=source,  # type: ignore[arg-type]
                severity=item.get("severity", "WARNING"),
                code=item.get("code", "LLM_LEGAL_NOTE"),
                message=item.get("message", ""),
                related_checks=item.get("related_checks", []),
            )
            for item in response.get("findings", [])
        ]
        return LLMValidationReview(
            recommendation=response.get("recommendation", "REQUIRES_REVIEW"),
            confidence=int(response.get("confidence", 0) or 0),
            summary=str(response.get("summary", "")).strip(),
            findings=findings,
        )
