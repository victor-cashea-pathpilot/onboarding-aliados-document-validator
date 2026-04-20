const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MOCK_MODE = 'false';
process.env.GEMINI_MODEL_SIMPLE = 'gemini-simple-test';
process.env.GEMINI_MODEL_COMPLEX = 'gemini-complex-test';
process.env.MAX_EXTRACTION_CONCURRENCY = '2';

const {
  DocumentExtractionService,
} = require('../../../dist/apps/worker/apps/worker/src/document-extraction.service.js');

test('DocumentExtractionService extracts approved simple documents', async () => {
  const service = new DocumentExtractionService(
    {
      async download(url) {
        return {
          url,
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: 'application/pdf',
          contentLength: 3,
        };
      },
    },
    {
      async extractJson(input) {
        assert.equal(input.model, 'gemini-simple-test');
        return {
          rif_number: 'J-12345678-0',
          company_name: 'ALIADO MOCK RIF',
        };
      },
    },
  );

  const documents = {
    rif: [
      {
        document_id: 'rif-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'rif',
          source_url: 'https://example.com/rif.pdf',
          content_type: 'application/pdf',
          content_length: 3,
        },
        errors: [],
      },
    ],
    cedula: [],
    certificado_emprendimiento: [],
    acta_constitutiva: [],
    acta_mercantil: [],
  };

  const updated = await service.extractDocuments(documents, {
    jobId: 'job-1',
    merchantId: 'merchant-1',
    requestId: 'request-1',
  });

  assert.equal(updated.rif[0].status, 'APPROVED');
  assert.equal(updated.rif[0].extracted_data.extraction_status, 'completed');
  assert.equal(updated.rif[0].extracted_data.extraction_model, 'gemini-simple-test');
  assert.equal(typeof updated.rif[0].extracted_data.extraction_started_at, 'string');
  assert.equal(typeof updated.rif[0].extracted_data.extraction_completed_at, 'string');
  assert.equal(typeof updated.rif[0].extracted_data.extraction_duration_ms, 'number');
  assert.match(updated.rif[0].extracted_data.extraction_prompt, /Registro de Información Fiscal/);
  assert.deepEqual(updated.rif[0].extracted_data.extracted_fields, {
    rif_number: 'J-12345678-0',
    company_name: 'ALIADO MOCK RIF',
  });
});

test('DocumentExtractionService marks extraction failures as requires review', async () => {
  const service = new DocumentExtractionService(
    {
      async download(url) {
        return {
          url,
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: 'application/pdf',
          contentLength: 3,
        };
      },
    },
    {
      async extractJson() {
        throw new Error('gemini failed');
      },
    },
  );

  const documents = {
    rif: [],
    cedula: [],
    certificado_emprendimiento: [],
    acta_constitutiva: [],
    acta_mercantil: [
      {
        document_id: 'merc-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'acta_mercantil',
          source_url: 'https://example.com/merc.pdf',
          content_type: 'application/pdf',
          content_length: 3,
        },
        errors: [],
      },
    ],
  };

  const updated = await service.extractDocuments(documents, {
    jobId: 'job-2',
    merchantId: 'merchant-2',
    requestId: null,
  });

  assert.equal(updated.acta_mercantil[0].status, 'REQUIRES_REVIEW');
  assert.equal(updated.acta_mercantil[0].extracted_data.extraction_status, 'failed');
  assert.equal(typeof updated.acta_mercantil[0].extracted_data.extraction_duration_ms, 'number');
  assert.equal(updated.acta_mercantil[0].errors[0].error_code, 'EXTRACTION_FAILED');
});
