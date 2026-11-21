'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../public/city-official-facts-2025.json');
const { getOfficialFacts, getSummary } = require('../server/utils/officialCityFacts');

test('Chunan 2025 county-level facts are independently source linked and do not overwrite legacy scores', () => {
  const city = getOfficialFacts(1004);
  assert.ok(city);
  assert.equal(city.name, '淳安县');
  assert.equal(city.province, '浙江');
  assert.equal(data.cities.find(c => c.id === 1004).list_type, 'china_layflat');
  assert.deepEqual(city.city_ids, [1004]);
  assert.equal(city.source_level, 'official_bulletin_reprint');
  assert.equal(city.sources.length, 1);
  assert.equal(city.sources[0].date, '2026-06-03');
  assert.equal(city.sources[0].url,
    'https://www.qdhnews.com.cn/news/content/2026-06/03/content_9902950.html');
  assert.equal(city.facts.length, 12);
  assert.equal(getSummary(1004).count, 12);
  assert.equal(city.statistical_year, 2025);
  const vals = Object.fromEntries(city.facts.map(f => [f.key, f.value]));
  assert.deepEqual(vals, {
    gdp_2025_billion_cny: 306.10,
    resident_population_2025_ten_thousand: 31.7,
    urbanization_rate_2025_pct: 57.1,
    urban_disposable_income_2025_cny: 61850,
    rural_disposable_income_2025_cny: 31056,
    health_institutions_2025_count: 323,
    county_hospital_count_2025: 4,
    healthcare_beds_2025: 2775,
    eldercare_institutions_2025_count: 19,
    elderly_canteens_2025_count: 358,
    air_quality_compliant_days_2025_count: 353,
    annual_visitors_2025_ten_thousand: 983.5
  });
  assert.ok(city.facts.every(f => f.source === 'chunan2025' && f.unit && f.category && f.note));
  assert.match(data.cities.find(c => c.id === 1004).source_note, /统计局/);
  assert.match(city.tip, /房租/);
  assert.ok(city.facts.every(f => !['avg_rent','house_price','medical_facilities','rank'].includes(f.key)));
});

test('total official city facts include exactly twelve new Chunan entries', () => {
  assert.equal(data.cities.length, 39);
  assert.equal(data.cities.reduce((n, city) => n + city.facts.length, 0), 328);
  const ids = data.cities.flatMap(c => c.city_ids);
  assert.equal(ids.length, new Set(ids).size, 'city ID aliases must stay unique');
});
