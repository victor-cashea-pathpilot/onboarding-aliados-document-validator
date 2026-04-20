const test = require('node:test');
const assert = require('node:assert/strict');

const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const {
  JobsService,
} = require('../../../dist/apps/worker/apps/worker/src/jobs.service.js');

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test('JobsService rejects invalid worker token when one is configured', async () => {
  const service = new JobsService(
    {
      async get() {
        throw new Error('should not load job');
      },
    },
    'expected-token',
    createLogger(),
    { buildDocumentsResult: async () => ({}) },
    { extractDocuments: async () => ({}) },
    { normalize: () => ({}) },
    { validate: () => [] },
    { review: async () => ({ recommendation: 'APPROVED', confidence: 88, summary: '', findings: [] }) },
    { assess: async () => ({ recommendation: 'APPROVED', confidence: 89, summary: '', findings: [] }) },
  );

  await assert.rejects(
    () => service.processJob('job-1', 'wrong-token'),
    ForbiddenException,
  );
});

test('JobsService raises not found when the job is missing', async () => {
  const service = new JobsService(
    {
      async get() {
        return null;
      },
    },
    null,
    createLogger(),
    { buildDocumentsResult: async () => ({}) },
    { extractDocuments: async () => ({}) },
    { normalize: () => ({}) },
    { validate: () => [] },
    { review: async () => ({ recommendation: 'APPROVED', confidence: 88, summary: '', findings: [] }) },
    { assess: async () => ({ recommendation: 'APPROVED', confidence: 89, summary: '', findings: [] }) },
  );

  await assert.rejects(() => service.processJob('missing-job', null), NotFoundException);
});

test('JobsService marks pending jobs as processing with initial progress', async () => {
  let updatedRecord = null;
  const repository = {
    async get() {
      return {
        jobId: 'job-123',
        merchantId: 'merchant-1',
        requestId: 'request-1',
        status: 'PENDING',
        pollCount: 0,
        request: {},
        createdAt: '2026-04-16T21:00:00.000Z',
        updatedAt: '2026-04-16T21:00:00.000Z',
      };
    },
    async update(record) {
      updatedRecord = record;
      return record;
    },
  };

  const intakeService = {
    async buildDocumentsResult() {
      return {
        rif: [],
        cedula: [],
        certificado_emprendimiento: [],
        acta_constitutiva: [],
        acta_mercantil: [],
      };
    },
  };
  const extractionService = {
    async extractDocuments(documents) {
      return documents;
    },
  };

  const service = new JobsService(
    repository,
    'expected-token',
    createLogger(),
    intakeService,
    extractionService,
    { normalize: () => ({ legalMode: 'unknown' }) },
    { validate: () => [] },
    { review: async () => ({ recommendation: 'APPROVED', confidence: 88, summary: '', findings: [] }) },
    { assess: async () => ({ recommendation: 'APPROVED', confidence: 89, summary: '', findings: [] }) },
  );
  const response = await service.processJob('job-123', 'expected-token');

  assert.deepEqual(response, {
    job_id: 'job-123',
    status: 'accepted',
    message: 'TypeScript worker accepted the job and updated the initial processing state.',
  });

  assert.equal(updatedRecord.status, 'COMPLETED');
  assert.equal(updatedRecord.progress.stage, 'completed');
  assert.equal(updatedRecord.progress.percentage, 100);
});

test('JobsService leaves non-pending jobs unchanged', async () => {
  let updateCalled = false;
  const existing = {
    jobId: 'job-234',
    merchantId: 'merchant-2',
    requestId: null,
    status: 'PROCESSING',
    pollCount: 0,
    request: {},
    progress: {
      stage: 'document_extraction',
      percentage: 65,
      message: 'Already running.',
    },
    createdAt: '2026-04-16T21:00:00.000Z',
    updatedAt: '2026-04-16T21:01:00.000Z',
  };

  const repository = {
    async get() {
      return existing;
    },
    async update() {
      updateCalled = true;
      throw new Error('should not update');
    },
  };

  const service = new JobsService(
    repository,
    null,
    createLogger(),
    { buildDocumentsResult: async () => ({}) },
    { extractDocuments: async () => ({}) },
    { normalize: () => ({}) },
    { validate: () => [] },
    { review: async () => ({ recommendation: 'APPROVED', confidence: 88, summary: '', findings: [] }) },
    { assess: async () => ({ recommendation: 'APPROVED', confidence: 89, summary: '', findings: [] }) },
  );
  const response = await service.processJob('job-234', null);

  assert.equal(updateCalled, false);
  assert.deepEqual(response, {
    job_id: 'job-234',
    status: 'accepted',
    message: 'TypeScript worker accepted the job and updated the initial processing state.',
  });
});

