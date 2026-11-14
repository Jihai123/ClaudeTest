const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dataset = JSON.parse(read('public/city-official-facts-2025.json'));
const { getOfficialFacts, getSummary, getLicensedPhoto } =
  require('../server/utils/officialCityFacts');

test('D05 verified city data is 13 source-linked city regions and 71 2025 facts', () => {
  assert.equal(dataset.schema_version, 'yiju.city_official_facts.v2');
  assert.equal(dataset.statistical_year, 2025);
  assert.equal(dataset.cities.length, 13);
  assert.equal(dataset.cities.reduce((sum, c) => sum + c.facts.length, 0), 71);
  const ids = new Set();
  for (const city of dataset.cities) {
    assert.ok(city.focus && city.tip && city.province);
    assert.ok(['government', 'official_bulletin_reprint'].includes(city.source_level));
    for (const id of city.city_ids) {
      assert.ok(!ids.has(id), 'duplicate city id ' + id);
      ids.add(id);
      assert.equal(getSummary(id).count, city.facts.length);
      assert.equal(getOfficialFacts(id).id, city.id);
      assert.equal(getOfficialFacts(id).statistical_year, 2025);
    }
    const sourceMap = new Map(city.sources.map(s => [s.key, s]));
    assert.equal(sourceMap.size, city.sources.length);
    for (const source of city.sources) {
      assert.match(source.url, /^https:\/\/[^ \t\r\n]+/);
      assert.match(source.date, /^2026-\d{2}-\d{2}$/);
    }
    const metrics = new Set();
    for (const f of city.facts) {
      assert.ok(Number.isFinite(f.value), 'invalid numeric value');
      assert.ok(f.unit && f.label && f.note && f.category);
      assert.ok(sourceMap.has(f.source), 'unresolved source key');
      assert.ok(!metrics.has(f.key), 'duplicate metric key for city');
      metrics.add(f.key);
    }
  }
  assert.equal(ids.size, 15, 'two explicitly mapped same-city cross-list aliases');
});

test('original city IDs and cross-ranking alias maps are exact, not fuzzy', () => {
  assert.equal(getOfficialFacts(897).id, 897);
  assert.equal(getOfficialFacts(1502).id, 897);
  assert.equal(getOfficialFacts(965).id, 965);
  assert.equal(getOfficialFacts(1458).id, 965);
  assert.equal(getOfficialFacts(1238).name, '西安市');
  assert.equal(getOfficialFacts(951).name, '张掖市');
  assert.equal(getOfficialFacts(1490), null, 'unverified Zhangye alias cannot inherit facts');
  assert.equal(getOfficialFacts(999999), null);
  assert.equal(getOfficialFacts(1238).facts.find(x => x.key === 'resident_population_2025_ten_thousand').value, 1323.63);
  assert.equal(getOfficialFacts(1238).facts.find(x => x.key === 'gdp_2025_billion_cny').value, 13902.67);
});

test('licensed photo is isolated to empty Xi’an city ID with full attribution', () => {
  const p = getLicensedPhoto(1238);
  assert.ok(p);
  assert.match(p.image_url, /^https:\/\/thumb\.wikimedia\.org\//);
  assert.match(p.source_url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  assert.equal(p.author, 'Ideophagous');
  assert.equal(p.license, 'CC BY-SA 4.0');
  assert.equal(p.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(getLicensedPhoto(897), null, 'do not override existing approved photos');
});

test('public city API exposes supplementary facts without overwriting legacy columns', () => {
  const server = read('server/routes/cities.js');
  assert.match(server, /official_facts: getOfficialFacts\(city\.id\)/);
  assert.match(server, /official_facts_summary = getSummary\(city\.id\)/);
  assert.match(server, /licensed_photo: images\.length \? null : getLicensedPhoto\(city\.id\)/);
  assert.doesNotMatch(read('server/utils/officialCityFacts.js'), /UPDATE cities|UPDATE city_dimensions|setField\(/);
});

test('actual city details show sourced values, citations and CC photo attribution', () => {
  const html = read('public/city-detail.html');
  const js = read('public/city-detail-official.js');
  assert.match(html, /id="officialFactsSection"/);
  assert.match(html, /id="officialFactsBody"/);
  assert.match(html, /id="officialFactsCount"/);
  assert.match(html, /id="licensedPhotoFallback"/);
  assert.match(html, /renderOfficialCityFacts\(cityData\)/);
  assert.match(html, /renderLicensedCityPhoto\(cityData\)/);
  assert.ok(html.indexOf('id="officialFactsSection"') < html.indexOf('id="imageGallery"'));
  assert.match(js, /document\.createElement\(/);
  assert.match(js, /textContent/);
  assert.match(js, /noopener noreferrer/);
  assert.match(js, /source_level === 'official_bulletin_reprint'/);
  assert.match(js, /原有排名、评分、租金估值分开/);
});

test('homepage renders evidence counts and licensed image credits', () => {
  const homepage = read('public/index.html');
  assert.match(homepage, /city\.official_facts_summary\.count/);
  assert.match(homepage, /city\.licensed_photo\.image_url/);
  assert.match(homepage, /city\.licensed_photo\.license_url/);
  assert.match(homepage, /city-card-photo-credit/);
  assert.match(homepage, /e\.target\.closest\('a'\)/);
});

test('admin shows field-change pending count separate from pending new cities', () => {
  const html = read('public/admin.html');
  assert.match(html, /id="statFieldChangesPending"/);
  assert.match(html, /id="statFieldReviewLink"/);
  assert.match(html, /\/admin\/city-data\/changes\?status=pending/);
  assert.match(html, /document\.getElementById\('cityDataStatus'\)\.value = 'pending'/);
});
