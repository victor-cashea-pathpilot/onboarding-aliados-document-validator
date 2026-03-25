"""Document-type-specific extractors."""

from backend.shared.config import get_settings
from backend.shared.extraction.base import BaseDocumentExtractor


class RifExtractor(BaseDocumentExtractor):
    """RIF extractor."""

    document_type = "rif"

    def __init__(self) -> None:
        self.model_name = get_settings().gemini_model_simple

    def build_prompt(self) -> str:
        return (
            "Analiza este RIF venezolano y responde SOLO un JSON válido con estas claves: "
            "rif_number, company_name, fiscal_address, expiration_date. "
            "Si no encuentras un valor, usa cadena vacía."
        )

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        return {
            "rif_number": "J-12345678-0",
            "company_name": "ALIADO MOCK RIF",
            "fiscal_address": "Direccion fiscal mock",
            "expiration_date": "2026-12-31",
            "mock_source_url": source_url,
            "mock_document_id": document_id,
        }


class CedulaExtractor(BaseDocumentExtractor):
    """Cedula extractor."""

    document_type = "cedula"

    def __init__(self) -> None:
        self.model_name = get_settings().gemini_model_simple

    def build_prompt(self) -> str:
        return (
            "Analiza esta cédula de identidad venezolana y responde SOLO un JSON válido "
            "con estas claves: id_number, first_name, last_name. "
            "Si no encuentras un valor, usa cadena vacía."
        )

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        return {
            "id_number": "V-12345678",
            "first_name": "NOMBRE",
            "last_name": "APELLIDO",
            "mock_source_url": source_url,
            "mock_document_id": document_id,
        }


class PlaceholderExtractor(BaseDocumentExtractor):
    """Placeholder extractor for document types not implemented yet."""

    def __init__(self, document_type: str) -> None:
        self.document_type = document_type
        self.model_name = get_settings().gemini_model_complex

    def build_prompt(self) -> str:
        return (
            f"Analiza este documento de tipo {self.document_type} y responde SOLO un JSON válido "
            "con un resumen estructurado del documento."
        )

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        return {
            "placeholder": True,
            "document_type": self.document_type,
            "summary": f"Mock extraction for {self.document_type}",
            "mock_source_url": source_url,
            "mock_document_id": document_id,
        }
