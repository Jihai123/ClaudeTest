// Run via npm run test:city-data. Mocked DB: never touches live data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const TOKEN = 'a'.repeat(48);
const HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');

function harness() {
  const agentHandlers = {}, adminHandlers = {}, agentMiddlewares = [], adminMiddlewares = [];
  const mockRouter = (handlers, middlewares) => ({
    use: (...fns) => middlewares.push(...fns),
    get: (route, fn) => { handlers['GET ' + route] = fn; },
    post: (route, fn) => { handlers['POST ' + route] = fn; }
  });
  const routers = [mockRouter(agentHandlers, agentMiddlewares),
    mockRouter(adminHandlers, adminMiddlewares)];
  const city = { id: 951, name: '张掖市', notes: '旧注释', avg_rent: 300 };
  const evidence = [], changes = [];
  let nextEvidence = 1, nextChange = 1;
  const db = {
    async query(sql, params = []) {
      if (sql.startsWith('SELECT source_url')) {
        return evidence.filter(e => e.city_id === params[0] && e.metric_key === params[1] &&
          e.source_type === 'government' && e.metric_value_json === params[2]);
      }
      if (sql.startsWith('SELECT e.id,e.external_id')) {
        return evidence.filter(e => !params.length || e.city_id === params[0])
          .map(e => ({ ...e, city_name: city.name,
            change_status: changes.find(c => c.id === e.change_request_id)?.status || null }));
      }
      throw new Error('unexpected db.query: ' + sql);
    },
    async get(sql, params = []) {
      if (sql.startsWith('SELECT e.*')) {
        const e = evidence.find(e => e.external_id === params[0]);
        if (!e) return null;
        return { ...e, change_status: changes.find(c => c.id === e.change_request_id)?.status || null };
      }
      if (sql.startsWith('SELECT id FROM city_data_change_requests')) {
        return changes.find(c => c.city_id === params[0] &&
          c.field === params[1] && c.status === 'pending') || null;
      }
      if (sql.startsWith('SELECT COUNT(*) AS total FROM city_data_change_requests')) {
        return { total: changes.filter(c => c.reviewed_by === 0).length };
      }
      throw new Error('unexpected db.get: ' + sql);
    },
    async run(sql, params = []) {
      if (sql.startsWith('CREATE ')) return { changes: 1 };
      if (sql.startsWith('INSERT INTO city_agent_evidence')) {
        const [external_id, payload_hash, city_id, scope_name, source_url,
          source_date, source_note, source_type, source_access, source_excerpt,
          observation_period, metric_key, metric_value_json, metric_unit,
          suggested_field, expected_old_value_json, proposed_value_json, conversion_note] = params;
        evidence.push({ id: nextEvidence++, external_id, payload_hash, city_id, scope_name,
          source_url, source_date, source_note, source_type, source_access, source_excerpt,
          observation_period, metric_key, metric_value_json, metric_unit, suggested_field,
          expected_old_value_json, proposed_value_json, conversion_note,
          change_request_id: null, created_at: '2026-11-10' });
        return { id: nextEvidence - 1, changes: 1 };
      }
      if (sql.startsWith('INSERT INTO city_data_change_requests')) {
        changes.push({ id: nextChange++, city_id: params[0], field: params[1],
          old_value_json: params[2], new_value_json: params[3], source_url: params[4],
          source_date: params[5], source_note: params[6],
          requested_by: params[7], status: 'pending', reviewed_by: null, source_verified_by: null });
        return { id: nextChange - 1, changes: 1 };
      }
      if (sql.startsWith('UPDATE city_agent_evidence')) {
        evidence.find(e => e.id === params[1]).change_request_id = params[0];
        return { changes: 1 };
      }
      if (sql.startsWith('UPDATE city_data_change_requests')) {
        const change = changes.find(c => c.id === params[0]);
        change.status = 'approved';
        change.reviewed_by = 0; // explicit non-human actor
        return { changes: 1 };
      }
      throw new Error('unexpected db.run: ' + sql);
    }
  };
  const cityData = {
    validSource(url, date, note) {
      if (!url.startsWith('https://') || !date || note.length < 5)
        throw Object.assign(new Error('Bad source'), { status: 400 });
    },
    getAvailableFields() {
      return new Map([['notes', { label: '备注', type: 'text' }],
        ['avg_rent', { label: '月租', type: 'number' }]]);
    },
    normalizeValue(field, value) {
      if (value == null) return null;
      if (field === 'avg_rent' && (typeof value !== 'number' || value < 1))
        throw Object.assign(new Error('Bad rent'), { status: 400 });
      if (typeof value !== (field === 'avg_rent' ? 'number' : 'string'))
        throw Object.assign(new Error('Bad type'), { status: 400 });
      return value;
    },
    async cityRecord(id) {
      if (id !== city.id) throw Object.assign(new Error('No city'), { status: 404 });
      return { city, dimensions: {} };
    },
    currentValue(rec, field) { return rec.city[field]; },
    async setField(id, field, value, expected) {
      if (city[field] !== expected) throw new Error('Stale value');
      city[field] = value;
    },
    async queuedTransaction(fn) { return fn(); }
  };
  const exports = { exports: {} };
  const fakeRequire = name => {
    if (name === 'express') return { Router: () => routers.shift() };
    if (name === 'crypto') return crypto;
    if (name === '../models/database') return db;
    if (name === '../middleware/auth') return {
      verifyToken(req, res, next) { next(); }, verifyAdmin(req, res, next) { next(); }
    };
    if (name === './city-data-management') return cityData;
    throw new Error('Unexpected require ' + name);
  };
  const env = { YIJU_AGENT_API_KEY_SHA256: HASH };
  const source = fs.readFileSync(path.join(__dirname, '../server/routes/city-agent-bridge.js'), 'utf8');
  new vm.Script('(function(require, module, exports) {' + source + '\n})')
    .runInNewContext({ console, Buffer, URL, Date, process: { env } })(
      fakeRequire, exports, exports.exports
    );
  async function invoke(method, route, body = {}, params = {}, { admin = false, token = TOKEN, query = {} } = {}) {
    const handlers = admin ? adminHandlers : agentHandlers;
    const middlewares = admin ? adminMiddlewares : agentMiddlewares;
    const req = { method, body, params, query,
      get(header) { return header.toLowerCase() === 'authorization' ? 'Bearer ' + token : undefined; } };
    const res = { statusCode: 200, payload: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.payload = data; return this; } };
    for (const middleware of middlewares) {
      let next = false;
      await middleware(req, res, () => { next = true; });
      if (!next) return res;
    }
    const handler = handlers[method + ' ' + route];
    if (!handler) throw new Error('No handler ' + method + ' ' + route);
    await handler(req, res);
    return res;
  }
  return { invoke, env, evidence, changes, city, agentHandlers, adminMiddlewares,
    init: exports.exports.initAgentCityBridge };
}
function evidenceRecord(external_id = 'zhangye-medical-2025-v1') {
  return { external_id, city_id: 951, scope_name: '张掖市',
    source_url: 'https://www.zhangye.gov.cn/sjfb/tjgb/202606/t20260602_1549566.html',
    source_date: '2026-06-02', source_type: 'government',
    source_access: 'fetched', source_excerpt: '2025年末张掖市全市共有医疗卫生机构1391个，其中医院43个。',
    observation_period: '2025',
    source_note: '已查看统计公报全文；记录医疗机构数量，不等于网站医疗评分。',
    metric_key: 'medical_health_institutions_count', metric_value: 1391, metric_unit: '个' };
}
const proposedText = '2025年相关统计公报披露，城市医疗卫生机构数量已更新，具体统计口径请参阅政府原始来源。';

