// Read-only unit coverage for the dynamically generated public SEO sitemap.
// No connection to the production database or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function buildRouter({ env = {}, cities = [
  { id: 897, name: '鹤岗市', updated_at: '2025-11-30 03:35:54' },
  { id: 951, name: '张掖市', updated_at: '2025-11-30 03:35:55' }
] } = {}) {
  let endpoint, handler;
  const router = { get(route, cb) { endpoint = route; handler = cb; } };
  const db = {
    async query(sql, args) {
      assert.match(sql, /status = \?/);
      assert.equal(args[0], 'approved');
      return cities;
    }
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../server/routes/sitemap.js'), 'utf8');
  const fakeRequire = name => name === 'express' ? { Router() { return router; } } :
    name === '../models/database' ? db : (() => { throw Error(name); })();
  const factory = new vm.Script('(function(require, module, process, Date, console) {' + source + '\n})')
    .runInNewContext();
  factory(fakeRequire, module, { env }, Date, console);
  assert.equal(module.exports, router);
  return {
    endpoint,
    async get() {
      const headers = {};
      const res = {
        headers,
        statusCode: 200,
        header(name, value) { headers[name] = value; return this; },
        send(value) { this.body = String(value); return this; },
        status(code) { this.statusCode = code; return this; }
      };
      await handler({}, res);
      return res;
    }
  };
}

test('sitemap URL uses canonical Yiju host and W3C valid lastmod dates', async () => {
  const router = buildRouter({ env: { BASE_URL: 'https://tangping.com' } });
  assert.equal(router.endpoint, '/sitemap.xml');
  const response = await router.get();
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['Content-Type'], /application\/xml/);
  assert.match(response.body, /<urlset /);
  assert.match(response.body, /https:\/\/yiju\.zhibeimao\.com\/city-detail\.html\?id=897/);
  assert.match(response.body, /https:\/\/yiju\.zhibeimao\.com\/city-detail\.html\?id=951/);
  assert.doesNotMatch(response.body, /tangping\.com/);
  assert.match(response.body, /<lastmod>2025-11-30<\/lastmod>/);
  assert.equal((response.body.match(/<url>/g) || []).length, 6);
  assert.doesNotMatch(response.body, /admin\.html|\/api\/|token=/);
});

test('SQLite DATETIME lastmod preserves its calendar day and rejects invalid dates', async () => {
  const cities = [
    { id: 100, name: '测试城市', updated_at: '2025-11-30 00:15:00' },
    { id: 101, name: '测试城市二', updated_at: '2025-02-30 03:35:54' }
  ];
  const response = await buildRouter({ cities }).get();
  const first = response.body.match(/<loc>[^<]*id=100<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/);
  const invalid = response.body.match(/<loc>[^<]*id=101<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/);
  assert.ok(first, 'first city entry missing');
  assert.ok(invalid, 'second city entry missing');
  assert.equal(first[1], '2025-11-30', 'SQLite calendar day must not shift when TZ is Asia/Shanghai');
  assert.equal(invalid[1], new Date().toISOString().slice(0, 10), 'invalid calendar date must fall back to today');
});

test('robots advertises a sitemap on the live Yiju domain', () => {
  const robots = fs.readFileSync(path.join(__dirname, '../public/robots.txt'), 'utf8');
  assert.match(robots, /^Sitemap: https:\/\/yiju\.zhibeimao\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /tangping\.com/);
  assert.match(robots, /Disallow: \/api\//);
});

test('explicit staging sitemap host can be configured without editing public robots', async () => {
  const router = buildRouter({ env: { SITEMAP_BASE_URL: 'https://staging.example.org' }, cities: [] });
  const response = await router.get();
  assert.match(response.body, /https:\/\/staging\.example\.org\//);
  assert.equal((response.body.match(/<url>/g) || []).length, 4);
});
