"""Extractor registry."""

from backend.shared.extraction.extractors import (
    ActaConstitutivaExtractor,
    ActaMercantilExtractor,
    CedulaExtractor,
    CertificadoEmprendimientoExtractor,
    RifExtractor,
)


class ExtractorRegistry:
    """Maps document types to extractor implementations."""

    def __init__(self) -> None:
        self._extractors = {
            "rif": RifExtractor(),
            "cedula": CedulaExtractor(),
            "acta_constitutiva": ActaConstitutivaExtractor(),
            "acta_mercantil": ActaMercantilExtractor(),
            "certificado_emprendimiento": CertificadoEmprendimientoExtractor(),
        }

    def get(self, document_type: str):
        return self._extractors[document_type]
