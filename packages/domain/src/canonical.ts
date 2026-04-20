import type { CedulaPolicyOutcome, LegalMode } from './legal-mode';

export interface CanonicalRepresentative {
  fullName: string;
  idNumber: string;
  role: string;
  sourceDocumentType: string;
  sourceDocumentId?: string | null;
  signatureType: string;
  signatureQuote: string;
  authorityDetails: string;
  boardStatus: string;
  signatureValidityProbability: string;
  sourceDocumentDate: string;
}

export interface CanonicalCompanyRecord {
  companyName: string;
  sourceDocumentType: string;
  sourceDocumentId?: string | null;
  sourceDocumentDate: string;
  fiscalAddress: string;
  registrationNumber: string;
  registrationTomo: string;
  registrationDate: string;
  companyStatus: string;
  companyExpirationDate: string;
  boardStatus: string;
  boardExpirationDate: string;
  boardSourceDocumentType: string;
  boardSourceDocumentId?: string | null;
  boardSourceDocumentDate: string;
  signatureType: string;
  signatureQuote: string;
  authorityDetails: string;
  signatureSourceDocumentType: string;
  signatureSourceDocumentId?: string | null;
  signatureSourceDocumentDate: string;
  lineCode: string;
}

export interface CanonicalMerchantSnapshot {
  merchantId: string;
  rifNumber: string;
  rifCompanyName: string;
  rifExpirationDate: string;
  rifFiscalAddress: string;
  primaryCedulaId: string;
  primaryCedulaFullName: string;
  primaryCedulaExpirationDate: string;
  primaryCedulaIsExpired?: boolean | null;
  primaryCedulaExpirationYears?: number | null;
  primaryCedulaPolicyOutcome: CedulaPolicyOutcome;
  legalMode: LegalMode;
  companyRecord: CanonicalCompanyRecord;
  representatives: CanonicalRepresentative[];
  sourceDocumentTypes: string[];
  presence: Record<string, boolean>;
  normalizationStatus: 'complete' | 'partial';
}
