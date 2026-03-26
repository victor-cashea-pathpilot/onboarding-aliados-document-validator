"""Gemini client for Vertex AI extraction via Google Gen AI SDK."""

import json
from functools import lru_cache

from backend.shared.config import get_settings


class GeminiExtractionClient:
    """Small wrapper over the Google Gen AI SDK for JSON extraction."""

    def __init__(self) -> None:
        self.settings = get_settings()

        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            raise RuntimeError(
                "google-genai is not installed. Install backend/requirements.txt."
            ) from exc

        self._client = genai.Client(
            vertexai=True,
            project=self.settings.gcp_project_id,
            location=self.settings.gemini_location,
        )
        self._types = types

    def extract_json(
        self,
        *,
        model: str,
        prompt: str,
        file_bytes: bytes,
        mime_type: str,
    ) -> dict:
        """Generate structured JSON from a document."""

        response = self._client.models.generate_content(
            model=model,
            contents=[
                prompt,
                self._types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            ],
            config=self._types.GenerateContentConfig(
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
