"""Basic contract smoke tests."""

from backend.shared.models.contracts import DocumentsPayload, DocumentReference


def test_documents_payload_counts_all_documents() -> None:
    payload = DocumentsPayload(
        rif=[DocumentReference(url="https://example.com/rif.pdf")],
        cedula=[DocumentReference(url="https://example.com/cedula.jpg")],
    )

    assert payload.total_documents() == 2