test('no token, invalid token or missing config cannot enter; agent has no approval route', async () => {
  const x = harness();
  await x.init();
  x.env.YIJU_AGENT_API_KEY_SHA256 = '';
  assert.equal((await x.invoke('GET', '/fields')).statusCode, 503);
  x.env.YIJU_AGENT_API_KEY_SHA256 = HASH;
  assert.equal((await x.invoke('GET', '/fields', {}, {}, { token: 'wrong-token' })).statusCode, 401);
  const fields = await x.invoke('GET', '/fields');
  assert.equal(fields.statusCode, 200);
  assert.ok(fields.payload.fields.some(f => f.key === 'notes'));
  assert.ok(!fields.payload.fields.some(f => f.key === 'medical_facilities'));
  assert.ok(!Object.keys(x.agentHandlers).some(route => /approve|rollback|publish/.test(route)));
  assert.equal(x.adminMiddlewares.length, 2);
});

test('fetched evidence is persisted, idempotent, queryable and unchanged on retry', async () => {
  const x = harness();
  await x.init();
  const p = evidenceRecord();
  let result = await x.invoke('POST', '/submissions', p);
  assert.equal(result.statusCode, 201);
  assert.equal(result.payload.submission_status, 'evidence_only');
  assert.equal(x.evidence.length, 1);
  assert.equal(x.changes.length, 0);
  result = await x.invoke('POST', '/submissions', p);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.replayed, true);
  result = await x.invoke('POST', '/submissions', { ...p, metric_value: 9999 });
  assert.equal(result.statusCode, 409);
  assert.equal(x.evidence.length, 1);
  result = await x.invoke('GET', '/submissions/:external_id', {}, { external_id: p.external_id });
  assert.equal(result.payload.evidence_id, 1);
  const admin = await x.invoke('GET', '/evidence', {}, {}, { admin: true });
  assert.equal(admin.payload.evidence[0].metric_value, 1391);
});

