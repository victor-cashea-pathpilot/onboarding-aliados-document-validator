"""Extraction-level evals for extractor contracts and prompt wiring."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.shared.config import get_settings
from backend.shared.extraction.registry import ExtractorRegistry


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "extraction_evals"


class FakeGeminiClient:
    def __init__(self, response: dict) -> None:
        self.response = response
        self.calls: list[dict] = []

    def extract_json(self, *, model: str, prompt: str, file_bytes: bytes, mime_type: str) -> dict:
        self.calls.append(
            {
                "model": model,
                "prompt": prompt,
                "file_bytes": file_bytes,
                "mime_type": mime_type,
            }
        )
        return self.response


def _fixture_paths() -> list[Path]:
    return sorted(FIXTURES_DIR.glob("*.json"))


@pytest.mark.parametrize("fixture_path", _fixture_paths(), ids=lambda path: path.stem)
def test_extractor_fixture_contract(monkeypatch, fixture_path: Path) -> None:
    fixture = json.loads(fixture_path.read_text())

    monkeypatch.setenv("GEMINI_MODEL_SIMPLE", "gemini-test-simple")
    monkeypatch.setenv("GEMINI_MODEL_COMPLEX", "gemini-test-complex")

    get_settings.cache_clear()
    registry = ExtractorRegistry()
    extractor = registry.get(fixture["document_type"])
    client = FakeGeminiClient(fixture["client_response"])
    result = extractor.extract(
        client=client,
        file_bytes=b"fake-bytes",
        mime_type="application/pdf",
    )

    assert result == fixture["client_response"]
    assert len(client.calls) == 1

    call = client.calls[0]
    assert call["mime_type"] == "application/pdf"
    assert call["file_bytes"] == b"fake-bytes"

    expected_model = (
        "gemini-test-simple"
        if fixture["expected_model_env_key"] == "GEMINI_MODEL_SIMPLE"
        else "gemini-test-complex"
    )
    assert call["model"] == expected_model

    prompt_lower = call["prompt"].lower()
    for token in fixture["expected_prompt_contains"]:
        assert token.lower() in prompt_lower

    get_settings.cache_clear()
