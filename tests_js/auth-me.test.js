const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('GET /auth/me uses token verification and returns only current user fields', () => {
  let getPath, middleware, endpoint;
  const verifyToken = function trustedJwtMiddleware() {};
  const router = {
    post() {},
    get(route, ...handlers) {
      if (route === '/me') {
        getPath = route;
        middleware = handlers[0];
        endpoint = handlers[1];
      }
    }
  };
  const fakeRequire = (name) => {
    if (name === 'express') return { Router: () => router };
    if (name === 'bcryptjs') return {};
    if (name === 'jsonwebtoken') return {};
    if (name === '../models/database') return {};
    if (name === '../middleware/validator') return {
      validateRegister: [], validateLogin: []
    };
    if (name === '../middleware/auth') return { verifyToken };
    if (name === '../utils/sanitize') return { sanitizeObject: value => value };
    throw new Error('Unexpected require ' + name);
  };
  const source = fs.readFileSync(
    path.join(__dirname, '../server/routes/auth.js'), 'utf8'
  );
  const module = { exports: {} };
  new vm.Script('(function(require, module, exports) {' + source + '\n})')
    .runInNewContext({ process: { env: {} }, console })(fakeRequire, module, module.exports);

  assert.equal(getPath, '/me');
  assert.equal(middleware, verifyToken, 'JWT must be verified before returning the user');
  let payload;
  endpoint({
    user: { id: 8, username: 'example', email: 'sample@example.org',
      role: 'admin', password: 'not-for-output', secret: 'not-for-output' }
  }, { json(body) { payload = body; } });
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    user: { id: 8, username: 'example', email: 'sample@example.org', role: 'admin' }
  });
});
