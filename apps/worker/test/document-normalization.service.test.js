const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DocumentNormalizationService,
} = require('../../../dist/apps/worker/apps/worker/src/document-normalization.service.js');

test('DocumentNormalizationService builds canonical snapshot from extracted documents', () => {
  const service = new DocumentNormalizationService();
  const documents = {
    rif: [
      {
        document_id: 'rif-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'rif',
          extraction_status: 'completed',
          extracted_fields: {
            rif_number: 'J-41036436-0',
            company_name: 'FREDLOU STILO Y BELLEZA, C.A.',
            fiscal_address: 'Direccion fiscal',
            expiration_date: '22/01/2029',
          },
        },
        errors: [],
      },
    ],
    cedula: [
      {
        document_id: 'ced-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'cedula',
          extraction_status: 'completed',
          extracted_fields: {
            id_number: 'V-12.048.047',
            first_name: 'FREDDY RAMON',
            last_name: 'CONTRERAS DIAZ',
            expiration_date: '31/12/2030',
          },
        },
        errors: [],
      },
    ],
    certificado_emprendimiento: [],
    acta_constitutiva: [
      {
        document_id: 'acta-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'acta_constitutiva',
          extraction_status: 'completed',
          extracted_fields: {
            razon_social: 'FREDLOU STILO Y BELLEZA C.A.',
            registro_mercantil: {
              numero: '15',
              tomo: '54-A',
              fecha_registro: '07/09/2017',
            },
            company_validity: {
              status: 'VIGENTE',
              expiration_date: '07/09/2037',
            },
            business_classification: {
              business_summary: 'Optica y venta minorista B2C',
              line_code: 'LP',
            },
            corporate_structure: {
              board: {
                status: 'VENCIDA',
                expiration_date: '07/09/2022',
                statutory_term: '5 años',
                holdover_until_replaced: 'YES',
                holdover_quote: 'Los directores permanecen en sus cargos hasta ser sustituidos.',
              },
              legal_representative: {
                signature_type: 'SEPARADA',
                signature_quote: 'Texto de firma',
                authority_details: 'Facultades generales',
                representatives: [
                  {
                    full_name: 'FREDDY RAMON CONTRERAS DIAZ',
                    id_number: 'V-12.048.047',
                    specific_role: 'Director',
                    signature_validity_probability: '100',
                  },
                ],
              },
            },
            locations: { fiscal_address: 'Direccion acta' },
          },
        },
        errors: [],
      },
    ],
    acta_mercantil: [],
  };

  const snapshot = service.normalize('merchant-1', documents);

  assert.equal(snapshot.rifNumber, 'J-41036436-0');
  assert.equal(snapshot.primaryCedulaId, 'V-12.048.047');
  assert.equal(snapshot.primaryCedulaPolicyOutcome, 'valid');
  assert.equal(snapshot.companyRecord.companyName, 'FREDLOU STILO Y BELLEZA C.A.');
  assert.equal(snapshot.companyRecord.boardStatus, 'VENCIDA');
  assert.equal(snapshot.companyRecord.businessSummary, 'Optica y venta minorista B2C');
  assert.equal(snapshot.companyRecord.boardStatutoryTerm, '5 años');
  assert.equal(snapshot.companyRecord.boardHoldoverUntilReplaced, 'YES');
  assert.equal(snapshot.representatives[0].idNumber, 'V-12.048.047');
  assert.equal(snapshot.legalMode, 'sociedad_mercantil');
  assert.equal(snapshot.normalizationStatus, 'complete');
});

