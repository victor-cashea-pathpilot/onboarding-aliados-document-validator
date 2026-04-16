export type DocumentType =
  | 'rif'
  | 'cedula'
  | 'acta_constitutiva'
  | 'acta_mercantil'
  | 'certificado_emprendimiento';

export interface DocumentReference {
  url: string;
  documentId?: string | null;
}

export interface DocumentsPayload {
  rif: DocumentReference[];
  cedula: DocumentReference[];
  certificadoEmprendimiento: DocumentReference[];
  actaConstitutiva: DocumentReference[];
  actaMercantil: DocumentReference[];
}

export interface SanitizedDocumentReference {
  url: string;
  documentId?: string | null;
}

export interface SanitizedDocumentsPayload {
  rif: SanitizedDocumentReference[];
  cedula: SanitizedDocumentReference[];
  certificadoEmprendimiento: SanitizedDocumentReference[];
  actaConstitutiva: SanitizedDocumentReference[];
  actaMercantil: SanitizedDocumentReference[];
}

export function totalDocuments(payload: DocumentsPayload): number {
  return (
    payload.rif.length +
    payload.cedula.length +
    payload.certificadoEmprendimiento.length +
    payload.actaConstitutiva.length +
    payload.actaMercantil.length
  );
}
