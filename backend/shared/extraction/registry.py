"""Extractor registry."""

from backend.shared.extraction.extractors import (
    CedulaExtractor,
    PlaceholderExtractor,
    RifExtractor,
)


class ExtractorRegistry:
    """Maps document types to extractor implementations."""

    def __init__(self) -> None:
        self._extractors = {
            "rif": RifExtractor(),
            "cedula": CedulaExtractor(),
            "acta_constitutiva": PlaceholderExtractor("acta_constitutiva"),
            "acta_mercantil": PlaceholderExtractor("acta_mercantil"),
            "certificado_emprendimiento": PlaceholderExtractor(
                "certificado_emprendimiento"
            ),
        }

    def get(self, document_type: str):
        return self._extractors[document_type]
