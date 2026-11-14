// First-visit customer experience regression. Synthetic data: never touch production.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

function apiFixture() {
  const endpoints = {};
  const router = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    router[method] = (route, ...handlers) => { endpoints[method.toUpperCase() + ' ' + route] = handlers.at(-1); };
  }
  const provinces = [
    ...Array(8).fill('云南'), ...Array(2).fill('浙江'),
    ...Array(2).fill('湖北'), ...Array(2).fill('陕西'), ...Array(2).fill('四川')
  ];
  const fixtures = provinces.map((province, i) =>
    ({ id: i + 1, name: '城市' + i, province, avg_rent: 500 + i * 10,
       overall_score: 8, layflat_score: 8 }));
  const queries = [];
  const db = {
    async query(sql, args) {
      if (sql.includes('FROM cities c')) {
        queries.push({ sql, args });
        if (sql.includes('GROUP BY c.id')) return fixtures.slice(0, Number(args.at(-2)));
        return fixtures.slice(0, Number(args.at(-1)));
      }
      if (sql.includes('FROM city_tags')) return [];
      throw Error('Unexpected SQL ' + sql);
    },
    async get(sql) {
      if (sql.includes('COUNT(*) as total FROM cities')) return { total: fixtures.length };
      if (sql.includes('FROM city_images')) return null;
      throw Error('Unexpected get ' + sql);
    },
    async run() { throw Error('Read-only regression must not mutate DB'); }
  };
  const fakeRequire = name => {
    if (name === 'express') return { Router: () => router };
    if (name === '../models/database') return db;
    if (name === '../middleware/auth') return { optionalAuth: (_, __, next) => next(), verifyToken() {} };
    if (name === '../middleware/validator') return {
      validateCity() {}, validateDimensions() {}, validateId() {} };
    if (name === '../utils/sanitize') return { sanitizeObject: x => x };
    if (name === '../utils/officialCityFacts') return {
      getOfficialFacts: () => null, getSummary: id => ({ count: id === 1 ? 3 : 0 }),
      getLicensedPhoto: () => null };
    throw Error('Unexpected dependency ' + name);
  };
  const mod = { exports: {} };
  const compiled = new vm.Script('(function(require,module,exports,console,Date){' +
    source('server/routes/cities.js') + '\n})').runInNewContext();
  compiled(fakeRequire, mod, mod.exports, console, Date);
  async function get(endpoint, query) {
    const handler = endpoints['GET ' + endpoint];
    assert.ok(handler, 'route ' + endpoint);
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; } };
    await handler({ query }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    return res.body;
  }
  return { get, queries };
}

test('2025 city evidence explorer has real data entry, category controls and local shortlist', () => {
  const html = source('public/index.html');
  const js = source('public/city-evidence-explorer.js');
  const css = source('public/city-evidence-explorer.css');
  assert.match(html, /id="evidenceExplorer"/);
  assert.match(html, /id="evidenceExplorerCards"/);
  assert.match(html, /data-evidence-group="income"/);
  assert.match(html, /data-evidence-group="care"/);
  assert.match(html, /data-evidence-group="environment"/);
  assert.match(html, /city-evidence-explorer\.js/);
  assert.match(js, /city-official-facts-2025\.json/);
  assert.match(js, /city\.city_ids\[0\]/);
  assert.match(js, /sourceFor\(city, fact\)/);
  assert.match(js, /localStorage\.setItem\(savedKey/);
  assert.match(js, /textContent/);
  assert.match(css, /evidence-cards/);
  new vm.Script(js, { filename: 'city-evidence-explorer.js' });
  const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(x => x[1]).find(x => x.includes('function renderCities'));
  assert.ok(inline);
  new vm.Script(inline, { filename: 'index-inline.js' });
});

test('filters reach backend; zero/missing values not rendered as credible scores or rent', () => {
  const homepage = source('public/index.html');
  assert.match(homepage, /params\.append\('filters', JSON\.stringify\(activeFilters\)\)/);
  assert.match(homepage, /activeFilters\.features = state\.filters\.features/);
  assert.match(homepage, /function visibleRating\(value\)/);
  assert.match(homepage, /function visibleRent\(city\)/);
  assert.doesNotMatch(homepage, /\u6682\u65e0<\s*span>\/\u6708/);
  assert.match(homepage, /style="\$\{state\.filters\.search \|\| state\.currentList === 'china_layflat'/);
});

test('featured recommendations diversify provinces and return approved photo metadata', async () => {
  const api = apiFixture();
  const result = await api.get('/hot', { type: 'featured', limit: '9' });
  assert.equal(result.cities.length, 9);
  const counts = new Map();
  for (const city of result.cities) {
    counts.set(city.province, (counts.get(city.province) || 0) + 1);
    assert.ok(Object.prototype.hasOwnProperty.call(city, 'cover_image'));
    assert.ok(Object.prototype.hasOwnProperty.call(city, 'official_facts_summary'));
  }
  assert.ok(counts.size >= 4, 'visitors should see more than the top province');
  assert.ok((counts.get('云南') || 0) <= 3, 'only one overflow slot may repeat');
  assert.equal(api.queries[0].args[0], 300, 'larger candidate pool to diversify');
});

test('rent and region filters use bound parameters, not injected SQL strings', async () => {
  const api = apiFixture();
  await api.get('/', {
    list_type: 'china_layflat', page: '1', limit: '12',
    filters: JSON.stringify({rent:'0-1000',region:'华东',features:['elderly_friendly']})
  });
  const item = api.queries.find(x => x.sql.includes('GROUP BY c.id'));
  assert.ok(item);
  assert.match(item.sql, /c\.avg_rent > 0 AND c\.avg_rent >= \? AND c\.avg_rent <= \?/);
  assert.ok(item.args.includes(1000));
  assert.ok(item.args.includes('elderly_friendly'));
  assert.ok(item.args.includes('浙江'));
  assert.doesNotMatch(item.sql, /NaN|undefined/);
});

test('city details never present unknown house-price unit or default fake radar 5s', () => {
  const html = source('public/city-detail.html');
  assert.doesNotMatch(html, /house_price}万\/套/);
  assert.match(html, /历史字段单位待核验/);
  assert.match(html, /城市维度尚未全部核验/);
  assert.doesNotMatch(html, /dimensions\.map\(d => cityData\[d\.key\] \|\| 5\)/);
  const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(x => x[1]).find(x => x.includes('function renderRadarChart'));
  assert.ok(inline);
  new vm.Script(inline, { filename: 'city-detail-inline.js' });
});
