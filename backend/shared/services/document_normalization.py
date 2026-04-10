"""Normalization layer that maps extracted document data into one canonical snapshot."""

from __future__ import annotations

from datetime import UTC, datetime

from backend.shared.models.canonical import (
    CanonicalCompanyRecord,
    CanonicalMerchantSnapshot,
    CanonicalRepresentative,
)
from backend.shared.models.contracts import DocumentsResult


class DocumentNormalizationService:
    """Build a canonical merchant snapshot from heterogeneous extraction outputs."""

    def normalize(self, *, merchant_id: str, documents: DocumentsResult) -> CanonicalMerchantSnapshot:
        snapshot = CanonicalMerchantSnapshot(
            merchant_id=merchant_id,
            presence={
                "rif": bool(documents.rif),
                "cedula": bool(documents.cedula),
                "acta_constitutiva": bool(documents.acta_constitutiva),
                "acta_mercantil": bool(documents.acta_mercantil),
                "certificado_emprendimiento": bool(documents.certificado_emprendimiento),
            },
        )

        self._apply_rif(snapshot, documents)
        self._apply_cedula(snapshot, documents)
        self._apply_company_documents(snapshot, documents)
        snapshot.legal_mode = self._derive_legal_mode(snapshot)
        snapshot.normalization_status = (
            "complete"
            if snapshot.rif_number
            and snapshot.primary_cedula_id
            and snapshot.company_record.company_name
            else "partial"
        )
        snapshot.source_document_types = sorted(
            {
                *(
                    rep.source_document_type
                    for rep in snapshot.representatives
                    if rep.source_document_type
                ),
                snapshot.company_record.source_document_type,
                *(
                    doc_type
                    for doc_type, present in snapshot.presence.items()
                    if present
                ),
            }
            - {""}
        )
        return snapshot

    def _apply_rif(self, snapshot: CanonicalMerchantSnapshot, documents: DocumentsResult) -> None:
        approved = self._approved_items(documents.rif)
        if not approved:
            return

        item = approved[0]
        fields = item.extracted_data.get("extracted_fields", {})
        snapshot.rif_number = str(fields.get("rif_number", "")).strip()
        snapshot.rif_company_name = str(fields.get("company_name", "")).strip()
        snapshot.rif_expiration_date = str(fields.get("expiration_date", "")).strip()
        snapshot.rif_fiscal_address = str(fields.get("fiscal_address", "")).strip()

    def _apply_cedula(self, snapshot: CanonicalMerchantSnapshot, documents: DocumentsResult) -> None:
        approved = self._approved_items(documents.cedula)
        if not approved:
            return

        item = approved[0]
        fields = item.extracted_data.get("extracted_fields", {})
        snapshot.primary_cedula_id = str(fields.get("id_number", "")).strip()
        first_name = str(fields.get("first_name", "")).strip()
        last_name = str(fields.get("last_name", "")).strip()
        snapshot.primary_cedula_expiration_date = str(
            fields.get("expiration_date", "")
        ).strip()
        snapshot.primary_cedula_full_name = " ".join(
            value for value in (first_name, last_name) if value
        ).strip()
        self._apply_cedula_expiration_policy(snapshot)

    def _apply_company_documents(
        self,
        snapshot: CanonicalMerchantSnapshot,
        documents: DocumentsResult,
    ) -> None:
        chronological_items = self._chronological_company_items(documents)
        current_representatives: list[CanonicalRepresentative] = []
        signature_bundle: dict[str, str | None] = {
            "signature_type": "",
            "signature_quote": "",
            "authority_details": "",
            "source_document_type": "",
            "source_document_id": None,
            "source_document_date": "",
        }

        for item in chronological_items:
            fields = item.extracted_data.get("extracted_fields", {})
            document_type = str(item.extracted_data.get("document_type", "")).strip()
            source_document_date = self._nested_get(
                fields,
                "registro_mercantil",
                "fecha_registro",
            )
            legal_rep = self._nested_get_dict(fields, "corporate_structure", "legal_representative")

            self._merge_company_record(
                record=snapshot.company_record,
                fields=fields,
                document_type=document_type,
                document_id=item.document_id,
                source_document_date=source_document_date,
            )

            if self._has_explicit_signature_authority(legal_rep):
                signature_bundle = {
                    "signature_type": str(legal_rep.get("signature_type", "")).strip(),
                    "signature_quote": str(legal_rep.get("signature_quote", "")).strip(),
                    "authority_details": str(legal_rep.get("authority_details", "")).strip(),
                    "source_document_type": document_type,
                    "source_document_id": item.document_id,
                    "source_document_date": source_document_date,
                }
                snapshot.company_record.signature_type = str(signature_bundle["signature_type"] or "")
                snapshot.company_record.signature_quote = str(signature_bundle["signature_quote"] or "")
                snapshot.company_record.authority_details = str(signature_bundle["authority_details"] or "")
                snapshot.company_record.signature_source_document_type = str(signature_bundle["source_document_type"] or "")
                snapshot.company_record.signature_source_document_id = signature_bundle["source_document_id"]
                snapshot.company_record.signature_source_document_date = str(signature_bundle["source_document_date"] or "")

            representatives = self._extract_representatives(
                item=item,
                fields=fields,
                document_type=document_type,
                legal_rep=legal_rep,
                source_document_date=source_document_date,
                signature_bundle=signature_bundle,
                board_status=snapshot.company_record.board_status,
            )
            if representatives:
                current_representatives = representatives

        snapshot.representatives = current_representatives

    def _merge_company_record(
        self,
        *,
        record: CanonicalCompanyRecord,
        fields: dict,
        document_type: str,
        document_id: str | None,
        source_document_date: str,
    ) -> None:
        company_name = self._meaningful(
            str(fields.get("razon_social") or fields.get("company_name") or "").strip()
        )
        fiscal_address = self._meaningful(
            self._nested_get(fields, "locations", "fiscal_address")
        )
        registration_number = self._meaningful(
            self._nested_get(fields, "registro_mercantil", "numero")
        )
        registration_tomo = self._meaningful(
            self._nested_get(fields, "registro_mercantil", "tomo")
        )
        registration_date = self._meaningful(
            self._nested_get(fields, "registro_mercantil", "fecha_registro")
        )
        company_status = self._meaningful(
            self._nested_get(fields, "company_validity", "status")
            or self._nested_get(fields, "company_validity", "current_status")
        )
        company_expiration = self._meaningful(
            self._nested_get(fields, "company_validity", "expiration_date")
            or self._nested_get(fields, "company_validity", "calculated_expiration_date")
        )
        board_status = self._meaningful(
            self._nested_get(fields, "corporate_structure", "board", "status")
            or self._nested_get(fields, "corporate_structure", "legal_representative", "board_status")
        )
        board_expiration = self._meaningful(
            self._nested_get(fields, "corporate_structure", "board", "expiration_date")
        )
        line_code = self._meaningful(
            self._nested_get(fields, "business_classification", "line_code")
        )

        if company_name:
            record.company_name = company_name
            record.source_document_type = document_type
            record.source_document_id = document_id
            record.source_document_date = source_document_date
        if fiscal_address:
            record.fiscal_address = fiscal_address
        if registration_number:
            record.registration_number = registration_number
        if registration_tomo:
            record.registration_tomo = registration_tomo
        if registration_date:
            record.registration_date = registration_date
        if company_status:
            record.company_status = company_status
        if company_expiration:
            record.company_expiration_date = company_expiration
        if line_code:
            record.line_code = line_code
        if board_status:
            record.board_status = board_status
            record.board_source_document_type = document_type
            record.board_source_document_id = document_id
            record.board_source_document_date = source_document_date
        if board_expiration:
            record.board_expiration_date = board_expiration

    def _extract_representatives(
        self,
        *,
        item,
        fields: dict,
        document_type: str,
        legal_rep: dict,
        source_document_date: str,
        signature_bundle: dict[str, str | None],
        board_status: str,
    ) -> list[CanonicalRepresentative]:
        representatives = legal_rep.get("representatives")
        if isinstance(representatives, list) and representatives:
            return [
                self._build_representative(
                    raw=rep,
                    document_type=document_type,
                    document_id=item.document_id,
                    source_document_date=source_document_date,
                    signature_bundle=signature_bundle,
                    board_status=board_status,
                )
                for rep in representatives
            ]

        if legal_rep and any(
            self._meaningful(str(legal_rep.get(field, "")).strip())
            for field in ("full_name", "id_number", "current_role")
        ):
            return [
                self._build_representative(
                    raw={
                        "full_name": legal_rep.get("full_name", ""),
                        "id_number": legal_rep.get("id_number", ""),
                        "specific_role": legal_rep.get("current_role", ""),
                        "signature_validity_probability": legal_rep.get(
                            "signature_validity_probability",
                            "",
                        ),
                    },
                    document_type=document_type,
                    document_id=item.document_id,
                    source_document_date=source_document_date,
                    signature_bundle=signature_bundle,
                    board_status=board_status,
                )
            ]

        return []

    def _build_representative(
        self,
        *,
        raw: dict,
        document_type: str,
        document_id: str | None,
        source_document_date: str,
        signature_bundle: dict[str, str | None],
        board_status: str,
    ) -> CanonicalRepresentative:
        return CanonicalRepresentative(
            full_name=str(raw.get("full_name", "")).strip(),
            id_number=str(raw.get("id_number", "")).strip(),
            role=str(raw.get("specific_role", "")).strip(),
            source_document_type=document_type,
            source_document_id=document_id,
            signature_type=str(signature_bundle.get("signature_type") or ""),
            signature_quote=str(signature_bundle.get("signature_quote") or ""),
            authority_details=str(signature_bundle.get("authority_details") or ""),
            board_status=board_status,
            signature_validity_probability=str(
                raw.get("signature_validity_probability", "")
            ).strip(),
            source_document_date=source_document_date,
        )

    def _has_explicit_signature_authority(self, legal_rep: dict) -> bool:
        clause_modified = self._normalize_flag(
            str(legal_rep.get("representation_clause_modified", "")).strip()
        )
        clause_status = self._normalize_clause_status(
            str(legal_rep.get("signature_clause_status", "")).strip()
        )

        if clause_modified == "NO" or clause_status == "NOT_MODIFIED":
            return False

        if clause_modified == "YES" or clause_status == "EXPLICIT":
            return True

        signature_type = self._meaningful(str(legal_rep.get("signature_type", "")).strip())
        signature_quote = self._meaningful(str(legal_rep.get("signature_quote", "")).strip())
        authority_details = self._meaningful(str(legal_rep.get("authority_details", "")).strip())

        if signature_type:
            return True
        if signature_quote and not self._is_negative_signature_text(signature_quote):
            return True
        if authority_details and not self._is_negative_signature_text(authority_details):
            return True
        return False

    def _chronological_company_items(self, documents: DocumentsResult) -> list:
        approved_items = [
            *self._approved_items(documents.acta_constitutiva),
            *self._approved_items(documents.acta_mercantil),
            *self._approved_items(documents.certificado_emprendimiento),
        ]
        return sorted(
            approved_items,
            key=self._company_item_sort_key,
        )

    def _company_item_sort_key(self, item) -> tuple:
        fields = item.extracted_data.get("extracted_fields", {})
        document_type = str(item.extracted_data.get("document_type", "")).strip()
        document_date = self._nested_get(fields, "registro_mercantil", "fecha_registro")
        priority = {
            "acta_mercantil": 3,
            "acta_constitutiva": 2,
            "certificado_emprendimiento": 1,
        }.get(document_type, 0)
        return (self._parse_date(document_date), priority)

    def _derive_legal_mode(self, snapshot: CanonicalMerchantSnapshot) -> str:
        if snapshot.presence.get("certificado_emprendimiento"):
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

        if snapshot.company_record.company_name or snapshot.presence.get("acta_mercantil") or snapshot.presence.get("acta_constitutiva"):
            return "sociedad_mercantil"

        return "unknown"

    def _apply_cedula_expiration_policy(
        self,
        snapshot: CanonicalMerchantSnapshot,
    ) -> None:
        expiration = self._parse_optional_date(snapshot.primary_cedula_expiration_date)
        if expiration is None:
            snapshot.primary_cedula_is_expired = None
            snapshot.primary_cedula_expiration_years = None
            snapshot.primary_cedula_policy_outcome = "unknown"
            return

        today = datetime.now(UTC).date()
        is_expired = expiration < today
        snapshot.primary_cedula_is_expired = is_expired
        if not is_expired:
            snapshot.primary_cedula_expiration_years = 0
            snapshot.primary_cedula_policy_outcome = "valid"
            return

        years_since_expiration = self._full_years_between(expiration, today)
        snapshot.primary_cedula_expiration_years = years_since_expiration
        snapshot.primary_cedula_policy_outcome = (
            "expired_over_10_years"
            if self._add_years(expiration, 10) < today
            else "expired_within_10_years"
        )

    def _approved_items(self, items):
        return [
            item
            for item in items
            if item.status == "APPROVED"
            and item.extracted_data.get("extraction_status") == "completed"
        ]

    def _nested_get(self, data: dict, *keys: str) -> str:
        current = data
        for key in keys:
            if not isinstance(current, dict):
                return ""
            current = current.get(key)
        return str(current or "").strip()

    def _nested_get_dict(self, data: dict, *keys: str) -> dict:
        current = data
        for key in keys:
            if not isinstance(current, dict):
                return {}
            current = current.get(key)
        return current if isinstance(current, dict) else {}

    def _parse_date(self, value: str) -> datetime:
        cleaned = value.strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(cleaned, fmt)
            except ValueError:
                continue
        return datetime.min

    def _parse_optional_date(self, value: str) -> datetime.date | None:
        cleaned = value.strip()
        if not cleaned or cleaned.upper() == "NO_ENCONTRADO":
            return None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(cleaned, fmt).date()
            except ValueError:
                continue
        return None

    def _full_years_between(self, start: datetime.date, end: datetime.date) -> int:
        years = end.year - start.year
        if (end.month, end.day) < (start.month, start.day):
            years -= 1
        return max(years, 0)

    def _add_years(self, value: datetime.date, years: int) -> datetime.date:
        try:
            return value.replace(year=value.year + years)
        except ValueError:
            return value.replace(month=2, day=28, year=value.year + years)

    def _normalize_text(self, value: str) -> str:
        return " ".join(str(value).strip().lower().replace(".", " ").split())

    def _meaningful(self, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            return ""
        if cleaned.upper() == "NO_ENCONTRADO":
            return ""
        return cleaned

    def _is_negative_signature_text(self, value: str) -> bool:
        normalized = self._normalize_text(value)
        negative_markers = (
            "no se detalla",
            "no se especifica",
            "no se indica",
            "no consta",
            "no se menciona",
            "sin detallar",
            "no definido",
            "no encontrada",
            "no encontrado",
        )
        return any(marker in normalized for marker in negative_markers)

    def _normalize_flag(self, value: str) -> str:
        normalized = self._normalize_text(value).upper()
        if normalized in {"YES", "SI", "SÍ", "TRUE"}:
            return "YES"
        if normalized in {"NO", "FALSE"}:
            return "NO"
        if normalized in {"UNKNOWN", "AMBIGUOUS"}:
            return "UNKNOWN"
        return ""

    def _normalize_clause_status(self, value: str) -> str:
        normalized = self._normalize_text(value).upper()
        mapping = {
            "EXPLICIT": "EXPLICIT",
            "NOT MODIFIED": "NOT_MODIFIED",
            "NOT_MODIFIED": "NOT_MODIFIED",
            "AMBIGUOUS": "AMBIGUOUS",
            "NO_ENCONTRADO": "NO_ENCONTRADO",
            "NO ENCONTRADO": "NO_ENCONTRADO",
        }
        return mapping.get(normalized, "")