test('JobsService persists intake document results', async () => {
  const updates = [];
  const repository = {
    async get() {
      return {
        jobId: 'job-345',
        merchantId: 'merchant-3',
        requestId: 'request-3',
        status: 'PENDING',
        pollCount: 0,
        request: {},
        createdAt: '2026-04-16T21:00:00.000Z',
        updatedAt: '2026-04-16T21:00:00.000Z',
      };
    },
    async update(record) {
      updates.push(record);
      return record;
    },
  };

  const intakeDocuments = {
    rif: [
      {
        document_id: 'rif-1',
        status: 'APPROVED',
        confidence: 90,
        extracted_data: {
          document_type: 'rif',
          source_url: 'https://example.com/rif.pdf',
          content_type: 'application/pdf',
          content_length: 123,
        },
        errors: [],
      },
    ],
    cedula: [
      {
        document_id: 'ced-1',
        status: 'REJECTED',
        confidence: 100,
        extracted_data: {
          document_type: 'cedula',
          source_url: 'https://example.com/cedula.jpg',
          content_type: null,
          content_length: null,
        },
        errors: [
          {
            error_code: 'DOCUMENT_DOWNLOAD_FAILED',
            message: 'download failed',
          },
        ],
      },
    ],
    certificado_emprendimiento: [],
    acta_constitutiva: [],
    acta_mercantil: [],
  };

  const service = new JobsService(
    repository,
    null,
    createLogger(),
    { buildDocumentsResult: async () => intakeDocuments },
    {
      async extractDocuments(documents) {
        documents.rif[0].extracted_data.extracted_fields = { rif_number: 'J-12345678-0' };
        documents.rif[0].extracted_data.extraction_status = 'completed';
        return documents;
      },
    },
    {
      normalize() {
        return {
          legalMode: 'sociedad_mercantil',
          companyRecord: { companyName: 'Empresa mock' },
        };
      },
    },
    {
      validate() {
        return [
          {
            code: 'HAS_RIF',
            status: 'PASSED',
            message: 'Se recibió al menos un RIF.',
          },
        ];
      },
    },
    {
      async review() {
        return {
          recommendation: 'APPROVED',
          confidence: 88,
          summary: 'Cross validation OK',
          findings: [],
        };
      },
    },
    {
      async assess() {
        return {
          recommendation: 'APPROVED',
          confidence: 89,
          summary: 'Legal assessment OK',
          findings: [],
        };
      },
    },
  );
  await service.processJob('job-345', null);

  assert.equal(updates.length, 5);
  assert.equal(updates[1].progress.stage, 'document_extraction');
  assert.equal(updates[1].progress.percentage, 65);
  assert.equal(updates[2].progress.stage, 'document_normalization');
  assert.equal(updates[2].progress.percentage, 80);
  assert.equal(updates[3].progress.stage, 'cross_validation');
  assert.equal(updates[3].progress.percentage, 90);
  assert.deepEqual(updates[4].documents, intakeDocuments);
  assert.equal(updates[4].progress.stage, 'completed');
  assert.equal(updates[4].progress.percentage, 100);
  assert.equal(updates[4].normalizedSnapshot.legalMode, 'sociedad_mercantil');
  assert.equal(updates[4].crossValidation.legal_mode, 'sociedad_mercantil');
  assert.equal(updates[4].overallResult.status, 'APPROVED');
  assert.equal(updates[4].crossValidation.llm_cross_validation.recommendation, 'APPROVED');
  assert.equal(updates[4].crossValidation.llm_legal_assessment.recommendation, 'APPROVED');
  assert.equal(updates[4].monitoring.total_duration_ms >= 0, true);
  assert.equal(
    updates[4].monitoring.spans.some((span) => span.id === 'document_extraction'),
    true,
  );
});

