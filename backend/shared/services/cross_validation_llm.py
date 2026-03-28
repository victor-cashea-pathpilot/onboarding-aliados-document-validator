"""LLM-assisted cross-validation over the canonical snapshot."""

from __future__ import annotations

from backend.shared.clients.gemini import get_gemini_client
from backend.shared.config import get_settings
from backend.shared.logging import get_logger, log_event
from backend.shared.models.canonical import CanonicalMerchantSnapshot
from backend.shared.models.contracts import (
    CrossValidationCheck,
    CrossValidationFinding,
    LLMValidationReview,
)
from backend.shared.validation_prompts import build_cross_validation_llm_prompt

logger = get_logger(__name__)


class CrossValidationLLMService:
    """Contextual review layer on top of deterministic checks."""

    def __init__(self, *, mock_mode: bool, gemini_client=None) -> None:
        self.settings = get_settings()
        self.mock_mode = mock_mode
        self.gemini_client = gemini_client
        self.model_name = self.settings.gemini_model_complex

    def review(
        self,
        *,
        snapshot: CanonicalMerchantSnapshot,
        checks: list[CrossValidationCheck],
    ) -> LLMValidationReview:
        if not self.settings.enable_llm_cross_validation:
            return LLMValidationReview(
                recommendation="APPROVED",
                confidence=0,
                summary="La validación cruzada asistida por LLM está deshabilitada.",
                findings=[],
            )

        if self.mock_mode:
            review = self._mock_review(snapshot=snapshot, checks=checks)
            log_event(
                logger,
                "cross_validation.llm.completed",
                mode="mock",
                legal_mode=snapshot.legal_mode,
                recommendation=review.recommendation,
                confidence=review.confidence,
            )
            return review

        client = self.gemini_client or get_gemini_client()
        response = client.analyze_json(
            model=self.model_name,
            prompt=build_cross_validation_llm_prompt(),
            payload=self._build_payload(snapshot=snapshot, checks=checks),
        )
        review = self._parse_response(response, source="llm_cross_validation")
        log_event(
            logger,
            "cross_validation.llm.completed",
            mode="vertex_ai",
            model=self.model_name,
            legal_mode=snapshot.legal_mode,
            recommendation=review.recommendation,
            confidence=review.confidence,
        )
        return review

    def _mock_review(
        self,
        *,
        snapshot: CanonicalMerchantSnapshot,
        checks: list[CrossValidationCheck],
    ) -> LLMValidationReview:
        failed_codes = {check.code for check in checks if check.status == "FAILED"}
        findings: list[CrossValidationFinding] = []

        if snapshot.legal_mode == "unknown":
            findings.append(
                CrossValidationFinding(
                    source="llm_cross_validation",
                    severity="WARNING",
                    code="LEGAL_MODE_UNCLEAR",
                    message="El expediente no permite inferir con claridad el modo legal.",
                    related_checks=["LEGAL_MODE_DETECTED"],
                )
            )

        if "COMPANY_NAME_MATCH" in failed_codes:
            findings.append(
                CrossValidationFinding(
                    source="llm_cross_validation",
                    severity="CRITICAL",
                    code="MATERIAL_IDENTITY_MISMATCH",
                    message="La identidad comercial o del titular no coincide materialmente entre documentos.",
                    related_checks=["COMPANY_NAME_MATCH"],
                )
            )

        if "SIGNATURE_SCHEME_SUPPORTED" in failed_codes:
            findings.append(
                CrossValidationFinding(
                    source="llm_cross_validation",
                    severity="CRITICAL",
                    code="SIGNATURE_SUPPORT_GAP",
                    message="El esquema de firma declarado no queda suficientemente soportado por la representación vigente.",
                    related_checks=["SIGNATURE_SCHEME_SUPPORTED"],
                )
            )

        if "CEDULA_MATCHES_LEGAL_REPRESENTATIVE" in failed_codes:
            findings.append(
                CrossValidationFinding(
                    source="llm_cross_validation",
                    severity="WARNING",
                    code="REPRESENTATIVE_ID_MISMATCH",
                    message="La cédula principal no coincide con la representación vigente que surge del expediente.",
                    related_checks=["CEDULA_MATCHES_LEGAL_REPRESENTATIVE"],
                )
            )

        if failed_codes and not findings:
            findings.append(
                CrossValidationFinding(
                    source="llm_cross_validation",
                    severity="WARNING",
                    code="CROSS_VALIDATION_INCONSISTENCY",
                    message="Existen hallazgos determinísticos que requieren una revisión contextual adicional.",
                    related_checks=sorted(failed_codes),
                )
            )

        if findings:
            return LLMValidationReview(
                recommendation="REQUIRES_REVIEW",
                confidence=78,
                summary="La revisión contextual detectó inconsistencias materiales o vacíos de soporte jurídico.",
                findings=findings,
            )

        return LLMValidationReview(
            recommendation="APPROVED",
            confidence=88,
            summary="La revisión contextual no detectó contradicciones materiales adicionales a las reglas duras.",
            findings=[
                CrossValidationFinding(
                    source="llm_cross_validation",
                    severity="INFO",
                    code="CONTEXTUAL_REVIEW_OK",
                    message="El snapshot y los checks determinísticos son coherentes para el modo legal detectado.",
                    related_checks=["LEGAL_MODE_DETECTED"],
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
                code=item.get("code", "LLM_VALIDATION_NOTE"),
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