test('DocumentNormalizationService applies mercantile documents as field-level patches', () => {
  const service = new DocumentNormalizationService();
  const documents = {
    rif: [],
    cedula: [],
    certificado_emprendimiento: [],
    acta_constitutiva: [
      {
        document_id: 'acta-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'acta_constitutiva',
          extraction_status: 'completed',
          extracted_fields: {
            razon_social: 'INSTITUTO POPULAR DIAGNOSTICO DE GUARENAS, C.A.',
            registro_mercantil: { fecha_registro: '05/08/1999' },
            corporate_structure: {
              board: { status: 'VENCIDA', expiration_date: '05/08/2001' },
              legal_representative: {
                representation_clause_modified: 'YES',
                signature_clause_status: 'EXPLICIT',
                signature_type: 'CONJUNTA',
                signature_quote: 'Firma conjunta original',
                authority_details: 'Facultades originales de la constitutiva',
                representatives: [
                  {
                    full_name: 'JOSE RODRIGUEZ ORTIZ',
                    id_number: 'V-11.416.698',
                    specific_role: 'Presidente',
                    signature_validity_probability: '20',
                  },
                ],
              },
            },
          },
        },
        errors: [],
      },
    ],
    acta_mercantil: [
      {
        document_id: 'merc-2',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'acta_mercantil',
          extraction_status: 'completed',
          extracted_fields: {
            registro_mercantil: { fecha_registro: '14/08/2002' },
            corporate_structure: {
              legal_representative: {
                representation_clause_modified: 'YES',
                signature_clause_status: 'EXPLICIT',
                signature_type: 'SEPARADA',
                signature_quote: 'Firma separada vigente',
                authority_details:
                  'Presidente y Vicepresidente pueden actuar conjunta o separadamente.',
                representatives: [
                  {
                    full_name: 'ALEXIS JOSE RODRIGUEZ ORTIZ',
                    id_number: 'V-6.317.290',
                    specific_role: 'Presidente',
                    signature_validity_probability: '100',
                  },
                  {
                    full_name: 'JOSE GREGORIO RODRIGUEZ ORTIZ',
                    id_number: 'V-11.416.698',
                    specific_role: 'Vice-Presidente',
                    signature_validity_probability: '100',
                  },
                ],
              },
            },
          },
        },
        errors: [],
      },
      {
        document_id: 'merc-3',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'acta_mercantil',
          extraction_status: 'completed',
          extracted_fields: {
            registro_mercantil: { fecha_registro: '10/04/2025' },
            corporate_structure: {
              board: { status: 'VIGENTE', expiration_date: '10/04/2030' },
              legal_representative: {
                representation_clause_modified: 'NO',
                signature_clause_status: 'NOT_MODIFIED',
                representatives: [
                  {
                    full_name: 'YANITZA DEL VALLE RODRIGUEZ ORTIZ',
                    id_number: 'V-10.292.347',
                    specific_role: 'Presidente',
                    signature_validity_probability: '100',
                  },
                  {
                    full_name: 'ALEXIS JOSE RODRIGUEZ ORTIZ',
                    id_number: 'V-6.317.290',
                    specific_role: 'Vicepresidente',
                    signature_validity_probability: '100',
                  },
                ],
              },
            },
          },
        },
        errors: [],
      },
    ],
  };

  const snapshot = service.normalize('merchant-2', documents);

  assert.equal(snapshot.companyRecord.sourceDocumentId, 'acta-1');
  assert.equal(snapshot.companyRecord.boardSourceDocumentId, 'merc-3');
  assert.equal(snapshot.companyRecord.signatureSourceDocumentId, 'merc-2');
  assert.equal(snapshot.companyRecord.signatureType, 'SEPARADA');
  assert.equal(snapshot.representatives.length, 2);
});

test('DocumentNormalizationService computes cedula expiration policy metadata', () => {
  const service = new DocumentNormalizationService();
  const past = new Date();
  past.setUTCFullYear(past.getUTCFullYear() - 11);
  const dd = String(past.getUTCDate()).padStart(2, '0');
  const mm = String(past.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(past.getUTCFullYear());

  const documents = {
    rif: [],
    cedula: [
      {
        document_id: 'ced-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'cedula',
          extraction_status: 'completed',
          extracted_fields: {
            id_number: 'V-10.203.041',
            first_name: 'NOMBRE',
            last_name: 'APELLIDO',
            expiration_date: `${dd}/${mm}/${yyyy}`,
          },
        },
        errors: [],
      },
    ],
    certificado_emprendimiento: [],
    acta_constitutiva: [],
    acta_mercantil: [],
  };

  const snapshot = service.normalize('merchant-3', documents);

  assert.equal(snapshot.primaryCedulaIsExpired, true);
  assert.equal(snapshot.primaryCedulaPolicyOutcome, 'expired_over_10_years');
  assert.ok((snapshot.primaryCedulaExpirationYears ?? 0) >= 10);
});
