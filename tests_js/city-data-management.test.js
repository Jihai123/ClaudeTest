// Isolated route-level checks. No real customer data or network is used.
// Run: node --test tests_js/city-data-management.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const handlers = {};
  const middleware = [];
  const router = {
    use: (...args) => middleware.push(...args),
    get: (key, fn) => { handlers['GET ' + key] = fn; },
    post: (key, fn) => { handlers['POST ' + key] = fn; }
  };
  const express = function () {};
  express.Router = () => router;
  const city = {
    id: 12, name: '测试市', province: '测试省', avg_rent: 400,
    overall_score: 8.5, layflat_score: 7.2, world_score: 0
  };
  const dimension = { id: 21, city_id: 12, medical: '原医疗说明' };
  let idCounter = 1;
  const changes = [];
  const db = {
    async query(sql) {
      if (sql.includes('PRAGMA table_info(cities)')) {
        return Object.keys(city).map(name => ({ name }));
      }
      if (sql.includes('PRAGMA table_info(city_dimensions)')) {
        return Object.keys(dimension).map(name => ({ name }));
      }
      if (sql.startsWith('SELECT id, name')) return [city];
      if (sql.startsWith('SELECT r.*')) {
        return changes.map(change => ({ ...change, city_name: city.name }));
      }
      throw new Error('unexpected query: ' + sql);
    },
    async get(sql, params) {
      if (sql.startsWith('SELECT * FROM cities')) return Number(params[0]) === city.id ? city : null;
      if (sql.startsWith('SELECT * FROM city_dimensions')) return dimension;
      if (sql.startsWith('SELECT COUNT(*)')) return { total: 1 };
      if (sql.includes('FROM city_data_change_requests WHERE id')) {
        return changes.find(change => change.id === Number(params[0])) || null;
      }
      if (sql.includes('FROM city_data_change_requests WHERE city_id')) {
        return changes.find(change => change.city_id === params[0] &&
          change.field === params[1] && change.status === 'pending') || null;
      }
      throw new Error('unexpected get: ' + sql);
    },
    async run(sql, params = []) {
      if (sql.startsWith('CREATE ') || /^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return {};
      if (sql.startsWith('INSERT INTO city_data_change_requests')) {
        const item = {
          id: idCounter++, city_id: params[0], field: params[1],
          old_value_json: params[2], new_value_json: params[3],
          source_url: params[4], source_date: params[5],
          source_note: params[6], status: 'pending'
        };
        changes.push(item);
        return { id: item.id, changes: 1 };
      }
      if (sql.startsWith('UPDATE cities SET "')) {
        city[sql.match(/"([^"]+)"/)[1]] = params[0];
        return { changes: 1 };
      }
      if (sql.startsWith('UPDATE city_dimensions SET "')) {
        dimension[sql.match(/"([^"]+)"/)[1]] = params[0];
        return { changes: 1 };
      }
      if (sql.startsWith('UPDATE cities SET updated_at')) return { changes: 1 };
      if (sql.startsWith('UPDATE city_data_change_requests SET')) {
        const change = changes.find(item => item.id === params[params.length - 1]);
        change.status = sql.includes("status='approved'") ? 'approved' :
          sql.includes("status='rejected'") ? 'rejected' : 'rolled_back';
        return { changes: 1 };
      }
      throw new Error('unexpected run: ' + sql);
    }
  };
  const source = fs.readFileSync(
    path.join(__dirname, '../server/routes/city-data-management.js'), 'utf8'
  );
  const module = { exports: {} };
  const load = name => {
    if (name === 'express') return express;
    if (name === '../models/database') return db;
    if (name === '../middleware/auth') return { verifyToken() {}, verifyAdmin() {} };
    throw new Error('unexpected require: ' + name);
  };
  const wrapper = new vm.Script(
    '(function(require, module, exports) { ' + source + '\n})'
  ).runInNewContext({ URL, Date, console, Number, Promise, Map, Set });
  wrapper(load, module, module.exports);
  const invoke = async (method, route, body = {}, params = {}, query = {}) => {
    const response = {
      statusCode: 200, payload: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };
    await handlers[method + ' ' + route](
      { user: { id: 9, role: 'admin' }, body, params, query }, response
    );
    return response;
  };
  return { city, dimension, changes, middleware, invoke,
    init: module.exports.initCityDataManagement };
}

test('city changes require evidence and explicit approval; rollback is guarded', async () => {
  const { city, invoke, init, middleware } = setup();
  await init();
  assert.equal(middleware.length, 2, 'route must mount auth and admin middleware');
  const fields = await invoke('GET', '/fields');
  assert.equal(fields.statusCode, 200);
  assert.ok(fields.payload.fields.some(item => item.key === 'avg_rent'));
  assert.ok(!fields.payload.fields.some(item => item.key === 'overall_score'));

  const proposal = {
    city_id: 12, field: 'avg_rent', new_value: 450,
    source_url: 'https://example.org/rents',
    source_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    source_note: '已核实房租来源及口径'
  };
  const submitted = await invoke('POST', '/changes', proposal);
  assert.equal(submitted.statusCode, 201);
  assert.equal(city.avg_rent, 400, 'proposal must never change production data');
  const id = String(submitted.payload.id);

  const duplicate = await invoke('POST', '/changes', proposal);
  assert.equal(duplicate.statusCode, 409);
  const unverified = await invoke('POST', '/changes/:id/approve', {}, { id });
  assert.equal(unverified.statusCode, 400);
  assert.equal(city.avg_rent, 400);

  const accepted = await invoke('POST', '/changes/:id/approve',
    { source_verified: true }, { id });
  assert.equal(accepted.statusCode, 200);
  assert.equal(city.avg_rent, 450);
  assert.equal(city.overall_score, 8.5, 'existing scoring model is untouched');

  const rolled = await invoke('POST', '/changes/:id/rollback', {}, { id });
  assert.equal(rolled.statusCode, 200);
  assert.equal(city.avg_rent, 400);

  const second = await invoke('POST', '/changes', proposal);
  const secondId = String(second.payload.id);
  city.avg_rent = 501; // Simulate another editor updating the live value.
  const conflict = await invoke('POST', '/changes/:id/approve',
    { source_verified: true }, { id: secondId });
  assert.equal(conflict.statusCode, 409);
  assert.equal(city.avg_rent, 501, 'stale proposals must not overwrite live values');

  const rejected = await invoke('POST', '/changes/:id/reject',
    { reason: '缺少来源核实' }, { id: secondId });
  assert.equal(rejected.statusCode, 200);
  assert.equal(city.avg_rent, 501);

  const badSource = await invoke('POST', '/changes',
    { ...proposal, source_url: 'http://localhost/not-public' });
  assert.equal(badSource.statusCode, 400);
});

test('unknown is null, not zero, and change of dimension descriptions is reversible', async () => {
  const { dimension, invoke, init } = setup();
  await init();
  const proposal = {
    city_id: 12, field: 'medical', new_value: null,
    source_url: 'https://example.org/health',
    source_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    source_note: '原字段无可靠来源'
  };
  const draft = await invoke('POST', '/changes', proposal);
  assert.equal(draft.statusCode, 201);
  assert.equal(dimension.medical, '原医疗说明');
  const id = String(draft.payload.id);
  const accepted = await invoke('POST', '/changes/:id/approve',
    { source_verified: true }, { id });
  assert.equal(accepted.statusCode, 200);
  assert.equal(dimension.medical, null);
  const rollback = await invoke('POST', '/changes/:id/rollback', {}, { id });
  assert.equal(rollback.statusCode, 200);
  assert.equal(dimension.medical, '原医疗说明');
});
