const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildActaConstitutivaPrompt,
  buildActaMercantilPrompt,
  buildCertificadoEmprendimientoPrompt,
} = require('../../../dist/apps/worker/apps/worker/src/extraction-prompts.js');

test('buildActaConstitutivaPrompt includes full corporate extraction schema', () => {
  const prompt = buildActaConstitutivaPrompt();

  assert.match(prompt, /"company_validity"/);
  assert.match(prompt, /"business_classification"/);
  assert.match(prompt, /"members_and_roles"/);
  assert.match(prompt, /"representatives"/);
  assert.match(prompt, /"signature_validity_probability"/);
  assert.match(prompt, /"store_addresses"/);
  assert.match(prompt, /"NO_ENCONTRADO"/);
});

test('buildActaMercantilPrompt includes clause modification fields and board schema', () => {
  const prompt = buildActaMercantilPrompt();

  assert.match(prompt, /"representation_clause_modified"/);
  assert.match(prompt, /"signature_clause_status"/);
  assert.match(prompt, /"relevant_changes"/);
  assert.match(prompt, /"members_and_roles"/);
  assert.match(prompt, /"validity_observation"/);
  assert.match(prompt, /"representatives"/);
  assert.match(prompt, /"NO_ENCONTRADO"/);
});

test('buildCertificadoEmprendimientoPrompt includes structured validity and representative schema', () => {
  const prompt = buildCertificadoEmprendimientoPrompt();

  assert.match(prompt, /"document_type": "CERTIFICADO_EMPRENDIMIENTO"/);
  assert.match(prompt, /"calculated_expiration_date"/);
  assert.match(prompt, /"current_status"/);
  assert.match(prompt, /"current_role"/);
  assert.match(prompt, /"signature_validity_probability"/);
  assert.match(prompt, /"store_addresses"/);
});
