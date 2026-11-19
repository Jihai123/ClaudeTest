'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  UNVERIFIED_COASTAL_CITY_IDS,
  sanitizePublicTags,
  sanitizePublicCityClaims
} = require('../server/utils/publicCityTrust');

const route = fs.readFileSync(path.join(__dirname, '../server/routes/cities.js'), 'utf8');

test('disputed inland coastal tags are hidden without mutating raw tag rows', () => {
  assert.deepEqual(UNVERIFIED_COASTAL_CITY_IDS, [1002, 1004]);
  const tags = [
    { id: 1700, tag_key: 'coastal', tag_name: '沿海城市' },
    { id: 1701, tag_key: 'mountain', tag_name: '山居小城' },
    { id: 1702, tag_key: 'warm', tag_name: '温暖气候' }
  ];
  const original = JSON.stringify(tags);
  for (const cityId of UNVERIFIED_COASTAL_CITY_IDS) {
    assert.deepEqual(
      sanitizePublicTags(tags, cityId).map(t => t.tag_key),
      ['mountain', 'warm']
    );
    assert.match(
      sanitizePublicCityClaims({ id: cityId, name: '测试城市' }).public_data_quality_note,
      /沿海城市标签待核实/
    );
  }
  assert.equal(JSON.stringify(tags), original);
  assert.deepEqual(
    sanitizePublicTags(tags, 1238).map(t => t.tag_key),
    ['coastal', 'mountain', 'warm']
  );
  assert.deepEqual(sanitizePublicTags(null, 1002), []);
});

test('all public API response paths apply city-aware tag filtering', () => {
  assert.equal((route.match(/city\.tags = sanitizePublicTags\(tags, city\.id\);/g) || []).length, 2);
  assert.match(route, /tags: sanitizePublicTags\(tags, city\.id\),/);
  assert.match(route, /cities: cities\.map\(sanitizePublicCityClaims\)/);
  assert.match(route, /\.\.\.sanitizePublicCityClaims\(city\)/);
});

test('public coastal and feature filters exclude unsupported coastal claims', () => {
  assert.match(route, /if \(filterObj\.coastal \|\| filterObj\.seaside\)/);
  assert.match(route, /AND c\.id NOT IN \(\$\{UNVERIFIED_COASTAL_CITY_IDS\.join\(','\)\}\)/);
  assert.match(route, /AND NOT \(tag_key = 'coastal' AND city_id IN \(\$\{UNVERIFIED_COASTAL_CITY_IDS\.join\(','\)\}\)\)/);
  // The exclusion is public query behavior only: DB tags and review history stay intact.
  assert.doesNotMatch(route, /DELETE FROM city_tags|UPDATE city_tags/i);
});
