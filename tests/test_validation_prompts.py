"""Tests for validation prompt builders."""

from backend.shared.validation_prompts import (
    build_cross_validation_llm_prompt,
    build_legal_assessment_prompt,
)


def test_cross_validation_prompt_contains_review_contract() -> None:
    prompt = build_cross_validation_llm_prompt().lower()

    assert "consistencia documental" in prompt
    assert "recommendation" in prompt
    assert "related_checks" in prompt
    assert "no inventes hechos" in prompt


def test_legal_assessment_prompt_contains_operational_decision_contract() -> None:
    prompt = build_legal_assessment_prompt().lower()

    assert "auditor legal senior" in prompt
    assert "approved" in prompt
    assert "requires_review" in prompt
    assert "rejected" in prompt
    assert "json" in prompt
