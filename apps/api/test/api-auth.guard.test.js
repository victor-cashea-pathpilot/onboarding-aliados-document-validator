const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ApiAuthGuard,
} = require('../../../dist/apps/api/apps/api/src/auth/api-auth.guard.js');

function createExecutionContext(headers = {}, controller = function Controller() {}) {
  const handler = function handler() {};
  return {
    getHandler() {
      return handler;
    },
    getClass() {
      return controller;
    },
    switchToHttp() {
      return {
        getRequest() {
          return { headers };
        },
      };
    },
  };
}

test('ApiAuthGuard allows public handlers without credentials', async () => {
  const controller = function PublicController() {};
  const handler = function publicHandler() {};

  const reflector = {
    getAllAndOverride(_key, targets) {
      if (targets.includes(handler)) {
        return true;
      }
      return false;
    },
  };

  const guard = new ApiAuthGuard(reflector, {
    async verify() {
      throw new Error('verify should not be called for public routes');
    },
  });

  const context = {
    getHandler() {
      return handler;
    },
    getClass() {
      return controller;
    },
    switchToHttp() {
      return {
        getRequest() {
          return { headers: {} };
        },
      };
    },
  };

  const result = await guard.canActivate(context);
  assert.equal(result, true);
});

test('ApiAuthGuard rejects protected routes without bearer token when auth is enabled', async () => {
  process.env.API_AUTH_MODE = 'google_oidc';

  const guard = new ApiAuthGuard(
    {
      getAllAndOverride() {
        return false;
      },
    },
    {
      async verify() {
        throw new Error('verify should not be called without a bearer token');
      },
    },
  );

  await assert.rejects(
    () => guard.canActivate(createExecutionContext({ host: 'api.example.com' })),
    /Missing bearer token/,
  );
});

test('ApiAuthGuard accepts a valid static bearer token', async () => {
  process.env.API_AUTH_MODE = 'google_oidc';
  process.env.API_STATIC_BEARER_TOKEN = 'super-secret-token';

  const guard = new ApiAuthGuard(
    {
      getAllAndOverride() {
        return false;
      },
    },
    {
      async verify() {
        throw new Error('verify should not be called for static bearer tokens');
      },
    },
  );

  const request = {
    headers: {
      authorization: 'Bearer super-secret-token',
      host: 'api.example.com',
    },
  };

  const result = await guard.canActivate({
    getHandler() {
      return function handler() {};
    },
    getClass() {
      return function Controller() {};
    },
    switchToHttp() {
      return {
        getRequest() {
          return request;
        },
      };
    },
  });

  assert.equal(result, true);
  assert.deepEqual(request.auth, {
    principal: 'static-bearer',
    type: 'static_bearer',
  });
});

test('ApiAuthGuard verifies Google identity tokens against forwarded audience', async () => {
  process.env.API_AUTH_MODE = 'google_oidc';
  delete process.env.API_STATIC_BEARER_TOKEN;
  delete process.env.API_AUTH_AUDIENCE;
  delete process.env.API_AUTH_AUDIENCES;

  let seenToken = null;
  let seenAudiences = null;
  const guard = new ApiAuthGuard(
    {
      getAllAndOverride() {
        return false;
      },
    },
    {
      async verify(token, audiences) {
        seenToken = token;
        seenAudiences = audiences;
        return {
          email: 'service-account@example.iam.gserviceaccount.com',
          sub: '12345',
        };
      },
    },
  );

  const request = {
    headers: {
      authorization: 'Bearer oidc-token',
      host: 'internal-host',
      'x-forwarded-host': 'api.example.com',
      'x-forwarded-proto': 'https',
    },
  };

  const result = await guard.canActivate({
    getHandler() {
      return function handler() {};
    },
    getClass() {
      return function Controller() {};
    },
    switchToHttp() {
      return {
        getRequest() {
          return request;
        },
      };
    },
  });

  assert.equal(result, true);
  assert.equal(seenToken, 'oidc-token');
  assert.deepEqual(seenAudiences, ['https://api.example.com', 'https://internal-host']);
  assert.deepEqual(request.auth, {
    principal: 'service-account@example.iam.gserviceaccount.com',
    type: 'google_oidc',
  });
});

test('ApiAuthGuard disables auth by default in local environments', async () => {
  delete process.env.API_AUTH_MODE;
  process.env.ENVIRONMENT = 'local';
  delete process.env.API_STATIC_BEARER_TOKEN;

  const guard = new ApiAuthGuard(
    {
      getAllAndOverride() {
        return false;
      },
    },
    {
      async verify() {
        throw new Error('verify should not be called when auth is disabled');
      },
    },
  );

  const result = await guard.canActivate(createExecutionContext());
  assert.equal(result, true);
});
