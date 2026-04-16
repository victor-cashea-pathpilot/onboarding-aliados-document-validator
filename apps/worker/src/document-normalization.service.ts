import { Injectable } from '@nestjs/common';
import type {
  CanonicalCompanyRecord,
  CanonicalMerchantSnapshot,
  CanonicalRepresentative,
  JobRecord,
} from '@domain';

type DocumentBucketName =
  | 'rif'
  | 'cedula'
  | 'certificado_emprendimiento'
  | 'acta_constitutiva'
  | 'acta_mercantil';

interface DocumentResultItem {
  document_id?: string | null;
  status: 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW';
  confidence: number;
  extracted_data: Record<string, unknown>;
  errors: Array<{ error_code: string; message: string }>;
}

@Injectable()
export class DocumentNormalizationService {
  normalize(merchantId: string, documents: Record<string, unknown>): CanonicalMerchantSnapshot {
    const snapshot: CanonicalMerchantSnapshot = {
      merchantId,
      rifNumber: '',
      rifCompanyName: '',
      rifExpirationDate: '',
      rifFiscalAddress: '',
      primaryCedulaId: '',
      primaryCedulaFullName: '',
      primaryCedulaExpirationDate: '',
      primaryCedulaIsExpired: null,
      primaryCedulaExpirationYears: null,
      primaryCedulaPolicyOutcome: 'unknown',
      legalMode: 'unknown',
      companyRecord: this.createEmptyCompanyRecord(),
      representatives: [],
      sourceDocumentTypes: [],
      presence: {
        rif: this.bucket('rif', documents).length > 0,
        cedula: this.bucket('cedula', documents).length > 0,
        acta_constitutiva: this.bucket('acta_constitutiva', documents).length > 0,
        acta_mercantil: this.bucket('acta_mercantil', documents).length > 0,
        certificado_emprendimiento:
          this.bucket('certificado_emprendimiento', documents).length > 0,
      },
      normalizationStatus: 'partial',
    };

    this.applyRif(snapshot, documents);
    this.applyCedula(snapshot, documents);
    this.applyCompanyDocuments(snapshot, documents);

    snapshot.legalMode = this.deriveLegalMode(snapshot);
    snapshot.normalizationStatus =
      snapshot.rifNumber && snapshot.primaryCedulaId && snapshot.companyRecord.companyName
        ? 'complete'
        : 'partial';
    snapshot.sourceDocumentTypes = Array.from(
      new Set(
        [
          snapshot.companyRecord.sourceDocumentType,
          ...snapshot.representatives.map((rep) => rep.sourceDocumentType),
          ...Object.entries(snapshot.presence)
            .filter(([, present]) => present)
            .map(([documentType]) => documentType),
        ].filter((value) => Boolean(value)),
      ),
    ).sort();

    return snapshot;
  }

  private createEmptyCompanyRecord(): CanonicalCompanyRecord {
    return {
      companyName: '',
      sourceDocumentType: '',
      sourceDocumentId: null,
      sourceDocumentDate: '',
      fiscalAddress: '',
      registrationNumber: '',
      registrationTomo: '',
      registrationDate: '',
      companyStatus: '',
      companyExpirationDate: '',
      boardStatus: '',
      boardExpirationDate: '',
      boardSourceDocumentType: '',
      boardSourceDocumentId: null,
      boardSourceDocumentDate: '',
      signatureType: '',
      signatureQuote: '',
      authorityDetails: '',
      signatureSourceDocumentType: '',
      signatureSourceDocumentId: null,
      signatureSourceDocumentDate: '',
      lineCode: '',
    };
  }

  private applyRif(snapshot: CanonicalMerchantSnapshot, documents: Record<string, unknown>) {
    const approved = this.approvedItems(this.bucket('rif', documents));
    if (approved.length === 0) {
      return;
    }

    const fields = this.asObject(approved[0].extracted_data.extracted_fields);
    snapshot.rifNumber = this.readString(fields?.rif_number);
    snapshot.rifCompanyName = this.readString(fields?.company_name);
    snapshot.rifExpirationDate = this.readString(fields?.expiration_date);
    snapshot.rifFiscalAddress = this.readString(fields?.fiscal_address);
  }

