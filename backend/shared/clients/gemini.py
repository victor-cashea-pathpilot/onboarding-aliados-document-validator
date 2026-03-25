"""Gemini client for Vertex AI extraction."""

import json
from functools import lru_cache

from backend.shared.config import get_settings


class GeminiExtractionClient:
    """Small wrapper over the Vertex AI SDK for JSON extraction."""

    def __init__(self) -> None:
        self.settings = get_settings()

        try:
            import vertexai
            from vertexai.generative_models import GenerationConfig
            from vertexai.generative_models import GenerativeModel
            from vertexai.generative_models import Part
        except ImportError as exc:
            raise RuntimeError(
                "google-cloud-aiplatform is not installed. Install backend/requirements.txt."
            ) from exc

        vertexai.init(
            project=self.settings.gcp_project_id,
            location=self.settings.gemini_location,
        )
        self._GenerationConfig = GenerationConfig
        self._GenerativeModel = GenerativeModel
        self._Part = Part

    def extract_json(
        self,
        *,
        model: str,
        prompt: str,
        file_bytes: bytes,
        mime_type: str,
    ) -> dict:
        """Generate structured JSON from a document."""

        model_client = self._GenerativeModel(model)
        part = self._Part.from_data(data=file_bytes, mime_type=mime_type)
        response = model_client.generate_content(
            [prompt, part],
            generation_config=self._GenerationConfig(
                response_mime_type="application/json",
                temperature=0,
            ),
        )
        return self._parse_json_response(response.text)

    def _parse_json_response(self, text: str) -> dict:
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned.removeprefix("```json").removesuffix("```").strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```").removesuffix("```").strip()
        return json.loads(cleaned)


@lru_cache(maxsize=1)
def get_gemini_client() -> GeminiExtractionClient:
    """Return cached Gemini client."""

    return GeminiExtractionClient()
