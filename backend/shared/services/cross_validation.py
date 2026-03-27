"""Cross-document deterministic validation over normalized data."""

from __future__ import annotations

from datetime import datetime, timezone
import unicodedata

from backend.shared.models.canonical import (
    CanonicalMerchantSnapshot,
    CanonicalRepresentative,
)
from backend.shared.models.contracts import CrossValidationCheck


class CrossValidationService:
    """Runs rule-based checks over the canonical merchant snapshot."""

    def validate(self, snapshot: CanonicalMerchantSnapshot) -> list[CrossValidationCheck]:
        return [
            self._legal_mode_detected(snapshot),
            self._check_presence(
                "HAS_RIF",
                snapshot.presence.get("rif", False),
                "Se recibió al menos un RIF.",
                "No se recibió RIF.",
            ),
            self._check_presence(
                "HAS_CEDULA",
                snapshot.presence.get("cedula", False),
                "Se recibió al menos una cédula.",
                "No se recibió cédula.",
            ),
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
            self._corporate_document_precedence(snapshot),
            self._company_name_match(snapshot),
            self._cedula_matches_legal_representative(snapshot),
            self._board_validity(snapshot),
            self._rif_validity(snapshot),
            self._signature_authority(snapshot),
            self._signature_scheme_supported(snapshot),
        ]

    def _check_presence(
        self,
        code: str,
        condition: bool,
        ok_message: str,
        fail_message: str,
    ) -> CrossValidationCheck:
        return CrossValidationCheck(
            code=code,
            status="PASSED" if condition else "FAILED",
            message=ok_message if condition else fail_message,
        )

    def _legal_mode_detected(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        legal_mode = self._effective_legal_mode(snapshot)
        if legal_mode == "unknown":
            return CrossValidationCheck(
                code="LEGAL_MODE_DETECTED",
                status="FAILED",
                message="No fue posible inferir el modo legal del expediente.",
            )
        return CrossValidationCheck(
            code="LEGAL_MODE_DETECTED",
            status="PASSED",
            message=f"Se detectó modo legal {legal_mode}.",
        )

    def _corporate_document_precedence(
        self,
        snapshot: CanonicalMerchantSnapshot,
    ) -> CrossValidationCheck:
        if self._effective_legal_mode(snapshot) == "emprendimiento":
            return CrossValidationCheck(
                code="CORPORATE_DOCUMENT_PRECEDENCE",
                status="SKIPPED",
                message="La precedencia corporativa no aplica a certificados de emprendimiento.",
            )

        if not (
            snapshot.presence.get("acta_constitutiva")
            or snapshot.presence.get("acta_mercantil")
        ):
            return CrossValidationCheck(
                code="CORPORATE_DOCUMENT_PRECEDENCE",
                status="SKIPPED",
                message="No hay suficientes documentos corporativos para evaluar precedencia.",
            )

        source_type = snapshot.company_record.source_document_type
        source_date = self._parse_date(snapshot.company_record.source_document_date)
        if not source_type:
            return CrossValidationCheck(
                code="CORPORATE_DOCUMENT_PRECEDENCE",
                status="FAILED",
                message="No fue posible determinar el documento corporativo vigente.",
            )

        merc_exists = snapshot.presence.get("acta_mercantil", False)
        const_exists = snapshot.presence.get("acta_constitutiva", False)
        if merc_exists and const_exists and source_type == "acta_constitutiva":
            latest_rep_date = max(
                (
                    self._parse_date(rep.source_document_date)
                    for rep in snapshot.representatives
                    if rep.source_document_type == "acta_mercantil"
                ),
                default=None,
            )
            if latest_rep_date and source_date and latest_rep_date > source_date:
                return CrossValidationCheck(
                    code="CORPORATE_DOCUMENT_PRECEDENCE",
                    status="FAILED",
                    message="Existe evidencia mercantil posterior que no quedó como fuente vigente.",
                )

        return CrossValidationCheck(
            code="CORPORATE_DOCUMENT_PRECEDENCE",
            status="PASSED",
            message="La fuente corporativa vigente fue consolidada con la precedencia esperada.",
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
        names_match = self._names_match(snapshot, rif_name, legal_name)
        return CrossValidationCheck(
            code="COMPANY_NAME_MATCH",
            status="PASSED" if names_match else "FAILED",
            message=(
                "La razón social del RIF coincide con la de los documentos legales."
                if names_match
                else "La razón social del RIF no coincide con la de los documentos legales."
            ),
        )

    def _cedula_matches_legal_representative(
        self,
        snapshot: CanonicalMerchantSnapshot,
    ) -> CrossValidationCheck:
        cedula = self._normalize_id(snapshot.primary_cedula_id)
        active_representatives = self._active_representatives(snapshot)
        legal_ids = {
            self._normalize_id(rep.id_number)
            for rep in active_representatives
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
                "La cédula coincide con al menos un representante legal vigente."
                if cedula in legal_ids
                else "La cédula no coincide con ningún representante legal vigente."
            ),
        )

    def _board_validity(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        if self._effective_legal_mode(snapshot) == "firma_personal":
            return CrossValidationCheck(
                code="BOARD_VALIDITY",
                status="PASSED",
                message="La vigencia de junta no aplica para firma personal.",
            )

        board_status = self._normalize_text(snapshot.company_record.board_status)
        if not board_status:
            return CrossValidationCheck(
                code="BOARD_VALIDITY",
                status="SKIPPED",
                message="No hay datos suficientes para evaluar vigencia de junta directiva.",
            )
        failed_tokens = ("vencida", "vencido")
        status = "FAILED" if any(token in board_status for token in failed_tokens) else "PASSED"
        return CrossValidationCheck(
            code="BOARD_VALIDITY",
            status=status,
            message=(
                "La junta directiva figura como vigente o no aplica."
                if status == "PASSED"
                else "La junta directiva figura como vencida o no vigente para operar."
            ),
        )

    def _rif_validity(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        expiration = self._parse_date(snapshot.rif_expiration_date)
        if expiration is None:
            return CrossValidationCheck(
                code="RIF_VALIDITY",
                status="SKIPPED",
                message="No hay fecha suficiente para evaluar vigencia del RIF.",
            )
        today = datetime.now(timezone.utc).date()
        is_valid = expiration >= today
        return CrossValidationCheck(
            code="RIF_VALIDITY",
            status="PASSED" if is_valid else "FAILED",
            message=(
                "El RIF figura vigente."
                if is_valid
                else "El RIF figura vencido."
            ),
        )

    def _signature_authority(self, snapshot: CanonicalMerchantSnapshot) -> CrossValidationCheck:
        representatives = [
            rep
            for rep in self._active_representatives(snapshot)
            if rep.signature_type or rep.authority_details or rep.role
        ]
        if not representatives:
            return CrossValidationCheck(
                code="SIGNATURE_AUTHORITY_PRESENT",
                status="SKIPPED",
                message="No hay suficientes datos para validar facultad de firma.",
            )

        if self._effective_legal_mode(snapshot) == "firma_personal":
            owner_matches = any(
                self._normalize_id(rep.id_number) == self._normalize_id(snapshot.primary_cedula_id)
                for rep in representatives
                if rep.id_number and snapshot.primary_cedula_id
            )
            valid = owner_matches or any(rep.authority_details for rep in representatives)
        else:
            valid = any(
                self._normalize_text(rep.signature_type) in {"separada", "conjunta"}
                or bool(rep.authority_details)
                for rep in representatives
            )

        return CrossValidationCheck(
            code="SIGNATURE_AUTHORITY_PRESENT",
            status="PASSED" if valid else "FAILED",
            message=(
                "Se encontró información suficiente de facultad de firma."
                if valid
                else "No se encontró información suficiente de facultad de firma."
            ),
        )

    def _signature_scheme_supported(
        self,
        snapshot: CanonicalMerchantSnapshot,
    ) -> CrossValidationCheck:
        representatives = self._active_representatives(snapshot)
        if not representatives:
            return CrossValidationCheck(
                code="SIGNATURE_SCHEME_SUPPORTED",
                status="SKIPPED",
                message="No hay suficientes representantes vigentes para validar el esquema de firma.",
            )

        signature_type = self._normalize_text(representatives[0].signature_type)
        if not signature_type:
            return CrossValidationCheck(
                code="SIGNATURE_SCHEME_SUPPORTED",
                status="SKIPPED",
                message="No hay tipo de firma explícito para validar el esquema de firma.",
            )

        supported_representatives = [
            rep
            for rep in representatives
            if self._signature_probability(rep.signature_validity_probability) >= 70
            or bool(rep.id_number)
        ]
        if signature_type == "conjunta":
            valid = len(supported_representatives) >= 2
            message = (
                "La firma conjunta está soportada por al menos dos representantes vigentes."
                if valid
                else "La firma conjunta no queda soportada por suficientes representantes vigentes."
            )
            return CrossValidationCheck(
                code="SIGNATURE_SCHEME_SUPPORTED",
                status="PASSED" if valid else "FAILED",
                message=message,
            )

        if signature_type == "separada":
            valid = len(supported_representatives) >= 1
            return CrossValidationCheck(
                code="SIGNATURE_SCHEME_SUPPORTED",
                status="PASSED" if valid else "FAILED",
                message=(
                    "La firma separada está soportada por representación vigente."
                    if valid
                    else "La firma separada no tiene soporte suficiente en la representación vigente."
                ),
            )

        return CrossValidationCheck(
            code="SIGNATURE_SCHEME_SUPPORTED",
            status="SKIPPED",
            message="El tipo de firma no fue reconocido para validar soporte.",
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

    def _names_match(
        self,
        snapshot: CanonicalMerchantSnapshot,
        rif_name: str,
        legal_name: str,
    ) -> bool:
        if rif_name == legal_name:
            return True

        rif_tokens = self._token_set(rif_name)
        legal_tokens = self._token_set(legal_name)
        if rif_tokens and rif_tokens == legal_tokens:
            return True

        if self._is_identity_based_legal_mode(snapshot):
            representative_tokens = {
                token
                for rep in snapshot.representatives
                for token in self._token_set(self._normalize_text(rep.full_name))
            }
            if rif_tokens and representative_tokens and rif_tokens == representative_tokens:
                return True

        return False

    def _is_identity_based_legal_mode(self, snapshot: CanonicalMerchantSnapshot) -> bool:
        return self._effective_legal_mode(snapshot) in {"firma_personal", "emprendimiento"}

    def _effective_legal_mode(self, snapshot: CanonicalMerchantSnapshot) -> str:
        if snapshot.legal_mode != "unknown":
            return snapshot.legal_mode

        if snapshot.company_record.source_document_type == "certificado_emprendimiento" or snapshot.presence.get(
            "certificado_emprendimiento",
            False,
        ):
            return "emprendimiento"

        board_status = self._normalize_text(snapshot.company_record.board_status)
        company_name = self._normalize_text(snapshot.company_record.company_name)
        if "firma personal" in board_status or " f p " in f" {company_name} ":
            return "firma_personal"

        if any(
            keyword in self._normalize_text(rep.role)
            for rep in snapshot.representatives
            for keyword in ("propietaria", "propietario", "titular")
        ):
            return "firma_personal"

        if snapshot.company_record.company_name:
            return "sociedad_mercantil"

        return "unknown"

    def _token_set(self, value: str) -> set[str]:
        stopwords = {
            "emprendimiento",
            "ca",
            "c",
            "a",
            "srl",
            "sa",
            "compania",
            "cia",
            "fp",
            "f",
            "p",
            "las",
            "los",
            "de",
            "del",
            "la",
            "el",
        }
        return {
            token
            for token in self._normalize_text(value).split()
            if token and token not in stopwords and not token.isdigit()
        }

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

    def _active_representatives(
        self,
        snapshot: CanonicalMerchantSnapshot,
    ) -> list[CanonicalRepresentative]:
        if not snapshot.representatives:
            return []

        dated_representatives = [
            rep
            for rep in snapshot.representatives
            if self._parse_date(rep.source_document_date or "")
        ]
        if not dated_representatives:
            return snapshot.representatives

        latest_date = max(
            self._parse_date(rep.source_document_date)
            for rep in dated_representatives
        )
        return [
            rep
            for rep in snapshot.representatives
            if self._parse_date(rep.source_document_date or "") == latest_date
        ]

    def _signature_probability(self, raw_value: str) -> int:
        normalized = self._normalize_text(raw_value)
        if not normalized:
            return 0
        if normalized.isdigit():
            return int(normalized)
        if normalized in {"alta", "alto"}:
            return 90
        if normalized in {"media", "medio"}:
            return 60
        if normalized in {"baja", "bajo"}:
            return 30
        return 0
