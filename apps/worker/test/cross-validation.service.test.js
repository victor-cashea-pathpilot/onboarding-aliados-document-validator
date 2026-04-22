const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CrossValidationService,
} = require('../../../dist/apps/worker/apps/worker/src/cross-validation.service.js');

function formatDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

test('CrossValidationService passes matching identity and company checks', () => {
  const service = new CrossValidationService();
  const snapshot = {
    merchantId: 'merchant-1',
    legalMode: 'sociedad_mercantil',
    rifNumber: 'J-41036436-0',
    rifCompanyName: 'FREDLOU STILO Y BELLEZA, C.A.',
    rifExpirationDate: '22/01/2029',
    rifFiscalAddress: 'Av. Principal, Centro Comercial Local 1',
    primaryCedulaId: 'V-12.048.047',
    primaryCedulaFullName: 'FREDDY RAMON CONTRERAS DIAZ',
    primaryCedulaExpirationDate: '31/12/2030',
    companyRecord: {
      companyName: 'Fredlou Stilo y Belleza C.A.',
      fiscalAddress: 'Av. Principal, Centro Comercial Local 1',
      companyStatus: 'VIGENTE',
      companyExpirationDate: '07/09/2037',
      boardStatus: 'VIGENTE',
      businessSummary: 'Salon de belleza y comercio B2C',
      signatureType: 'SEPARADA',
    },
    representatives: [
      {
        fullName: 'FREDDY RAMON CONTRERAS DIAZ',
        idNumber: 'V-12.048.047',
        signatureType: 'SEPARADA',
        authorityDetails: 'Facultades generales',
        boardStatus: 'VIGENTE',
        signatureValidityProbability: '100',
      },
    ],
    presence: {
      rif: true,
      cedula: true,
      acta_constitutiva: true,
      acta_mercantil: false,
      certificado_emprendimiento: false,
    },
  };

  const checks = Object.fromEntries(
    service.validate(snapshot).map((check) => [check.code, check]),
  );

  assert.equal(checks.COMPANY_NAME_MATCH.status, 'PASSED');
  assert.equal(checks.FISCAL_ADDRESS_MATCH.status, 'PASSED');
  assert.equal(checks.CEDULA_MATCHES_LEGAL_REPRESENTATIVE.status, 'PASSED');
  assert.equal(checks.CEDULA_VALIDITY_POLICY.status, 'PASSED');
  assert.equal(checks.RIF_NATURE_ALLOWED.status, 'PASSED');
  assert.equal(checks.COMPANY_VALIDITY.status, 'PASSED');
  assert.equal(checks.BOARD_VALIDITY.status, 'PASSED');
  assert.equal(checks.RIF_VALIDITY.status, 'PASSED');
  assert.equal(checks.BUSINESS_ACTIVITY_ALLOWED.status, 'PASSED');
  assert.equal(checks.SIGNATURE_AUTHORITY_PRESENT.status, 'PASSED');
});