test('JobsService downgrades address-only LLM rejection to review when deterministic checks pass', async () => {
  const updates = [];
  const repository = {
    async get() {
      return {
        jobId: 'job-address-review',
        merchantId: 'merchant-address-review',
        requestId: 'request-address-review',
        status: 'PENDING',
        pollCount: 0,
        request: {},
        createdAt: '2026-04-16T21:00:00.000Z',
        updatedAt: '2026-04-16T21:00:00.000Z',
      };
    },
    async update(record) {
      updates.push(record);
      return record;
    },
  };

  const service = new JobsService(
    repository,
    null,
    createLogger(),
    {
      buildDocumentsResult: async () => ({
        rif: [],
        cedula: [],
        certificado_emprendimiento: [],
        acta_constitutiva: [],
        acta_mercantil: [],
      }),
    },
    { extractDocuments: async (documents) => documents },
    {
      normalize() {
        return { legalMode: 'emprendimiento' };
      },
    },
    {
      validate() {
        return [
          { code: 'CEDULA_VALIDITY_POLICY', status: 'SKIPPED', message: 'skip' },
          { code: 'RIF_VALIDITY', status: 'PASSED', message: 'ok' },
          {
            code: 'CEDULA_MATCHES_LEGAL_REPRESENTATIVE',
            status: 'PASSED',
            message: 'ok',
          },
        ];
      },
    },
    {
      async review() {
        return {
          recommendation: 'REJECTED',
          confidence: 80,
          summary: 'reject by address mismatch',
          findings: [
            {
              source: 'llm_cross_validation',
              severity: 'CRITICAL',
              code: 'FISCAL_ADDRESS_MISMATCH',
              message: 'address mismatch',
              relatedChecks: [],
            },
          ],
        };
      },
    },
    {
      async assess() {
        return {
          recommendation: 'REQUIRES_REVIEW',
          confidence: 70,
          summary: 'review by address mismatch',
          findings: [
            {
              source: 'llm_legal_assessment',
              severity: 'WARNING',
              code: 'FISCAL_ADDRESS_MISMATCH',
              message: 'address mismatch',
              relatedChecks: [],
            },
          ],
        };
      },
    },
  );

  await service.processJob('job-address-review', null);

  assert.equal(updates.at(-1).overallResult.status, 'REQUIRES_REVIEW');
});

test('JobsService approves firma personal when only benign metadata warnings remain', async () => {
  const updates = [];
  const repository = {
    async get() {
      return {
        jobId: 'job-firma-approved',
        merchantId: 'merchant-firma-approved',
        requestId: 'request-firma-approved',
        status: 'PENDING',
        pollCount: 0,
        request: {},
        createdAt: '2026-04-16T21:00:00.000Z',
        updatedAt: '2026-04-16T21:00:00.000Z',
      };
    },
    async update(record) {
      updates.push(record);
      return record;
    },
  };

  const service = new JobsService(
    repository,
    null,
    createLogger(),
    {
      buildDocumentsResult: async () => ({
        rif: [],
        cedula: [],
        certificado_emprendimiento: [],
        acta_constitutiva: [],
        acta_mercantil: [],
      }),
    },
    { extractDocuments: async (documents) => documents },
    {
      normalize() {
        return { legalMode: 'firma_personal' };
      },
    },
    {
      validate() {
        return [
          { code: 'CEDULA_VALIDITY_POLICY', status: 'SKIPPED', message: 'skip' },
          { code: 'RIF_VALIDITY', status: 'PASSED', message: 'ok' },
          {
            code: 'CEDULA_MATCHES_LEGAL_REPRESENTATIVE',
            status: 'PASSED',
            message: 'ok',
          },
          { code: 'SIGNATURE_AUTHORITY_PRESENT', status: 'PASSED', message: 'ok' },
        ];
      },
    },
    {
      async review() {
        return {
          recommendation: 'REQUIRES_REVIEW',
          confidence: 75,
          summary: 'minor review',
          findings: [
            {
              source: 'llm_cross_validation',
              severity: 'WARNING',
              code: 'ADDRESS_MISMATCH',
              message: 'address mismatch',
              relatedChecks: [],
            },
            {
              source: 'llm_cross_validation',
              severity: 'INFO',
              code: 'INCOMPLETE_ID_DATA',
              message: 'missing expiration',
              relatedChecks: ['CEDULA_VALIDITY_POLICY'],
            },
          ],
        };
      },
    },
    {
      async assess() {
        return {
          recommendation: 'REQUIRES_REVIEW',
          confidence: 85,
          summary: 'minor review',
          findings: [
            {
              source: 'llm_legal_assessment',
              severity: 'WARNING',
              code: 'INCOMPLETE_IDENTITY_DATA',
              message: 'missing expiration',
              relatedChecks: ['CEDULA_VALIDITY_POLICY'],
            },
            {
              source: 'llm_legal_assessment',
              severity: 'INFO',
              code: 'INCONSISTENT_ADDRESS_MINOR',
              message: 'minor address mismatch',
              relatedChecks: [],
            },
          ],
        };
      },
    },
  );

  await service.processJob('job-firma-approved', null);

  assert.equal(updates.at(-1).overallResult.status, 'APPROVED');
});