test('source not fetched or social content never creates fields changes; scores are excluded', async () => {
  const x = harness();
  await x.init();
  const p = evidenceRecord();
  const changes = { field: 'notes', new_value: proposedText,
    expected_old_value: '旧注释', conversion_note: '文字来源核对并仅更新备注字段。', auto_apply: true };
  let response = await x.invoke('POST', '/submissions', {
    ...p, source_access: 'search_only', source_excerpt: undefined, proposal: changes });
  assert.equal(response.statusCode, 400);
  response = await x.invoke('POST', '/submissions', {
    ...p, source_type: 'community', proposal: changes });
  assert.equal(response.statusCode, 400);
  response = await x.invoke('POST', '/submissions', {
    ...p, proposal: { ...changes, field: 'medical_facilities' } });
  assert.equal(response.statusCode, 400);
  response = await x.invoke('POST', '/submissions', {
    ...p, proposal: { ...changes, field: 'avg_rent', expected_old_value: 300, new_value: 1391 } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.submission_status, 'pending_manual_review');
  assert.equal(x.city.avg_rent, 300);
});

test('two independent government sources allow only whitelisted editorial auto-apply', async () => {
  const x = harness();
  await x.init();
  x.env.YIJU_AGENT_AUTO_APPLY = 'true';
  const p = evidenceRecord('zhangye-health-first-2025');
  let response = await x.invoke('POST', '/submissions', {
    ...p, metric_key: 'health_count', metric_value: 1391 });
  assert.equal(response.statusCode, 201);
  const second = {
    ...p, external_id: 'zhangye-health-second-2025',
    source_url: 'https://www.stats.gov.cn/sj/zxfb/202602/example.html',
    source_excerpt: '2025年张掖市卫生机构记录作为交叉核验示例；两条来源须经过实际核实。',
    metric_key: 'health_count', metric_value: 1391,
    proposal: { field: 'notes', new_value: proposedText,
      expected_old_value: '旧注释', conversion_note: '官方双来源相同指标，撰写低风险文字备注。',
      auto_apply: true }
  };
  response = await x.invoke('POST', '/submissions', second);
  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.submission_status, 'approved');
  assert.equal(x.city.notes, proposedText);
  assert.equal(x.changes.length, 1);
  assert.equal(x.changes[0].reviewed_by, 0);
  assert.equal(x.changes[0].source_verified_by, null, 'automated must not claim human verification');
  assert.equal(x.changes[0].requested_by, 0);
});

test('same government organization and daily cap do not bypass human review', async () => {
  const x = harness();
  await x.init();
  x.env.YIJU_AGENT_AUTO_APPLY = 'true';
  x.env.YIJU_AGENT_AUTO_APPLY_DAILY_LIMIT = '1';
  const p = evidenceRecord('zhangye-org-1');
  await x.invoke('POST', '/submissions', { ...p, metric_key: 'climate_update' });
  const response = await x.invoke('POST', '/submissions', {
    ...p, external_id: 'zhangye-org-2',
    source_url: 'https://tjj.zhangye.gov.cn/stat/2026.html', metric_key: 'climate_update',
    proposal: { field: 'notes', expected_old_value: '旧注释', new_value: proposedText,
      conversion_note: '两个相同机关的子域名不可算作双来源。',
      auto_apply: true }
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.submission_status, 'pending_manual_review');
  assert.equal(x.city.notes, '旧注释');
});
