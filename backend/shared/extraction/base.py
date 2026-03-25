"""Base extractor contract."""

from abc import ABC, abstractmethod


class BaseDocumentExtractor(ABC):
    """Base class for document-type-specific extractors."""

    document_type: str
    model_name: str

    @abstractmethod
    def build_prompt(self) -> str:
        """Return the extraction prompt."""

    @abstractmethod
    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        """Return deterministic local mock data."""

    def extract(
        self,
        *,
        client,
        file_bytes: bytes,
        mime_type: str,
    ) -> dict:
        """Run the real extraction against Gemini."""

        return client.extract_json(
            model=self.model_name,
            prompt=self.build_prompt(),
            file_bytes=file_bytes,
            mime_type=mime_type,
        )
