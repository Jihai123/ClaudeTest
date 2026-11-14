const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const dataset = JSON.parse(read('public/city-official-facts-2025.json'));
const { getOfficialFacts, getSummary } = require('../server/utils/officialCityFacts');

test('D07 adds four EXACT production city IDs and 30 useful 2025 facts', () => {
  assert.equal(dataset.schema_version, 'yiju.city_official_facts.v2');
  assert.equal(dataset.statistical_year, 2025);
  assert.equal(dataset.cities.length, 20);
  assert.equal(dataset.cities.reduce((acc, c) => acc + c.facts.length, 0), 131);
  const expected = new Map([[927,['本溪市',4]],[971,['鹤壁市',9]],
                            [996,['启东市',8]],[1074,['襄阳市',9]]]);
  for (const [id, [name, count]] of expected) {
    const entry = getOfficialFacts(id);
    assert.ok(entry, 'missing city ' + id);
    assert.equal(entry.name, name);
    assert.equal(entry.facts.length, count);
    assert.deepEqual(getSummary(id).count, count);
    assert.deepEqual(entry.city_ids, [id]);
    assert.equal(entry.statistical_year, 2025);
    assert.match(entry.tip, /租金|房租|房源|旅居|生活/);
    assert.ok(entry.sources.length >= 1);
  }
  assert.equal(getOfficialFacts(927).facts.find(f =>
    f.key === 'gdp_2025_billion_cny').value, 1006);
  assert.equal(getOfficialFacts(971).facts.find(f =>
    f.key === 'urban_disposable_income_2025_cny').value, 43014);
  assert.equal(getOfficialFacts(996).facts.find(f =>
    f.key === 'ltc_insurance_beneficiaries_2025_count').value, 9990);
  assert.equal(getOfficialFacts(1074).facts.find(f =>
    f.key === 'urban_consumption_2025_cny').value, 30030);
});

test('all facts carry provenance, honest admin-region mapping, unique keys and source notes', () => {
  const ids = new Set();
  for (const entry of dataset.cities) {
    assert.ok(entry.tip && entry.focus, entry.name);
    // Some original D05 records predate source_note; only D07 mandates it.
    if ([927, 971, 996, 1074].includes(entry.id)) {
      assert.ok(entry.source_note && entry.source_note.length > 20, entry.name);
    }
    assert.ok(['government', 'official_bulletin_reprint'].includes(entry.source_level));
    const keys = new Set(entry.sources.map(s => s.key));
    assert.equal(keys.size, entry.sources.length);
    for (const source of entry.sources) {
      assert.match(source.url, /^https:\/\/\S+$/);
      assert.match(source.date, /^2026-\d{2}-\d{2}$/);
    }
    for (const f of entry.facts) {
      assert.ok(keys.has(f.source), 'no source for ' + entry.name + '/' + f.key);
      assert.ok(Number.isFinite(f.value), 'non numeric ' + entry.name + '/' + f.key);
      assert.ok(f.note && f.unit && f.label);
    }
    assert.equal(new Set(entry.facts.map(f => f.key)).size, entry.facts.length);
    for (const cityId of entry.city_ids) {
      assert.equal(ids.has(cityId), false, 'duplicate city binding ' + cityId);
      ids.add(cityId);
    }
  }
  assert.equal(ids.size, 22, 'only prior dual-list alias mappings are shared');
});

test('public city decision page compares real 2025 fields and never treats legacy rents as verified', () => {
  const html = read('public/2025-city-living-comparison.html');
  assert.match(html, /鹤壁/);
  assert.match(html, /本溪/);
  assert.match(html, /启东/);
  assert.match(html, /襄阳/);
  assert.match(html, /const targets=\[971,927,996,1074\]/);
  assert.match(html, /city-official-facts-2025\.json/);
  assert.match(html, /urban_consumption_2025_cny/);
  assert.match(html, /medical|health_institutions_2025_count/);
  assert.match(html, /不能|不代表/);
  assert.match(html, /没有核实任何城市的实时“平均房租”/);
  assert.match(html, /textContent/);
  assert.match(html, /noopener noreferrer/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  new vm.Script(scripts[0][1], {filename:'comparison-inline.js'});
  const indexScript = read('public/city-evidence-explorer.js');
  assert.match(indexScript, /2025-city-living-comparison\.html/);
  assert.match(indexScript, /ltc_insurance_beneficiaries_2025_count/);
  new vm.Script(indexScript, {filename:'city-evidence-explorer.js'});
});

test('new selection guide has a discoverable sitemap link', () => {
  assert.match(read('server/routes/sitemap.js'), /\/2025-city-living-comparison\.html/);
});
