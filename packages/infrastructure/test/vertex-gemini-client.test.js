const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VertexGeminiClient,
} = require('../../../dist/packages/infrastructure/infrastructure/src/clients/vertex-gemini-client.js');

test('VertexGeminiClient parses JSON responses with markdown fences', async () => {
  const fakeClient = {
    models: {
      async generateContent() {
        return {
          text: '```json\n{"ok":true,"source":"gemini"}\n```',
        };
      },
    },
  };

  const client = new VertexGeminiClient(fakeClient);
  const result = await client.analyzeJson({
    model: 'gemini-2.5-pro',
    prompt: 'Analyze',
    payload: { merchantId: 'merchant-1' },
  });

  assert.deepEqual(result, { ok: true, source: 'gemini' });
});
