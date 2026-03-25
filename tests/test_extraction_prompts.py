"""Tests for extraction prompt builders and extractor wiring."""

from backend.shared.extraction.extractors import (
    CedulaExtractor,
    PlaceholderExtractor,
    RifExtractor,
)


def test_rif_prompt_reuses_expected_schema() -> None:
    prompt = RifExtractor().build_prompt()

    assert "Número de RIF" in prompt
    assert '"rif_number"' in prompt
    assert '"company_name"' in prompt
    assert "{{" not in prompt
    assert "$json" not in prompt


def test_cedula_prompt_reuses_expected_schema() -> None:
    prompt = CedulaExtractor().build_prompt()

    assert "Cédula de Identidad venezolana" in prompt
    assert '"id_number"' in prompt
    assert '"first_name"' in prompt
    assert '"last_name"' in prompt
    assert "{{" not in prompt
    assert "$json" not in prompt


def test_complex_document_prompts_are_adapted_from_workflow() -> None:
    constitutiva_prompt = PlaceholderExtractor("acta_constitutiva").build_prompt()
    mercantil_prompt = PlaceholderExtractor("acta_mercantil").build_prompt()
    emprendimiento_prompt = PlaceholderExtractor(
        "certificado_emprendimiento"
    ).build_prompt()

    assert "Due Diligence mercantil" in constitutiva_prompt
    assert '"registro_mercantil"' in constitutiva_prompt
    assert "{{" not in constitutiva_prompt

    assert "Actas de Asamblea" in mercantil_prompt
    assert '"company_validity"' in mercantil_prompt
    assert "$now" not in mercantil_prompt

    assert "Registro Nacional de Emprendimientos" in emprendimiento_prompt
    assert '"document_type": "CERTIFICADO_EMPRENDIMIENTO"' in emprendimiento_prompt
    assert "{{" not in emprendimiento_prompt
