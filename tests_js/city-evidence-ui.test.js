// Exercise the existing browser module through its DOM events with controlled
// response ordering. No production data or network is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cities = [
  { id: 1490, name: '张掖', province: '甘肃省', list_type: 'china_general' },
  { id: 951, name: '张掖市', province: '甘肃', list_type: 'china_layflat' },
  { id: 1216, name: '北京', province: '北京', list_type: 'china_general' }
];
const history = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1, city_id: [0, 5].includes(index) ? 1490 : 1216,
  city_name: [0, 5].includes(index) ? '张掖' : '北京',
  scope_name: [0, 5].includes(index) ? '张掖' : '北京',
  metric_key: [0, 5].includes(index) ? 'medical_health_institutions_count' : 'resident_population',
  metric_value: [0, 5].includes(index) ? 1391 : 2183.2, metric_unit: '个',
  source_url: 'https://example.gov.cn/fixture', source_type: 'government',
  source_date: '2026-01-01', source_access: 'fetched', source_note: '历史合成验收材料',
  source_excerpt: '合成原文片段，仅供测试。', change_request_id: null
}));
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.ownText = ''; this.value = ''; this.checked = false; this.style = {}; this.dataset = {}; this.events = {}; }
  set textContent(text) { this.ownText = String(text); this.children = []; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(''); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; this.ownText = ''; }
  addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
  removeAttribute(name) { delete this[name]; }
  fire(name) { for (const handler of this.events[name] || []) handler({ preventDefault() {} }); }
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const nodes = new Map();
  const html = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, new Element('div'));
  const el = id => { assert.ok(nodes.has(id), 'missing DOM node ' + id); return nodes.get(id); };
  el('cityDataField').value = 'notes'; el('cityDataQuery').value = '张掖';
  const calls = [], interceptors = [];
  const api = async endpoint => {
    calls.push(endpoint);
    const intercept = interceptors.findIndex(item => item.match(endpoint));
    if (intercept !== -1) return interceptors.splice(intercept, 1)[0].response.promise;
    if (endpoint.endsWith('/fields')) return { fields: [{ key: 'notes', label: '备注', type: 'text' }] };
    if (endpoint.startsWith('/admin/city-data/cities?')) return { cities };
    if (endpoint.startsWith('/admin/city-data/cities/')) {
      const id = Number(endpoint.split('/').pop());
      return { ...cities.find(c => c.id === id), values: { notes: '旧备注' }, readonly_scores: {} };
    }
    if (endpoint.startsWith('/admin/city-data/changes?')) return { changes: [] };
    if (endpoint.startsWith('/admin/city-agent/evidence')) {
      const id = Number(new URL(endpoint, 'https://example.invalid').searchParams.get('city_id'));
      return { evidence: id ? history.filter(row => row.city_id === id) : history };
    }
    throw Error('unexpected API ' + endpoint);
  };
  const document = { getElementById: el, createElement: tag => new Element(tag),
    addEventListener: (name, fn) => { if (name === 'DOMContentLoaded') document.ready = fn; } };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/city-data-management.js'), 'utf8'), { document, window, api, console });
  document.ready();
  function hold(match) { const response = deferred(); interceptors.push({ match: typeof match === 'string' ? endpoint => endpoint === match : match, response }); return response; }
  function choose(id) {
    const row = el('cityDataList').children.find(row => row.children[0].textContent === String(id));
    assert.ok(row, 'city search row ' + id); row.children[4].children[0].fire('click');
  }
  const ids = () => el('cityAgentEvidenceList').children.map(row => Number(row.dataset.evidenceId)).filter(Number.isFinite);
  const filter = checked => { el('cityAgentEvidenceSelected').checked = checked; el('cityAgentEvidenceSelected').fire('change'); };
  const refresh = () => el('cityAgentEvidenceRefresh').fire('click');
  return { el, calls, hold, choose, ids, filter, refresh, load: () => window.cityDataManagement.load() };
}

