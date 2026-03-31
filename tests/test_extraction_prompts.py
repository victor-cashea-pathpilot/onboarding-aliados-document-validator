"""Tests for extraction prompt builders and extractor wiring."""

from backend.shared.extraction.extractors import (
    ActaConstitutivaExtractor,
    ActaMercantilExtractor,
    CedulaExtractor,
    CertificadoEmprendimientoExtractor,
    RifExtractor,
)


def test_rif_prompt_reuses_expected_schema() -> None:
    prompt = RifExtractor().build_prompt()

    assert "Número de RIF" in prompt
    assert "Fecha actual de referencia:" in prompt
    assert '"rif_number"' in prompt
    assert '"company_name"' in prompt
    assert "{{" not in prompt
    assert "$json" not in prompt


def test_cedula_prompt_reuses_expected_schema() -> None:
    prompt = CedulaExtractor().build_prompt()

    assert "Cédula de Identidad venezolana" in prompt
    assert "Fecha actual de referencia:" in prompt
    assert '"id_number"' in prompt
    assert '"first_name"' in prompt
    assert '"last_name"' in prompt
    assert "{{" not in prompt
    assert "$json" not in prompt


def test_complex_document_prompts_are_adapted_from_workflow() -> None:
    constitutiva_prompt = ActaConstitutivaExtractor().build_prompt()
    mercantil_prompt = ActaMercantilExtractor().build_prompt()
    emprendimiento_prompt = CertificadoEmprendimientoExtractor().build_prompt()

    assert "Due Diligence mercantil" in constitutiva_prompt
    assert "Hoy es" in constitutiva_prompt
    assert '"registro_mercantil"' in constitutiva_prompt
    assert "Firma Personal" in constitutiva_prompt
    assert "LC: supermercado, farmacia o educación" in constitutiva_prompt
    assert "{{" not in constitutiva_prompt

    assert "Actas de Asamblea" in mercantil_prompt
    assert "fecha de hoy" in mercantil_prompt
    assert '"company_validity"' in mercantil_prompt
    assert "fecha_vencimiento_junta" in mercantil_prompt
    assert "tipo_firma" not in mercantil_prompt
    assert "$now" not in mercantil_prompt

    assert "Registro Nacional de Emprendimientos" in emprendimiento_prompt
    assert "fecha actual" in emprendimiento_prompt.lower()
    assert '"document_type": "CERTIFICADO_EMPRENDIMIENTO"' in emprendimiento_prompt
    assert "duración legal es de 2 años" in emprendimiento_prompt
    assert "{{" not in emprendimiento_prompt
