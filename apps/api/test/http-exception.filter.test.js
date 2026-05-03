const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HttpExceptionFilter,
} = require('../../../dist/apps/api/apps/api/src/filters/http-exception.filter.js');

const { HttpException, HttpStatus } = require('@nestjs/common');

function makeHost({ requestId } = {}) {
  const responseBody = {};
  const responseHeaders = {};
  if (requestId) {
    responseHeaders['X-Request-Id'] = requestId;
  }

  const response = {
    statusCode: null,
    body: null,
    getHeader(name) {
      return responseHeaders[name];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };

  return {
    response,
    host: {
      switchToHttp() {
        return {
          getResponse() {
            return response;
          },
        };
      },
    },
  };
}

test('returns 500 with generic message for unknown errors — no stack trace', () => {
  const filter = new HttpExceptionFilter();
  const { host, response } = makeHost();

  filter.catch(new Error('Something broke internally'), host);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.message, 'An unexpected error occurred.');
  assert.equal('stack' in response.body, false);
  assert.equal('error' in response.body, false);
});

test('returns 500 for thrown non-Error values — no stack trace', () => {
  const filter = new HttpExceptionFilter();
  const { host, response } = makeHost();

  filter.catch('raw string thrown', host);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.message, 'An unexpected error occurred.');
  assert.equal('stack' in response.body, false);
});

test('returns correct status and message for HttpException', () => {
  const filter = new HttpExceptionFilter();
  const { host, response } = makeHost();

  filter.catch(new HttpException('Job not found.', HttpStatus.NOT_FOUND), host);

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.message, 'Job not found.');
  assert.equal('stack' in response.body, false);
});

test('returns 400 with validation errors array from class-validator', () => {
  const filter = new HttpExceptionFilter();
  const { host, response } = makeHost();

  const exception = new HttpException(
    { statusCode: 400, message: ['field is required', 'must be a string'], error: 'Bad Request' },
    HttpStatus.BAD_REQUEST,
  );

  filter.catch(exception, host);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, 'Validation failed.');
  assert.deepEqual(response.body.errors, ['field is required', 'must be a string']);
  assert.equal('stack' in response.body, false);
});

test('propagates X-Request-Id into error response body', () => {
  const filter = new HttpExceptionFilter();
  const { host, response } = makeHost({ requestId: 'req-abc-123' });

  filter.catch(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED), host);

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.requestId, 'req-abc-123');
});

test('omits requestId when header is not set', () => {
  const filter = new HttpExceptionFilter();
  const { host, response } = makeHost();

  filter.catch(new HttpException('Forbidden', HttpStatus.FORBIDDEN), host);

  assert.equal(response.statusCode, 403);
  assert.equal('requestId' in response.body, false);
});