test('global historical evidence displays explicit city identities; 951 does not inherit 1490 records', async () => {
  const ui = harness(); await ui.load();
  assert.equal(ui.ids().length, 10);
  assert.match(ui.el('cityAgentEvidenceList').textContent, /证据 #1 \/ 张掖（城市 ID 1490）/);
  assert.match(ui.el('cityDataList').textContent, /张掖 · 综合榜/);
  assert.match(ui.el('cityDataList').textContent, /张掖市 · 躺平榜/);
  ui.choose(951); await settle(); ui.filter(true); await settle();
  assert.deepEqual(ui.ids(), []);
  assert.match(ui.el('cityAgentEvidenceContext').textContent, /城市 ID 951.*张掖市/);
  assert.match(ui.el('cityAgentEvidenceList').textContent, /城市 ID 951（张掖市）暂无关联证据/);
  assert.ok(ui.calls.includes('/admin/city-agent/evidence?city_id=951'));
  ui.choose(1490); await settle(); assert.deepEqual(ui.ids(), [1, 6]);
  for (const id of [1216, 951, 1490, 951, 1490]) {
    ui.choose(id); await settle();
    assert.deepEqual(ui.ids(), id === 1490 ? [1, 6] : id === 951 ? [] : [2, 3, 4, 5, 7, 8, 9, 10]);
  }
  ui.filter(false); await settle(); assert.equal(ui.ids().length, 10);
});
test('checked filter without a city does not silently request the global list', async () => {
  const ui = harness(); await ui.load(); const count = ui.calls.length;
  ui.filter(true); await settle();
  assert.equal(ui.calls.length, count); assert.deepEqual(ui.ids(), []);
  assert.match(ui.el('cityAgentEvidenceList').textContent, /请先.*选择城市/);
});
test('late global evidence and stale errors cannot overwrite the current filtered result', async () => {
  const ui = harness(); await ui.load(); ui.choose(951); await settle();
  const global = ui.hold('/admin/city-agent/evidence'); ui.refresh();
  ui.filter(true); await settle(); global.resolve({ evidence: history }); await settle();
  assert.deepEqual(ui.ids(), []); assert.match(ui.el('cityAgentEvidenceContext').textContent, /951/);
  const old = ui.hold('/admin/city-agent/evidence?city_id=951'); ui.refresh();
  ui.choose(1490); await settle(); old.reject(Error('stale request failure')); await settle();
  assert.deepEqual(ui.ids(), [1, 6]); assert.doesNotMatch(ui.el('cityDataMessage').textContent, /stale/);
});
test('late city detail cannot undo the most recent city selection', async () => {
  const ui = harness(); await ui.load(); ui.filter(true);
  const old = ui.hold('/admin/city-data/cities/1490'); ui.choose(1490);
  ui.choose(951); await settle();
  old.resolve({ ...cities[0], values: { notes: '旧备注' }, readonly_scores: {} }); await settle();
  assert.match(ui.el('cityDataSelectedCity').textContent, /ID 951/);
  assert.deepEqual(ui.ids(), []); assert.doesNotMatch(ui.el('cityAgentEvidenceContext').textContent, /1490/);
});
test('switching cities discards stale evidence and history responses', async () => {
  const ui = harness(); await ui.load(); ui.choose(1490); await settle(); ui.filter(true); await settle();
  const old = ui.hold('/admin/city-agent/evidence?city_id=1490'); ui.refresh();
  ui.el('cityDataOnlySelected').checked = true;
  const changes = ui.hold(endpoint => endpoint.startsWith('/admin/city-data/changes?') && endpoint.includes('city_id=1490'));
  ui.el('cityDataRefresh').fire('click');
  ui.choose(951); await settle();
  old.resolve({ evidence: history.filter(row => row.city_id === 1490) });
  changes.resolve({ changes: [{ id: 99, city_name: '张掖旧响应', field: 'notes', status: 'rejected' }] });
  await settle(); assert.deepEqual(ui.ids(), []);
  assert.doesNotMatch(ui.el('cityDataChanges').textContent, /旧响应/);
});
test('refresh responses render only the latest request, including an empty result', async () => {
  const ui = harness(); await ui.load(); ui.choose(1490); await settle(); ui.filter(true); await settle();
  const first = ui.hold('/admin/city-agent/evidence?city_id=1490'); ui.refresh();
  const second = ui.hold('/admin/city-agent/evidence?city_id=1490'); ui.refresh();
  second.resolve({ evidence: [] }); await settle(); first.resolve({ evidence: history }); await settle();
  assert.deepEqual(ui.ids(), []); assert.match(ui.el('cityAgentEvidenceList').textContent, /1490.*暂无关联证据/);
});
test('late city search cannot replace newer search results', async () => {
  const ui = harness(); await ui.load();
  const old = ui.hold(endpoint => endpoint.startsWith('/admin/city-data/cities?'));
  ui.el('cityDataSearch').fire('submit');
  ui.el('cityDataQuery').value = '北京'; ui.el('cityDataSearch').fire('submit'); await settle();
  old.resolve({ cities: [] }); await settle(); assert.match(ui.el('cityDataList').textContent, /1490/);
});
