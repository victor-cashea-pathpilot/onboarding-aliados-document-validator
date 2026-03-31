"""Tests for validation prompt builders."""

from backend.shared.validation_prompts import (
    build_cross_validation_llm_prompt,
    build_legal_assessment_prompt,
)


def test_cross_validation_prompt_contains_review_contract() -> None:
    prompt = build_cross_validation_llm_prompt("sociedad_mercantil").lower()

    assert "consistencia documental" in prompt
    assert "fecha actual de referencia" in prompt
    assert "sociedades mercantiles venezolanas" in prompt
    assert "junta directiva" in prompt
    assert "recommendation" in prompt
    assert "related_checks" in prompt
    assert "no inventes hechos" in prompt


def test_legal_assessment_prompt_contains_operational_decision_contract() -> None:
    prompt = build_legal_assessment_prompt("firma_personal").lower()

    assert "auditor senior de cumplimiento legal" in prompt
    assert "fecha actual de referencia" in prompt
    assert "firma personal" in prompt
    assert "approved" in prompt
    assert "requires_review" in prompt
    assert "rejected" in prompt
    assert "json" in prompt


def test_emprendimiento_prompts_are_specialized() -> None:
    cross_prompt = build_cross_validation_llm_prompt("emprendimiento").lower()
    legal_prompt = build_legal_assessment_prompt("emprendimiento").lower()

    assert "ley de fomento al emprendimiento" in cross_prompt
    assert "certificado de emprendimiento" in cross_prompt
    assert "fecha actual de referencia" in cross_prompt
    assert "junta directiva como no aplicable" in legal_prompt
    assert "fecha actual de referencia" in legal_prompt