  private applyCedula(snapshot: CanonicalMerchantSnapshot, documents: Record<string, unknown>) {
    const approved = this.approvedItems(this.bucket('cedula', documents));
    if (approved.length === 0) {
      return;
    }

    const fields = this.asObject(approved[0].extracted_data.extracted_fields);
    snapshot.primaryCedulaId = this.readString(fields?.id_number);
    const firstName = this.readString(fields?.first_name);
    const lastName = this.readString(fields?.last_name);
    snapshot.primaryCedulaExpirationDate = this.readString(fields?.expiration_date);
    snapshot.primaryCedulaFullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    this.applyCedulaExpirationPolicy(snapshot);
  }

  private applyCompanyDocuments(
    snapshot: CanonicalMerchantSnapshot,
    documents: Record<string, unknown>,
  ) {
    const chronological = this.chronologicalCompanyItems(documents);
    let currentRepresentatives: CanonicalRepresentative[] = [];
    let signatureBundle: {
      signatureType: string;
      signatureQuote: string;
      authorityDetails: string;
      sourceDocumentType: string;
      sourceDocumentId?: string | null;
      sourceDocumentDate: string;
    } = {
      signatureType: '',
      signatureQuote: '',
      authorityDetails: '',
      sourceDocumentType: '',
      sourceDocumentId: null,
      sourceDocumentDate: '',
    };

    for (const item of chronological) {
      const fields = this.asObject(item.extracted_data.extracted_fields) ?? {};
      const documentType = this.readString(item.extracted_data.document_type);
      const sourceDocumentDate = this.nestedGet(
        fields,
        'registro_mercantil',
        'fecha_registro',
      );
      const legalRep = this.nestedGetDict(fields, 'corporate_structure', 'legal_representative');

      this.mergeCompanyRecord(
        snapshot.companyRecord,
        fields,
        documentType,
        item.document_id ?? null,
        sourceDocumentDate,
      );

      if (this.hasExplicitSignatureAuthority(legalRep)) {
        signatureBundle = {
          signatureType: this.readMeaningfulString(legalRep.signature_type),
          signatureQuote: this.readMeaningfulString(legalRep.signature_quote),
          authorityDetails: this.readMeaningfulString(legalRep.authority_details),
          sourceDocumentType: documentType,
          sourceDocumentId: item.document_id ?? null,
          sourceDocumentDate,
        };
        snapshot.companyRecord.signatureType = signatureBundle.signatureType;
        snapshot.companyRecord.signatureQuote = signatureBundle.signatureQuote;
        snapshot.companyRecord.authorityDetails = signatureBundle.authorityDetails;
        snapshot.companyRecord.signatureSourceDocumentType =
          signatureBundle.sourceDocumentType;
        snapshot.companyRecord.signatureSourceDocumentId = signatureBundle.sourceDocumentId;
        snapshot.companyRecord.signatureSourceDocumentDate =
          signatureBundle.sourceDocumentDate;
      }

      const representatives = this.extractRepresentatives(
        item,
        fields,
        documentType,
        legalRep,
        sourceDocumentDate,
        signatureBundle,
        snapshot.companyRecord.boardStatus,
      );
      if (representatives.length > 0) {
        currentRepresentatives = representatives;
      }
    }

    snapshot.representatives = currentRepresentatives;
  }

