const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CrossValidationLlmService,
} = require('../../../dist/apps/worker/apps/worker/src/cross-validation-llm.service.js');
const {
  LegalAssessmentLlmService,
} = require('../../../dist/apps/worker/apps/worker/src/legal-assessment-llm.service.js');

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test('CrossValidationLlmService mock review escalates failed checks', async () => {
  process.env.MOCK_MODE = 'true';
  const service = new CrossValidationLlmService(
    { analyzeJson: async () => ({}) },
    createLogger(),
  );

  const review = await service.review({
    snapshot: {
      legalMode: 'sociedad_mercantil',
      representatives: [],
      primaryCedulaFullName: '',
    },
    checks: [
      {
        code: 'COMPANY_NAME_MATCH',
        status: 'FAILED',
        message: 'mismatch',
      },
    ],
  });

  assert.equal(review.recommendation, 'REQUIRES_REVIEW');
  assert.equal(review.findings[0].source, 'llm_cross_validation');
});

test('LegalAssessmentLlmService mock review rejects hard invalidity checks', async () => {
  process.env.MOCK_MODE = 'true';
  const service = new LegalAssessmentLlmService(
    { analyzeJson: async () => ({}) },
    createLogger(),
  );

  const review = await service.assess({
    snapshot: { legalMode: 'sociedad_mercantil' },
    checks: [
      {
        code: 'CEDULA_VALIDITY_POLICY',
        status: 'FAILED',
        message: 'expired > 10 years',
      },
    ],
  });

  assert.equal(review.recommendation, 'REJECTED');
  assert.equal(review.findings[0].source, 'llm_legal_assessment');
});
