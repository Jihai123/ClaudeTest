// Real SQLite + HTTP acceptance tests. Uses only a fresh temporary database and
// explicitly synthetic evidence; never connects to the production service.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('agent bridge SQLite integration', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yiju-agent-test-'));
  process.env.DB_PATH = path.join(directory, 'test.sqlite');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  process.env.YIJU_AGENT_API_KEY_SHA256 = digest;
  process.env.YIJU_AGENT_AUTO_APPLY = 'false';
  process.env.YIJU_AGENT_AUTO_APPLY_DAILY_LIMIT = '1';
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const db = require('../server/models/database');
  const cityData = require('../server/routes/city-data-management');
  const agent = require('../server/routes/city-agent-bridge');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await db.run('PRAGMA foreign_keys=ON');
  await db.init();
  // Optional columns used by the existing public city-list API.
  await db.run('ALTER TABLE cities ADD COLUMN house_price REAL');
  await db.run('ALTER TABLE cities ADD COLUMN climate_desc TEXT');
  await cityData.initCityDataManagement();
  await agent.initAgentCityBridge();
  await db.run("INSERT INTO cities(id,name,province,status,notes,slogan,avg_rent,overall_score,layflat_score,world_score) VALUES(951,'测试城市','测试省','approved','旧备注','旧口号',300,7,8,9)");
  await db.run('INSERT INTO city_dimensions(city_id,medical_facilities) VALUES(951,6)');
  await db.run("INSERT INTO users(id,username,email,password,role) VALUES(1,'testadmin','admin@example.invalid','unused','admin'),(2,'testuser','user@example.invalid','unused','user')");
  const adminToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
  const userToken = jwt.sign({ id: 2 }, process.env.JWT_SECRET);
  const app = express();
  app.use(express.json());
  const prefix = '/api/agent/city-data';
  app.use(prefix, agent.router);
  app.use('/api/admin/city-agent', agent.adminRouter);
  app.use('/api/admin/city-data', cityData.router);
  app.use('/api/cities', require('../server/routes/cities'));
  app.use('/api/rankings', require('../server/routes/rankings'));
  app.use('/api/auth', require('../server/routes/auth'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(url, { method = 'GET', body, key = token } = {}) {
    const response = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json',
        ...(key ? { Authorization: 'Bearer ' + key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  const submit = body => request(prefix + '/submissions', { method: 'POST', body });
  let counter = 0;
  function evidence(overrides = {}) {
    return { external_id: 'fixture-evidence-' + (++counter), city_id: 951,
      scope_name: '测试城市', source_url: 'https://www.zhangye.gov.cn/test-fixture',
      source_date: '2026-01-01', source_type: 'government', source_access: 'fetched',
      source_excerpt: '合成测试材料：2025年该市医疗卫生机构共1391个。',
      observation_period: '2025', source_note: '仅用于隔离测试的合成材料，不是真实证据。',
      metric_key: 'health_institutions', metric_value: 1391, metric_unit: '个', ...overrides };
  }
  function proposal(field = 'notes', old = '旧备注', value = '合成测试材料：2025年该市医疗卫生机构共1391个，仅供隔离测试。') {
    return { field, expected_old_value: old, new_value: value,
      conversion_note: '隔离测试仅验证权限和事务，不发布真实事实。', auto_apply: true };
  }
  function second(overrides = {}) {
    return evidence({ source_url: 'https://www.gansu.gov.cn/test-fixture',
      proposal: proposal(), ...overrides });
  }
  async function reset() {
    await db.run('DELETE FROM city_agent_evidence');
    await db.run('DELETE FROM city_data_change_requests');
    await db.run("UPDATE cities SET notes='旧备注',slogan='旧口号',avg_rent=300 WHERE id=951");
  }
  async function notes() { return (await db.get('SELECT notes FROM cities WHERE id=951')).notes; }

  await t.test('migrations are repeatable on real SQLite', async () => {
    await cityData.initCityDataManagement(); await agent.initAgentCityBridge();
    assert.equal((await db.get('PRAGMA integrity_check')).integrity_check, 'ok');
  });
  await t.test('missing config fails closed; missing/wrong API keys are rejected', async () => {
    delete process.env.YIJU_AGENT_API_KEY_SHA256;
    assert.equal((await request(prefix + '/fields')).status, 503);
    process.env.YIJU_AGENT_API_KEY_SHA256 = digest;
    for (const key of [null, 'b'.repeat(64)]) {
      assert.equal((await request(prefix + '/fields', { key })).status, 401);
    }
  });
  await t.test('machine reads fields, city search, current values and disabled policy', async () => {
    assert.equal((await request(prefix + '/fields')).body.autonomy.enabled, false);
    assert.equal((await request(prefix + '/cities?q=' + encodeURIComponent('测试'))).body.cities[0].id, 951);
    assert.equal((await request(prefix + '/cities/951')).body.values.notes, '旧备注');
  });
  await t.test('machine credential cannot authorize inbox, admin approvals or rollback', async () => {
    assert.equal((await request('/api/admin/city-agent/evidence')).status, 401);
    assert.equal((await request('/api/auth/me')).status, 401);
    for (const action of ['approve', 'rollback']) {
      assert.equal((await request('/api/admin/city-data/changes/1/' + action,
        { method: 'POST', body: {} })).status, 401);
    }
    assert.equal((await request('/api/admin/city-agent/evidence', { key: userToken })).status, 403);
  });
  await t.test('evidence persists, replays idempotently, rejects conflicts and appears in inbox', async () => {
    const body = evidence();
    assert.equal((await submit(body)).status, 201);
    const replay = await submit(body);
    assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
    assert.equal((await submit({ ...body, metric_value: 42 })).status, 409);
    assert.equal((await request(prefix + '/submissions/' + body.external_id)).body.submission_status, 'evidence_only');
    const inbox = await request('/api/admin/city-agent/evidence?city_id=951', { key: adminToken });
    assert.equal(inbox.body.evidence.length, 1);
    assert.equal(inbox.body.evidence[0].metric_value, 1391);
    assert.equal(inbox.body.evidence[0].source_excerpt, body.source_excerpt);
  });
  await t.test('unread/community evidence, scores, scope conflicts and stale values cannot mutate', async () => {
    const cases = [
      evidence({ source_access: 'search_only', proposal: proposal() }),
      evidence({ source_type: 'community', proposal: proposal() }),
      evidence({ proposal: proposal('medical_facilities', 6, 1391) }),
      evidence({ proposal: proposal('tags', null, 'x') }),
      evidence({ scope_name: '其他城市', proposal: proposal() }),
      evidence({ proposal: proposal('notes', '过期值') })
    ];
    for (const body of cases) assert.ok([400, 409].includes((await submit(body)).status));
    assert.equal(await notes(), '旧备注');
  });
  await t.test('auto off creates pending request; duplicate field is rejected', async () => {
    await reset();
    assert.equal((await submit(second())).body.submission_status, 'pending_manual_review');
    assert.equal((await submit(second())).status, 409);
  });
  await t.test('human approval requires verification; audited CAS rollback restores value', async () => {
    const change = await db.get('SELECT id FROM city_data_change_requests');
    const url = '/api/admin/city-data/changes/' + change.id;
    assert.equal((await request(url + '/approve', { method: 'POST', key: adminToken, body: {} })).status, 400);
    assert.equal((await request(url + '/approve', { method: 'POST', key: adminToken, body: { source_verified: true } })).status, 200);
    assert.equal((await request(url + '/rollback', { method: 'POST', key: adminToken, body: {} })).status, 200);
    assert.equal(await notes(), '旧备注');
    assert.equal((await db.get('SELECT status FROM city_data_change_requests')).status, 'rolled_back');
  });
  process.env.YIJU_AGENT_AUTO_APPLY = 'true';
  await t.test('auto on still requires corroboration; numeric fields remain manual', async () => {
    await reset();
    assert.equal((await submit(second())).body.submission_status, 'pending_manual_review');
    await reset(); await submit(evidence());
    assert.equal((await submit(second({ proposal: proposal('avg_rent', 300, 500) }))).body.submission_status, 'pending_manual_review');
  });
  for (const [name, overrides] of [
    ['scope', { scope_name: '另一个县' }],
    ['period', { observation_period: '2010' }],
    ['unit', { metric_unit: '万元' }],
    ['missing period', { observation_period: undefined }]
  ]) {
    await t.test('mismatched corroborating ' + name + ' downgrades to manual', async () => {
      await reset(); await submit(evidence(overrides));
      assert.equal((await submit(second())).body.submission_status, 'pending_manual_review');
      assert.equal(await notes(), '旧备注');
    });
  }
  await t.test('proposal with missing period cannot automatically apply', async () => {
    await reset(); await submit(evidence());
    assert.equal((await submit(second({ observation_period: undefined }))).body.submission_status, 'pending_manual_review');
  });
  for (const value of ['11391', '-1391', '−1391', '1391.5']) {
    await t.test('numeric token ' + value + ' is not corroboration for 1391', async () => {
      await reset(); await submit(evidence({ source_excerpt: '合成测试材料：医疗卫生机构数量为' + value + '个，仅供测试。' }));
      assert.equal((await submit(second())).body.submission_status, 'pending_manual_review');
      assert.equal(await notes(), '旧备注');
    });
    await t.test('numeric token ' + value + ' in proposed text cannot assert 1391', async () => {
      await reset(); await submit(evidence());
      const text = '合成测试材料：该市医疗卫生机构数量为' + value + '个，仅供隔离测试。';
      assert.equal((await submit(second({ proposal: proposal('notes', '旧备注', text) }))).body.submission_status, 'pending_manual_review');
    });
  }
  await t.test('matching evidence auto applies with explicit non-human audit; cap downgrades next change', async () => {
    await reset(); await submit(evidence());
    assert.equal((await submit(second())).body.submission_status, 'approved');
    const row = await db.get('SELECT * FROM city_data_change_requests');
    assert.equal(row.reviewed_by, 0); assert.equal(row.source_verified_by, null);
    assert.equal(await notes(), JSON.parse(row.new_value_json));
    assert.equal((await submit(second({ proposal: proposal('slogan', '旧口号') }))).body.submission_status, 'pending_manual_review');
    assert.equal((await request('/api/admin/city-data/changes/' + row.id + '/rollback',
      { method: 'POST', key: adminToken, body: {} })).status, 200);
    assert.equal(await notes(), '旧备注');
  });
  await t.test('parallel eligible changes cannot exceed daily cap', async () => {
    await reset(); await submit(evidence());
    const results = await Promise.all([submit(second()), submit(second({ proposal: proposal('slogan', '旧口号') }))]);
    assert.equal(results.filter(r => r.body.submission_status === 'approved').length, 1);
    assert.equal(results.filter(r => r.body.submission_status === 'pending_manual_review').length, 1);
  });
  await t.test('SQLite failure rolls back evidence, request and public field atomically', async () => {
    await reset(); await submit(evidence());
    await db.run("CREATE TRIGGER fail_agent BEFORE UPDATE ON city_agent_evidence WHEN NEW.change_request_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected acceptance fault'); END");
    try {
      assert.equal((await submit(second())).status, 500);
      assert.equal((await db.get('SELECT count(*) n FROM city_agent_evidence')).n, 1);
      assert.equal((await db.get('SELECT count(*) n FROM city_data_change_requests')).n, 0);
      assert.equal(await notes(), '旧备注');
    } finally { await db.run('DROP TRIGGER fail_agent'); }
  });
  await t.test('parallel identical submissions create one row and four idempotent replays', async () => {
    await reset(); const body = evidence();
    const results = await Promise.all(Array.from({ length: 5 }, () => submit(body)));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(results.filter(r => r.status === 200 && r.body.replayed).length, 4);
    assert.equal((await db.get('SELECT count(*) n FROM city_agent_evidence')).n, 1);
  });
  await t.test('public city list, detail and rankings still read; scores are unchanged', async () => {
    assert.equal((await request('/api/cities?sort=overall_score&limit=5')).body.cities[0].id, 951);
    assert.equal((await request('/api/cities/951')).status, 200);
    assert.equal((await request('/api/rankings')).body.rankings.length, 3);
    const row = await db.get('SELECT overall_score,layflat_score,world_score FROM cities WHERE id=951');
    assert.deepEqual(row, { overall_score: 7, layflat_score: 8, world_score: 9 });
    assert.equal((await db.get('SELECT medical_facilities FROM city_dimensions WHERE city_id=951')).medical_facilities, 6);
  });
});