test('CrossValidationService rejects cedula expired more than ten years', () => {
  const service = new CrossValidationService();
  const past = new Date();
  past.setUTCFullYear(past.getUTCFullYear() - 11);
  const dd = String(past.getUTCDate()).padStart(2, '0');
  const mm = String(past.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(past.getUTCFullYear());

  const checks = Object.fromEntries(
    service
      .validate({
        merchantId: 'merchant-2',
        legalMode: 'sociedad_mercantil',
        rifNumber: '',
        rifCompanyName: '',
        rifExpirationDate: '',
        primaryCedulaId: 'V-10.203.041',
        primaryCedulaFullName: '',
        primaryCedulaExpirationDate: `${dd}/${mm}/${yyyy}`,
        companyRecord: {},
        representatives: [],
        presence: {
          rif: false,
          cedula: true,
          acta_constitutiva: false,
          acta_mercantil: false,
          certificado_emprendimiento: false,
        },
      })
      .map((check) => [check.code, check]),
  );

  assert.equal(checks.CEDULA_VALIDITY_POLICY.status, 'FAILED');
});

test('CrossValidationService applies six-month RIF grace window', () => {
  const service = new CrossValidationService();
  const expiredWithinGrace = new Date();
  expiredWithinGrace.setUTCMonth(expiredWithinGrace.getUTCMonth() - 3);

  const checks = Object.fromEntries(
    service
      .validate({
        merchantId: 'merchant-rif-grace',
        legalMode: 'sociedad_mercantil',
        rifNumber: 'J-12345678-9',
        rifCompanyName: 'EMPRESA DEMO C.A.',
        rifExpirationDate: formatDate(expiredWithinGrace),
        rifFiscalAddress: 'Av. Principal 1',
        primaryCedulaId: '',
        primaryCedulaFullName: '',
        primaryCedulaExpirationDate: '',
        companyRecord: {
          companyName: 'EMPRESA DEMO C.A.',
          fiscalAddress: 'Av. Principal 1',
          companyStatus: 'VIGENTE',
          companyExpirationDate: '01/01/2030',
          boardStatus: 'VIGENTE',
          businessSummary: 'Comercio minorista B2C',
          signatureType: 'SEPARADA',
        },
        representatives: [],
        presence: {
          rif: true,
          cedula: false,
          acta_constitutiva: true,
          acta_mercantil: false,
          certificado_emprendimiento: false,
        },
      })
      .map((check) => [check.code, check]),
  );

  assert.equal(checks.RIF_VALIDITY.status, 'SKIPPED');
});

test('CrossValidationService validates board grace when holdover clause is present', () => {
  const service = new CrossValidationService();
  const boardExpiredRecently = new Date();
  boardExpiredRecently.setUTCFullYear(boardExpiredRecently.getUTCFullYear() - 2);

  const checks = Object.fromEntries(
    service
      .validate({
        merchantId: 'merchant-board-grace',
        legalMode: 'sociedad_mercantil',
        rifNumber: 'J-30792505-1',
        rifCompanyName: 'EMPRESA DEMO C.A.',
        rifExpirationDate: '23/04/2027',
        rifFiscalAddress: 'Av. Principal 123',
        primaryCedulaId: 'V-10.292.347',
        primaryCedulaFullName: 'YANITZA DEL VALLE RODRIGUEZ ORTIZ',
        primaryCedulaExpirationDate: '20/11/2030',
        companyRecord: {
          companyName: 'EMPRESA DEMO C.A.',
          fiscalAddress: 'Av. Principal 123',
          companyStatus: 'VIGENTE',
          companyExpirationDate: '23/04/2040',
          boardStatus: 'VENCIDA',
          boardExpirationDate: formatDate(boardExpiredRecently),
          boardStatutoryTerm: '3 años',
          boardHoldoverUntilReplaced: 'YES',
          businessSummary: 'Centro medico B2C',
          signatureType: 'SEPARADA',
        },
        representatives: [
          {
            fullName: 'YANITZA DEL VALLE RODRIGUEZ ORTIZ',
            idNumber: 'V-10.292.347',
            signatureType: 'SEPARADA',
            authorityDetails: 'Facultades generales',
            boardStatus: 'VIGENTE',
            signatureValidityProbability: '100',
          },
        ],
        presence: {
          rif: true,
          cedula: true,
          acta_constitutiva: true,
          acta_mercantil: true,
          certificado_emprendimiento: false,
        },
      })
      .map((check) => [check.code, check]),
  );

  assert.equal(checks.BOARD_VALIDITY.status, 'PASSED');
});

test('CrossValidationService fails expired company and excluded activity', () => {
  const service = new CrossValidationService();
  const checks = Object.fromEntries(
    service
      .validate({
        merchantId: 'merchant-excluded',
        legalMode: 'sociedad_mercantil',
        rifNumber: 'J-99999999-9',
        rifCompanyName: 'BAR NOCTURNO DEMO C.A.',
        rifExpirationDate: '23/04/2027',
        rifFiscalAddress: 'Calle 1',
        primaryCedulaId: '',
        primaryCedulaFullName: '',
        primaryCedulaExpirationDate: '',
        companyRecord: {
          companyName: 'BAR NOCTURNO DEMO C.A.',
          fiscalAddress: 'Calle 1',
          companyStatus: 'VENCIDA',
          companyExpirationDate: '01/01/2020',
          boardStatus: 'VIGENTE',
          businessSummary: 'Bar y club nocturno',
          signatureType: 'SEPARADA',
        },
        representatives: [],
        presence: {
          rif: true,
          cedula: false,
          acta_constitutiva: true,
          acta_mercantil: false,
          certificado_emprendimiento: false,
        },
      })
      .map((check) => [check.code, check]),
  );

  assert.equal(checks.COMPANY_VALIDITY.status, 'FAILED');
  assert.equal(checks.BUSINESS_ACTIVITY_ALLOWED.status, 'FAILED');
});

test('CrossValidationService accepts inherited signature authority from older mercantile act', () => {
  const service = new CrossValidationService();
  const snapshot = {
    merchantId: 'merchant-3',
    legalMode: 'sociedad_mercantil',
    rifNumber: 'J-30792505-1',
    rifCompanyName: 'INSTITUTO POPULAR DIAGNOSTICO DE GUARENAS C.A.',
    rifExpirationDate: '23/04/2027',
    primaryCedulaId: 'V-10.292.347',
    primaryCedulaFullName: 'YANITZA DEL VALLE RODRIGUEZ ORTIZ',
    primaryCedulaExpirationDate: '20/11/2030',
    companyRecord: {
      companyName: 'INSTITUTO POPULAR DIAGNOSTICO DE GUARENAS, C.A.',
      fiscalAddress: 'Direccion fiscal',
      sourceDocumentType: 'acta_mercantil',
      sourceDocumentId: 'merc-3',
      sourceDocumentDate: '10/04/2025',
      companyStatus: 'VIGENTE',
      companyExpirationDate: '10/04/2050',
      boardStatus: 'VIGENTE',
      boardSourceDocumentId: 'merc-3',
      boardSourceDocumentDate: '10/04/2025',
      businessSummary: 'Servicios medicos',
      signatureType: 'SEPARADA',
      signatureQuote: 'Firma separada vigente',
      authorityDetails: 'Presidente y Vicepresidente pueden actuar conjunta o separadamente.',
      signatureSourceDocumentId: 'merc-2',
      signatureSourceDocumentDate: '14/08/2002',
    },
    representatives: [
      {
        fullName: 'YANITZA DEL VALLE RODRIGUEZ ORTIZ',
        idNumber: 'V-10.292.347',
        role: 'Presidente',
        sourceDocumentType: 'acta_mercantil',
        sourceDocumentId: 'merc-3',
        sourceDocumentDate: '10/04/2025',
        signatureType: 'SEPARADA',
        signatureQuote: 'Firma separada vigente',
        authorityDetails: 'Presidente y Vicepresidente pueden actuar conjunta o separadamente.',
        signatureValidityProbability: '100',
        boardStatus: 'VIGENTE',
      },
      {
        fullName: 'ALEXIS JOSE RODRIGUEZ ORTIZ',
        idNumber: 'V-6.317.290',
        role: 'Vicepresidente',
        sourceDocumentType: 'acta_mercantil',
        sourceDocumentId: 'merc-3',
        sourceDocumentDate: '10/04/2025',
        signatureType: 'SEPARADA',
        signatureQuote: 'Firma separada vigente',
        authorityDetails: 'Presidente y Vicepresidente pueden actuar conjunta o separadamente.',
        signatureValidityProbability: '100',
        boardStatus: 'VIGENTE',
      },
    ],
    presence: {
      rif: true,
      cedula: true,
      acta_constitutiva: true,
      acta_mercantil: true,
      certificado_emprendimiento: false,
    },
  };

  const checks = Object.fromEntries(
    service.validate(snapshot).map((check) => [check.code, check]),
  );

  assert.equal(checks.BOARD_VALIDITY.status, 'PASSED');
  assert.equal(checks.COMPANY_VALIDITY.status, 'PASSED');
  assert.equal(checks.SIGNATURE_AUTHORITY_PRESENT.status, 'PASSED');
  assert.equal(checks.SIGNATURE_SCHEME_SUPPORTED.status, 'PASSED');
});
