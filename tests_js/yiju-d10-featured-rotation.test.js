'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const js = fs.readFileSync(path.join(__dirname, '../public/city-evidence-explorer.js'), 'utf8');
test('featured rotation offers a visitor action without mutating rankings', () => {
  assert.match(js, /rotateFeaturedCities/);
  assert.match(js, /button\.textContent = '换一批城市'/);
  assert.match(js, /heldIds = new Set\(\['1023', '1087'\]\)/);
  assert.match(js, /featuredTrack\.appendChild\(card\)/);
  assert.match(js, /MutationObserver\(apply\)/);
  assert.doesNotMatch(js, /avg_rent\s*=/);
});
