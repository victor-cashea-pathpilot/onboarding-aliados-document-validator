"""Normalization layer that maps extracted document data into one canonical snapshot."""

from __future__ import annotations

from datetime import datetime

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
        snapshot.primary_cedula_full_name = " ".join(
            value for value in (first_name, last_name) if value
        ).strip()

    def _apply_company_documents(
        self,
        snapshot: CanonicalMerchantSnapshot,
        documents: DocumentsResult,
    ) -> None:
        prioritized_items = self._prioritized_company_items(documents)

        for item in prioritized_items:
            fields = item.extracted_data.get("extracted_fields", {})
            document_type = str(item.extracted_data.get("document_type", "")).strip()
            if not snapshot.company_record.company_name:
                source_document_date = self._nested_get(
                    fields,
                    "registro_mercantil",
                    "fecha_registro",
                )
                snapshot.company_record = CanonicalCompanyRecord(
                    company_name=str(
                        fields.get("razon_social")
                        or fields.get("company_name")
                        or ""
                    ).strip(),
                    source_document_type=document_type,
                    source_document_id=item.document_id,
                    fiscal_address=self._nested_get(
                        fields,
                        "locations",
                        "fiscal_address",
                    ),
                    registration_number=self._nested_get(
                        fields,
                        "registro_mercantil",
                        "numero",
                    ),
                    registration_tomo=self._nested_get(
                        fields,
                        "registro_mercantil",
                        "tomo",
                    ),
                    registration_date=self._nested_get(
                        fields,
                        "registro_mercantil",
                        "fecha_registro",
                    ),
                    source_document_date=source_document_date,
                    company_status=(
                        self._nested_get(fields, "company_validity", "status")
                        or self._nested_get(fields, "company_validity", "current_status")
                    ),
                    company_expiration_date=(
                        self._nested_get(fields, "company_validity", "expiration_date")
                        or self._nested_get(
                            fields,
                            "company_validity",
                            "calculated_expiration_date",
                        )
                    ),
                    board_status=self._nested_get(
                        fields,
                        "corporate_structure",
                        "board",
                        "status",
                    )
                    or self._nested_get(
                        fields,
                        "corporate_structure",
                        "legal_representative",
                        "board_status",
                    ),
                    board_expiration_date=self._nested_get(
                        fields,
                        "corporate_structure",
                        "board",
                        "expiration_date",
                    ),
                    line_code=self._nested_get(
                        fields,
                        "business_classification",
                        "line_code",
                    ),
                )

            self._append_representatives(
                snapshot=snapshot,
                item=item,
                fields=fields,
                document_type=document_type,
            )

    def _append_representatives(self, *, snapshot, item, fields, document_type: str) -> None:
        legal_rep = self._nested_get_dict(fields, "corporate_structure", "legal_representative")
        board_status = self._nested_get(fields, "corporate_structure", "board", "status") or str(
            legal_rep.get("board_status", "")
        ).strip()
        source_document_date = self._nested_get(
            fields,
            "registro_mercantil",
            "fecha_registro",
        )
        signature_type = str(legal_rep.get("signature_type", "")).strip()
        signature_quote = str(legal_rep.get("signature_quote", "")).strip()
        authority_details = str(legal_rep.get("authority_details", "")).strip()

        representatives = legal_rep.get("representatives")
        if isinstance(representatives, list) and representatives:
            for rep in representatives:
                snapshot.representatives.append(
                    CanonicalRepresentative(
                        full_name=str(rep.get("full_name", "")).strip(),
                        id_number=str(rep.get("id_number", "")).strip(),
                        role=str(rep.get("specific_role", "")).strip(),
                        source_document_type=document_type,
                        source_document_id=item.document_id,
                        signature_type=signature_type,
                        signature_quote=signature_quote,
                        authority_details=authority_details,
                        board_status=board_status,
                        signature_validity_probability=str(
                            rep.get("signature_validity_probability", "")
                        ).strip(),
                        source_document_date=source_document_date,
                    )
                )
            return

        if legal_rep:
            snapshot.representatives.append(
                CanonicalRepresentative(
                    full_name=str(legal_rep.get("full_name", "")).strip(),
                    id_number=str(legal_rep.get("id_number", "")).strip(),
                    role=str(legal_rep.get("current_role", "")).strip(),
                    source_document_type=document_type,
                    source_document_id=item.document_id,
                    signature_type=signature_type,
                    signature_quote=signature_quote,
                    authority_details=authority_details,
                    board_status=board_status,
                    signature_validity_probability=str(
                        legal_rep.get("signature_validity_probability", "")
                    ).strip(),
                    source_document_date=source_document_date,
                )
            )

    def _prioritized_company_items(self, documents: DocumentsResult) -> list:
        approved_items = [
            *self._approved_items(documents.acta_mercantil),
            *self._approved_items(documents.acta_constitutiva),
            *self._approved_items(documents.certificado_emprendimiento),
        ]
        return sorted(
            approved_items,
            key=self._company_item_sort_key,
            reverse=True,
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

    def _normalize_text(self, value: str) -> str:
        return " ".join(str(value).strip().lower().replace(".", " ").split())