  private mergeCompanyRecord(
    record: CanonicalCompanyRecord,
    fields: Record<string, unknown>,
    documentType: string,
    documentId: string | null,
    sourceDocumentDate: string,
  ) {
    const companyName = this.meaningful(
      this.readString(fields.razon_social) || this.readString(fields.company_name),
    );
    const fiscalAddress = this.meaningful(this.nestedGet(fields, 'locations', 'fiscal_address'));
    const registrationNumber = this.meaningful(
      this.nestedGet(fields, 'registro_mercantil', 'numero'),
    );
    const registrationTomo = this.meaningful(
      this.nestedGet(fields, 'registro_mercantil', 'tomo'),
    );
    const registrationDate = this.meaningful(
      this.nestedGet(fields, 'registro_mercantil', 'fecha_registro'),
    );
    const companyStatus = this.meaningful(
      this.nestedGet(fields, 'company_validity', 'status') ||
        this.nestedGet(fields, 'company_validity', 'current_status'),
    );
    const companyExpiration = this.meaningful(
      this.nestedGet(fields, 'company_validity', 'expiration_date') ||
        this.nestedGet(fields, 'company_validity', 'calculated_expiration_date'),
    );
    const boardStatus = this.meaningful(
      this.nestedGet(fields, 'corporate_structure', 'board', 'status') ||
        this.nestedGet(fields, 'corporate_structure', 'legal_representative', 'board_status'),
    );
    const boardExpiration = this.meaningful(
      this.nestedGet(fields, 'corporate_structure', 'board', 'expiration_date'),
    );
    const lineCode = this.meaningful(
      this.nestedGet(fields, 'business_classification', 'line_code'),
    );

    if (companyName) {
      record.companyName = companyName;
      record.sourceDocumentType = documentType;
      record.sourceDocumentId = documentId;
      record.sourceDocumentDate = sourceDocumentDate;
    }
    if (fiscalAddress) {
      record.fiscalAddress = fiscalAddress;
    }
    if (registrationNumber) {
      record.registrationNumber = registrationNumber;
    }
    if (registrationTomo) {
      record.registrationTomo = registrationTomo;
    }
    if (registrationDate) {
      record.registrationDate = registrationDate;
    }
    if (companyStatus) {
      record.companyStatus = companyStatus;
    }
    if (companyExpiration) {
      record.companyExpirationDate = companyExpiration;
    }
    if (lineCode) {
      record.lineCode = lineCode;
    }
    if (boardStatus) {
      record.boardStatus = boardStatus;
      record.boardSourceDocumentType = documentType;
      record.boardSourceDocumentId = documentId;
      record.boardSourceDocumentDate = sourceDocumentDate;
    }
    if (boardExpiration) {
      record.boardExpirationDate = boardExpiration;
    }
  }

  private extractRepresentatives(
    item: DocumentResultItem,
    fields: Record<string, unknown>,
    documentType: string,
    legalRep: Record<string, unknown>,
    sourceDocumentDate: string,
    signatureBundle: {
      signatureType: string;
      signatureQuote: string;
      authorityDetails: string;
      sourceDocumentType: string;
      sourceDocumentId?: string | null;
      sourceDocumentDate: string;
    },
    boardStatus: string,
  ): CanonicalRepresentative[] {
    const representatives = legalRep.representatives;
    if (Array.isArray(representatives) && representatives.length > 0) {
      return representatives
        .map((raw) =>
          this.buildRepresentative(
            this.asObject(raw) ?? {},
            documentType,
            item.document_id ?? null,
            sourceDocumentDate,
            signatureBundle,
            boardStatus,
          ),
        )
        .filter((rep) => rep.fullName || rep.idNumber || rep.role);
    }

    const hasFallbackRepresentative =
      this.meaningful(this.readString(legalRep.full_name)) ||
      this.meaningful(this.readString(legalRep.id_number)) ||
      this.meaningful(this.readString(legalRep.current_role));

    if (hasFallbackRepresentative) {
      return [
        this.buildRepresentative(
          {
            full_name: legalRep.full_name,
            id_number: legalRep.id_number,
            specific_role: legalRep.current_role,
            signature_validity_probability: legalRep.signature_validity_probability,
          },
          documentType,
          item.document_id ?? null,
          sourceDocumentDate,
          signatureBundle,
          boardStatus,
        ),
      ];
    }

    return [];
  }

  private buildRepresentative(
    raw: Record<string, unknown>,
    documentType: string,
    documentId: string | null,
    sourceDocumentDate: string,
    signatureBundle: {
      signatureType: string;
      signatureQuote: string;
      authorityDetails: string;
      sourceDocumentType: string;
      sourceDocumentId?: string | null;
      sourceDocumentDate: string;
    },
    boardStatus: string,
  ): CanonicalRepresentative {
    return {
      fullName: this.readString(raw.full_name),
      idNumber: this.readString(raw.id_number),
      role: this.readString(raw.specific_role),
      sourceDocumentType: documentType,
      sourceDocumentId: documentId,
      signatureType: signatureBundle.signatureType,
      signatureQuote: signatureBundle.signatureQuote,
      authorityDetails: signatureBundle.authorityDetails,
      boardStatus,
      signatureValidityProbability: this.readString(raw.signature_validity_probability),
      sourceDocumentDate,
    };
  }

