const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DocumentIntakeService,
} = require('../../../dist/apps/worker/apps/worker/src/document-intake.service.js');

test('DocumentIntakeService approves supported PDF documents', async () => {
  const service = new DocumentIntakeService({
    async download(url) {
      return {
        url,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'application/pdf',
        contentLength: 3,
      };
    },
  });

  const record = {
    jobId: 'job-1',
    merchantId: 'merchant-1',
    requestId: 'request-1',
    request: {
      documents: {
        rif: [{ url: 'https://example.com/rif.pdf', document_id: 'rif-1' }],
        cedula: [],
        certificado_emprendimiento: [],
        acta_constitutiva: [],
        acta_mercantil: [],
      },
    },
  };

  const result = await service.buildDocumentsResult(record);
  assert.equal(result.rif[0].document_id, 'rif-1');
  assert.equal(result.rif[0].status, 'APPROVED');
  assert.equal(result.rif[0].confidence, 90);
  assert.equal(result.rif[0].extracted_data.document_type, 'rif');
  assert.equal(result.rif[0].extracted_data.source_url, 'https://example.com/rif.pdf');
  assert.equal(result.rif[0].extracted_data.mock, false);
  assert.equal(result.rif[0].extracted_data.content_type, 'application/pdf');
  assert.equal(result.rif[0].extracted_data.content_length, 3);
  assert.equal(typeof result.rif[0].extracted_data.intake_started_at, 'string');
  assert.equal(typeof result.rif[0].extracted_data.intake_completed_at, 'string');
  assert.equal(typeof result.rif[0].extracted_data.intake_duration_ms, 'number');
  assert.deepEqual(result.rif[0].errors, []);
});

test('DocumentIntakeService rejects invalid URL schemes', async () => {
  const service = new DocumentIntakeService({
    async download() {
      throw new Error('should not download invalid scheme');
    },
  });

  const record = {
    jobId: 'job-2',
    merchantId: 'merchant-2',
    requestId: null,
    request: {
      documents: {
        rif: [],
        cedula: [{ url: 'file:///tmp/cedula.jpg', document_id: 'ced-1' }],
        certificado_emprendimiento: [],
        acta_constitutiva: [],
        acta_mercantil: [],
      },
    },
  };

  const result = await service.buildDocumentsResult(record);
  assert.equal(result.cedula[0].status, 'REJECTED');
  assert.equal(result.cedula[0].errors[0].error_code, 'DOCUMENT_URL_INVALID');
});

test('DocumentIntakeService rejects unsupported content types', async () => {
  const service = new DocumentIntakeService({
    async download(url) {
      return {
        url,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'text/plain',
        contentLength: 3,
      };
    },
  });

  const record = {
    jobId: 'job-3',
    merchantId: 'merchant-3',
    requestId: null,
    request: {
      documents: {
        rif: [],
        cedula: [],
        certificado_emprendimiento: [],
        acta_constitutiva: [{ url: 'https://example.com/acta.txt', document_id: 'acta-1' }],
        acta_mercantil: [],
      },
    },
  };

  const result = await service.buildDocumentsResult(record);
  assert.equal(result.acta_constitutiva[0].status, 'REJECTED');
  assert.equal(
    result.acta_constitutiva[0].errors[0].error_code,
    'DOCUMENT_CONTENT_TYPE_INVALID',
  );
});
