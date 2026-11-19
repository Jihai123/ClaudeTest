'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const route=fs.readFileSync(path.join(__dirname,'../server/routes/cities.js'),'utf8');
const home=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const { EDITORIAL_HOLD_CITY_IDS, isEditoriallyHeld, sanitizePublicTags } =
  require('../server/utils/publicCityTrust');

test('unverified entities are excluded from both featured selection passes without deleting original records',()=>{
  assert.deepEqual(EDITORIAL_HOLD_CITY_IDS,[1023,1087,1013,1016,1017]);
  for (const id of EDITORIAL_HOLD_CITY_IDS) assert.equal(isEditoriallyHeld({id}),true);
  assert.equal(isEditoriallyHeld({id:1012}),false); // valid 个旧市 is not automatically banned
  assert.equal(isEditoriallyHeld({id:1115}),false);
  assert.match(route,/if \(isEditoriallyHeld\(city\)\) continue;/);
  assert.match(route,/!isEditoriallyHeld\(city\)/);
  assert.match(route,/router\.get\('\/hot'/);
});

test('unverified rent and contradictory climate tags are not promoted, but sourced claims remain intact',()=>{
  const tags=[
    {tag_key:'warm',tag_name:'温暖气候'},
    {tag_key:'cold',tag_name:'寒冷气候'},
    {tag_key:'low_rent',tag_name:'超低房租'},
    {tag_key:'coastal',tag_name:'沿海'}
  ];
  const before=JSON.stringify(tags);
  assert.deepEqual(sanitizePublicTags(tags).map(t=>t.tag_key),['coastal']);
  assert.deepEqual(sanitizePublicTags([{tag_key:'warm'},{tag_key:'coastal'}])
    .map(t=>t.tag_key),['warm','coastal']);
  assert.equal(JSON.stringify(tags),before,'raw DB records must remain unchanged');
  assert.match(route,/city\.tags = sanitizePublicTags\(tags\);/);
  assert.match(route,/tags: sanitizePublicTags\(tags\)/);
});

test('homepage no longer claims unverified rent is a monthly price or low cost',()=>{
  const begin=home.indexOf('function visibleRent(city)');
  const end=home.indexOf('// ===== Render Functions',begin);
  const fn=home.slice(begin,end);
  assert.match(fn,/租金待核实/);
  assert.doesNotMatch(fn,/toLocaleString/);
  assert.doesNotMatch(home,/tags\.push\('低成本'\)/);
});
