"""Gemini client for Vertex AI extraction via Google Gen AI SDK."""

import json
import time
from functools import lru_cache
from typing import Any

from backend.shared.config import get_settings
from backend.shared.logging import get_logger, log_event

logger = get_logger(__name__)


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

        return self.generate_json(
            model=model,
            contents=[
                prompt,
                self._types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            ],
        )

    def analyze_json(
        self,
        *,
        model: str,
        prompt: str,
        payload: dict[str, Any],
    ) -> dict:
        """Generate structured JSON from a prompt plus text payload."""

        return self.generate_json(
            model=model,
            contents=[
                prompt,
                json.dumps(payload, ensure_ascii=False, indent=2),
            ],
        )

    def generate_json(self, *, model: str, contents: list[Any]) -> dict:
        """Generate structured JSON from generic multimodal contents."""

        started_at = time.perf_counter()
        log_event(
            logger,
            "llm.request.started",
            model=model,
            content_parts=len(contents),
        )
        try:
            response = self._client.models.generate_content(
                model=model,
                contents=contents,
                config=self._types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            log_event(
                logger,
                "llm.request.completed",
                model=model,
                duration_ms=duration_ms,
            )
            return self._parse_json_response(response.text)
        except Exception as exc:  # noqa: BLE001
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            log_event(
                logger,
                "llm.request.failed",
                level=40,
                message="LLM request failed.",
                model=model,
                duration_ms=duration_ms,
                error=str(exc),
                exc_info=exc,
            )
            raise

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