  private hasExplicitSignatureAuthority(legalRep: Record<string, unknown>): boolean {
    const clauseModified = this.normalizeFlag(this.readString(legalRep.representation_clause_modified));
    const clauseStatus = this.normalizeClauseStatus(this.readString(legalRep.signature_clause_status));

    if (clauseModified === 'NO' || clauseStatus === 'NOT_MODIFIED') {
      return false;
    }
    if (clauseModified === 'YES' || clauseStatus === 'EXPLICIT') {
      return true;
    }

    const signatureType = this.meaningful(this.readString(legalRep.signature_type));
    const signatureQuote = this.meaningful(this.readString(legalRep.signature_quote));
    const authorityDetails = this.meaningful(this.readString(legalRep.authority_details));

    if (signatureType) {
      return true;
    }
    if (signatureQuote && !this.isNegativeSignatureText(signatureQuote)) {
      return true;
    }
    if (authorityDetails && !this.isNegativeSignatureText(authorityDetails)) {
      return true;
    }
    return false;
  }

  private chronologicalCompanyItems(documents: Record<string, unknown>): DocumentResultItem[] {
    const approvedItems = [
      ...this.approvedItems(this.bucket('acta_constitutiva', documents)),
      ...this.approvedItems(this.bucket('acta_mercantil', documents)),
      ...this.approvedItems(this.bucket('certificado_emprendimiento', documents)),
    ];

    return approvedItems.sort((left, right) => {
      const leftKey = this.companyItemSortKey(left);
      const rightKey = this.companyItemSortKey(right);
      if (leftKey.timestamp !== rightKey.timestamp) {
        return leftKey.timestamp - rightKey.timestamp;
      }
      return leftKey.priority - rightKey.priority;
    });
  }

  private companyItemSortKey(item: DocumentResultItem) {
    const fields = this.asObject(item.extracted_data.extracted_fields) ?? {};
    const documentType = this.readString(item.extracted_data.document_type);
    const documentDate = this.nestedGet(fields, 'registro_mercantil', 'fecha_registro');
    const priorityMap = {
      certificado_emprendimiento: 1,
      acta_constitutiva: 2,
      acta_mercantil: 3,
    } as Record<string, number>;
    return {
      timestamp: this.parseDate(documentDate),
      priority: priorityMap[documentType] ?? 0,
    };
  }

  private deriveLegalMode(snapshot: CanonicalMerchantSnapshot) {
    if (snapshot.presence.certificado_emprendimiento) {
      return 'emprendimiento';
    }

    const boardStatus = this.normalizeText(snapshot.companyRecord.boardStatus);
    const companyName = this.normalizeText(snapshot.companyRecord.companyName);
    if (boardStatus.includes('firma personal') || ` ${companyName} `.includes(' f p ')) {
      return 'firma_personal';
    }

    if (
      snapshot.representatives.some((rep) => {
        const role = this.normalizeText(rep.role);
        return (
          role.includes('propietaria') ||
          role.includes('propietario') ||
          role.includes('titular')
        );
      })
    ) {
      return 'firma_personal';
    }

    if (
      snapshot.companyRecord.companyName ||
      snapshot.presence.acta_constitutiva ||
      snapshot.presence.acta_mercantil
    ) {
      return 'sociedad_mercantil';
    }

    return 'unknown';
  }

  private applyCedulaExpirationPolicy(snapshot: CanonicalMerchantSnapshot) {
    const expiration = this.parseOptionalDate(snapshot.primaryCedulaExpirationDate);
    if (!expiration) {
      snapshot.primaryCedulaIsExpired = null;
      snapshot.primaryCedulaExpirationYears = null;
      snapshot.primaryCedulaPolicyOutcome = 'unknown';
      return;
    }

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const isExpired = expiration.getTime() < todayUtc.getTime();
    snapshot.primaryCedulaIsExpired = isExpired;
    if (!isExpired) {
      snapshot.primaryCedulaExpirationYears = 0;
      snapshot.primaryCedulaPolicyOutcome = 'valid';
      return;
    }

    const yearsSinceExpiration = this.fullYearsBetween(expiration, todayUtc);
    snapshot.primaryCedulaExpirationYears = yearsSinceExpiration;
    snapshot.primaryCedulaPolicyOutcome =
      this.addYears(expiration, 10).getTime() < todayUtc.getTime()
        ? 'expired_over_10_years'
        : 'expired_within_10_years';
  }

