"""Cross-document deterministic validation over normalized data."""

from datetime import datetime, timezone
import unicodedata

from backend.shared.models.canonical import CanonicalMerchantSnapshot
from backend.shared.models.contracts import CrossValidationCheck


class CrossValidationService:
    """Runs rule-based checks over the canonical merchant snapshot."""

    def validate(self, snapshot: CanonicalMerchantSnapshot) -> list[CrossValidationCheck]:
        return [
            self._check_presence("HAS_RIF", snapshot.presence.get("rif", False), "Se recibió al menos un RIF.", "No se recibió RIF."),
            self._check_presence("HAS_CEDULA", snapshot.presence.get("cedula", False), "Se recibió al menos una cédula.", "No se recibió cédula."),
            self._check_presence(
                "HAS_CONSTITUTIVE_DOC",
                any(
                    snapshot.presence.get(key, False)
                    for key in (
                        "acta_constitutiva",
                        "acta_mercantil",
                        "certificado_emprendimiento",
                    )
                ),
                "Se recibió al menos un documento constitutivo.",
                "No se recibió documento constitutivo o certificado de emprendimiento.",
            ),
            self._company_name_match(snapshot),
            self._cedula_matches_legal_representative(snapshot),
            self._board_validity(snapshot),
            self._rif_validity(snapshot),
            self._signature_authority(snapshot),
        ]

    def _check_presence(self, code: str, condition: bool, ok_message: str, fail_message: str) -> CrossValidationCheck:
        return CrossValidationCheck(
            code=code,
            status="PASSED" if condition else "FAILED",
            message=ok_message if condition else fail_message,
        )

    def _company_name_match(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        rif_name = self._normalize_text(snapshot.rif_company_name)
        legal_name = self._normalize_text(snapshot.company_record.company_name)
        if not rif_name or not legal_name:
            return CrossValidationCheck(
                code="COMPANY_NAME_MATCH",
                status="SKIPPED",
                message="No hay suficientes datos para comparar la razón social entre RIF y documentos legales.",
            )
        return CrossValidationCheck(
            code="COMPANY_NAME_MATCH",
            status="PASSED" if rif_name == legal_name else "FAILED",
            message=(
                "La razón social del RIF coincide con la de los documentos legales."
                if rif_name == legal_name
                else "La razón social del RIF no coincide con la de los documentos legales."
            ),
        )

    def _cedula_matches_legal_representative(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        cedula = self._normalize_id(snapshot.primary_cedula_id)
        legal_ids = {
            self._normalize_id(rep.id_number)
            for rep in snapshot.representatives
            if rep.id_number
        }
        if not cedula or not legal_ids:
            return CrossValidationCheck(
                code="CEDULA_MATCHES_LEGAL_REPRESENTATIVE",
                status="SKIPPED",
                message="No hay suficientes datos para comparar la cédula con representantes legales.",
            )
        return CrossValidationCheck(
            code="CEDULA_MATCHES_LEGAL_REPRESENTATIVE",
            status="PASSED" if cedula in legal_ids else "FAILED",
            message=(
                "La cédula coincide con al menos un representante legal."
                if cedula in legal_ids
                else "La cédula no coincide con ningún representante legal."
            ),
        )

    def _board_validity(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        board_status = self._normalize_text(snapshot.company_record.board_status)
        if not board_status:
            return CrossValidationCheck(
                code="BOARD_VALIDITY",
                status="SKIPPED",
                message="No hay datos suficientes para evaluar vigencia de junta directiva.",
            )
        failed_tokens = ("vencida", "vencido", "n/a firma personal")
        status = "FAILED" if any(token in board_status for token in failed_tokens) else "PASSED"
        return CrossValidationCheck(
            code="BOARD_VALIDITY",
            status=status,
            message=(
                "La junta directiva figura como vigente."
                if status == "PASSED"
                else "La junta directiva figura como vencida o no vigente para operar."
            ),
        )

    def _rif_validity(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        expiration = self._parse_date(snapshot.rif_expiration_date)
        today = datetime.now(timezone.utc).date()
        if expiration is None:
            return CrossValidationCheck(
                code="RIF_VALIDITY",
                status="SKIPPED",
                message="No hay fecha de vencimiento suficiente para validar el RIF.",
            )
        return CrossValidationCheck(
            code="RIF_VALIDITY",
            status="PASSED" if expiration >= today else "FAILED",
            message=(
                "El RIF figura como vigente."
                if expiration >= today
                else "El RIF figura como vencido."
            ),
        )

    def _signature_authority(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        representatives = [rep for rep in snapshot.representatives if rep.signature_type or rep.authority_details]
        if not representatives:
            return CrossValidationCheck(
                code="SIGNATURE_AUTHORITY_PRESENT",
                status="SKIPPED",
                message="No hay suficientes datos para validar facultad de firma.",
            )
        valid = any(
            self._normalize_text(rep.signature_type) in {"separada", "conjunta"}
            or bool(rep.authority_details)
            for rep in representatives
        )
        return CrossValidationCheck(
            code="SIGNATURE_AUTHORITY_PRESENT",
            status="PASSED" if valid else "FAILED",
            message=(
                "Se encontró información de facultad de firma."
                if valid
                else "No se encontró información suficiente de facultad de firma."
            ),
        )

    def _normalize_text(self, value: str) -> str:
        without_accents = "".join(
            char
            for char in unicodedata.normalize("NFKD", value.lower())
            if not unicodedata.combining(char)
        )
        cleaned = (
            without_accents.replace(",", " ")
            .replace(".", " ")
            .replace("-", " ")
            .replace("/", " ")
            .replace("(", " ")
            .replace(")", " ")
        )
        return " ".join(cleaned.split())

    def _normalize_id(self, value: str) -> str:
        return "".join(ch for ch in value.lower() if ch.isalnum())

    def _parse_date(self, value: str):
        cleaned = value.strip()
        if not cleaned or cleaned == "NO_ENCONTRADO":
            return None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(cleaned, fmt).date()
            except ValueError:
                continue
        return None
