'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
test('homepage suppresses unverified citywide low-rent claims on all city card types', () => {
  const match = html.match(/function visibleCityTags\(city, maxCount\) \{[\s\S]*?\n        \}/);
  assert.ok(match, 'visitor-safe tag filtering function is missing');
  const visibleCityTags = vm.runInNewContext('(' + match[0] + ')');
  const labels = Array.from(visibleCityTags({tags: [
    {tag_key:'low_rent',tag_name:'💰 超低房租'},
    {tag_key:'other',tag_name:'超低房租'},
    {tag_key:'warm',tag_name:'☀️ 温暖气候'},
    {tag_key:'green',tag_name:'🌳 绿化不错'}
  ]}, 3));
  assert.deepEqual(labels, ['☀️ 温暖气候', '🌳 绿化不错']);
  assert.deepEqual(Array.from(visibleCityTags({tags:null}, 2)), []);
  assert.match(html, /const tags = visibleCityTags\(city, 2\)/);
  assert.match(html, /const tags = visibleCityTags\(city, 3\)/);
  assert.match(html, /return \{value: '租金待核实', suffix: ''\}/);
});