  private approvedItems(items: DocumentResultItem[]) {
    return items.filter(
      (item) =>
        item.status === 'APPROVED' &&
        this.readString(item.extracted_data.extraction_status) === 'completed',
    );
  }

  private bucket(name: DocumentBucketName, documents: Record<string, unknown>): DocumentResultItem[] {
    const value = documents[name];
    return Array.isArray(value) ? (value as DocumentResultItem[]) : [];
  }

  private nestedGet(data: Record<string, unknown>, ...keys: string[]) {
    let current = data;
    for (const key of keys) {
      if (!this.asObject(current)) {
        return '';
      }
      current = (current as Record<string, unknown>)[key] as Record<string, unknown>;
    }
    return this.readString(current);
  }

  private nestedGetDict(data: Record<string, unknown>, ...keys: string[]) {
    let current: unknown = data;
    for (const key of keys) {
      const object = this.asObject(current);
      if (!object) {
        return {};
      }
      current = object[key];
    }
    return this.asObject(current) ?? {};
  }

  private parseDate(value: string): number {
    const optional = this.parseOptionalDate(value);
    return optional ? optional.getTime() : Number.MIN_SAFE_INTEGER;
  }

  private parseOptionalDate(value: string): Date | null {
    const cleaned = value.trim();
    if (!cleaned || cleaned.toUpperCase() === 'NO_ENCONTRADO') {
      return null;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
      const [day, month, year] = cleaned.split('/').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return new Date(`${cleaned}T00:00:00.000Z`);
    }
    return null;
  }

  private fullYearsBetween(start: Date, end: Date): number {
    let years = end.getUTCFullYear() - start.getUTCFullYear();
    if (
      end.getUTCMonth() < start.getUTCMonth() ||
      (end.getUTCMonth() === start.getUTCMonth() && end.getUTCDate() < start.getUTCDate())
    ) {
      years -= 1;
    }
    return Math.max(years, 0);
  }

  private addYears(value: Date, years: number): Date {
    const result = new Date(value.getTime());
    result.setUTCFullYear(result.getUTCFullYear() + years);
    if (result.getUTCMonth() !== value.getUTCMonth()) {
      return new Date(Date.UTC(value.getUTCFullYear() + years, 1, 28));
    }
    return result;
  }

  private normalizeText(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replaceAll('.', ' ')
      .split(/\s+/)
      .filter(Boolean)
      .join(' ');
  }

  private meaningful(value: string) {
    const cleaned = value.trim();
    if (!cleaned || cleaned.toUpperCase() === 'NO_ENCONTRADO') {
      return '';
    }
    return cleaned;
  }

  private isNegativeSignatureText(value: string) {
    const normalized = this.normalizeText(value);
    return [
      'no se detalla',
      'no se especifica',
      'no se indica',
      'no consta',
      'no se menciona',
      'sin detallar',
      'no definido',
      'no encontrada',
      'no encontrado',
    ].some((marker) => normalized.includes(marker));
  }

  private normalizeFlag(value: string) {
    const normalized = this.normalizeText(value).toUpperCase();
    if (['YES', 'SI', 'SÍ', 'TRUE'].includes(normalized)) {
      return 'YES';
    }
    if (['NO', 'FALSE'].includes(normalized)) {
      return 'NO';
    }
    if (['UNKNOWN', 'AMBIGUOUS'].includes(normalized)) {
      return 'UNKNOWN';
    }
    return '';
  }

  private normalizeClauseStatus(value: string) {
    const normalized = this.normalizeText(value).toUpperCase();
    const mapping: Record<string, string> = {
      EXPLICIT: 'EXPLICIT',
      'NOT MODIFIED': 'NOT_MODIFIED',
      NOT_MODIFIED: 'NOT_MODIFIED',
      AMBIGUOUS: 'AMBIGUOUS',
      NO_ENCONTRADO: 'NO_ENCONTRADO',
      'NO ENCONTRADO': 'NO_ENCONTRADO',
    };
    return mapping[normalized] ?? '';
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private readMeaningfulString(value: unknown): string {
    return this.meaningful(this.readString(value));
  }
}
