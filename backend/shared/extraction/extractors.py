"""Document-type-specific extractors."""

from backend.shared.config import get_settings
from backend.shared.extraction.base import BaseDocumentExtractor
from backend.shared.extraction.prompts import (
    build_acta_constitutiva_prompt,
    build_acta_mercantil_prompt,
    build_cedula_prompt,
    build_certificado_emprendimiento_prompt,
    build_rif_prompt,
)


class RifExtractor(BaseDocumentExtractor):
    """RIF extractor."""

    document_type = "rif"

    def __init__(self) -> None:
        self.model_name = get_settings().gemini_model_simple

    def build_prompt(self) -> str:
        return build_rif_prompt()

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
        return build_cedula_prompt()

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        return {
            "id_number": "V-12345678",
            "first_name": "NOMBRE",
            "last_name": "APELLIDO",
            "mock_source_url": source_url,
            "mock_document_id": document_id,
        }


class ActaConstitutivaExtractor(BaseDocumentExtractor):
    """Acta constitutiva extractor."""

    document_type = "acta_constitutiva"

    def __init__(self) -> None:
        self.model_name = get_settings().gemini_model_complex

    def build_prompt(self) -> str:
        return build_acta_constitutiva_prompt()

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        return {
            "document_type": self.document_type,
            "razon_social": "FREDLOU STILO Y BELLEZA, C.A.",
            "registro_mercantil": {
                "nombre_registro": "Registro Mercantil Primero",
                "estado_registro": "Distrito Capital",
                "numero": "12",
                "tomo": "45-A",
                "fecha_registro": "05/03/2018",
                "fecha_dia": "05",
                "fecha_mes": "03",
                "fecha_ano": "2018",
            },
            "company_validity": {
                "duration_years": "99",
                "expiration_date": "05/03/2117",
                "status": "VIGENTE",
            },
            "business_classification": {
                "business_summary": "Comercializacion de productos de belleza.",
                "line_code": "LP",
                "justification": "No encaja en LC, LCR o LCB.",
            },
            "corporate_structure": {
                "shareholders": "Freddy Contreras Diaz",
                "board": {
                    "members_and_roles": "Freddy Contreras Diaz (Presidente)",
                    "expiration_date": "05/03/2028",
                    "status": "VIGENTE",
                    "statutory_term": "10 anos",
                },
                "legal_representative": {
                    "signature_type": "SEPARADA",
                    "signature_quote": "La administracion y firma corresponde al Presidente.",
                    "authority_details": "Facultades generales de administracion y disposicion.",
                    "representatives": [
                        {
                            "full_name": "FREDDY RAMON CONTRERAS DIAZ",
                            "id_number": "V-12.048.047",
                            "specific_role": "Presidente",
                            "signature_validity_probability": "100",
                        }
                    ],
                },
            },
            "locations": {
                "fiscal_address": "Direccion fiscal mock",
                "store_addresses": "",
            },
            "mock_source_url": source_url,
            "mock_document_id": document_id,
        }


class ActaMercantilExtractor(BaseDocumentExtractor):
    """Acta mercantil extractor."""

    document_type = "acta_mercantil"

    def __init__(self) -> None:
        self.model_name = get_settings().gemini_model_complex

    def build_prompt(self) -> str:
        return build_acta_mercantil_prompt()

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        return {
            "document_type": self.document_type,
            "razon_social": "FREDLOU STILO Y BELLEZA, C.A.",
            "registro_mercantil": {
                "nombre_registro": "Registro Mercantil Segundo",
                "estado_registro": "Distrito Capital",
                "numero": "23",
                "tomo": "88-A",
                "fecha_registro": "12/06/2024",
                "fecha_dia": "12",
                "fecha_mes": "06",
                "fecha_ano": "2024",
            },
            "corporate_structure": {
                "shareholders": "Accionistas presentes en asamblea",
                "relevant_changes": "Ratificacion de directiva y facultades de firma.",
                "board": {
                    "members_and_roles": "Freddy Contreras Diaz (Presidente)",
                    "expiration_date": "12/06/2029",
                    "status": "VIGENTE",
                    "statutory_term": "5 anos",
                },
                "legal_representative": {
                    "signature_type": "SEPARADA",
                    "signature_quote": "El Presidente podra firmar separadamente.",
                    "authority_details": "Facultades de representacion judicial y extrajudicial.",
                    "representatives": [
                        {
                            "full_name": "FREDDY RAMON CONTRERAS DIAZ",
                            "id_number": "V-12.048.047",
                            "specific_role": "Presidente",
                            "signature_validity_probability": "100",
                        }
                    ],
                },
            },
            "company_validity": {
                "statutory_duration_years": "99",
                "expiration_date": "05/03/2117",
                "status": "VIGENTE",
                "validity_observation": "Compania vigente segun clausula de duracion.",
            },
            "business_classification": {
                "business_summary": "Actividades comerciales varias.",
                "line_code": "LP",
            },
            "locations": {
                "fiscal_address": "Direccion fiscal mock",
                "store_addresses": "",
            },
            "mock_source_url": source_url,
            "mock_document_id": document_id,
        }


class CertificadoEmprendimientoExtractor(BaseDocumentExtractor):
    """Certificado de emprendimiento extractor."""

    document_type = "certificado_emprendimiento"

    def __init__(self) -> None:
        self.model_name = get_settings().gemini_model_complex

    def build_prompt(self) -> str:
        return build_certificado_emprendimiento_prompt()

    def mock_extract(self, *, document_id: str | None, source_url: str) -> dict:
        return {
            "document_type": self.document_type,
            "razon_social": "EMPRENDIMIENTO MOCK",
            "registro_mercantil": {
                "nombre_registro": "Registro Nacional de Emprendimientos",
                "estado_registro": "",
                "numero": "RNE-001",
                "tomo": "N/A",
                "fecha_registro": "10/01/2025",
                "fecha_dia": "10",
                "fecha_mes": "01",
                "fecha_ano": "2025",
            },
            "company_validity": {
                "duration_years": "2",
                "calculated_expiration_date": "10/01/2027",
                "current_status": "VIGENTE",
            },
            "business_classification": {
                "business_summary": "Venta de productos varios.",
                "line_code": "LP",
                "justification": "No encaja en otras lineas restringidas.",
            },
            "corporate_structure": {
                "shareholders": "Unipersonal",
                "relevant_changes": "",
                "legal_representative": {
                    "full_name": "REPRESENTANTE MOCK",
                    "id_number": "V-12.345.678",
                    "current_role": "Responsable",
                    "signature_type": "SEPARADA",
                    "signature_quote": "Responsable del emprendimiento.",
                    "authority_details": "Facultades de firma unipersonal.",
                    "signature_validity_probability": "100",
                    "board_status": "VIGENTE",
                },
            },
            "locations": {
                "fiscal_address": "Direccion fiscal mock",
                "store_addresses": "",
            },
            "mock_source_url": source_url,
            "mock_document_id": document_id,
        }
