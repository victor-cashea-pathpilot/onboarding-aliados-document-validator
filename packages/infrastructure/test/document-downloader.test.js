const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');

const {
  HttpDocumentDownloader,
} = require('../../../dist/packages/infrastructure/infrastructure/src/http/document-downloader.js');

function withEnv(values, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test('HttpDocumentDownloader downloads bytes and metadata', async () => {
  const server = createServer((_req, res) => {
    const payload = Buffer.from('hello-world');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(payload.length));
    res.end(payload);
  });

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  await withEnv(
    {
      DOWNLOAD_TIMEOUT_SECONDS: '5',
      MAX_DOCUMENT_SIZE_BYTES: '1024',
    },
    async () => {
      const downloader = new HttpDocumentDownloader();
      const result = await downloader.download(
        `http://127.0.0.1:${port}/document.pdf?token=secret`,
      );
      assert.equal(result.mimeType, 'application/pdf');
      assert.equal(result.contentLength, 11);
      assert.equal(Buffer.from(result.bytes).toString('utf8'), 'hello-world');
    },
  );

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('HttpDocumentDownloader rejects oversized documents', async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', '9999');
    res.end('small-body');
  });

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  await withEnv(
    {
      DOWNLOAD_TIMEOUT_SECONDS: '5',
      MAX_DOCUMENT_SIZE_BYTES: '100',
    },
    async () => {
      const downloader = new HttpDocumentDownloader();
      await assert.rejects(
        downloader.download(`http://127.0.0.1:${port}/document.pdf`),
        /Document exceeds max size/,
      );
    },
  );

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});
