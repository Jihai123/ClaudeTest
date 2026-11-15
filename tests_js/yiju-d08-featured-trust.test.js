'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const route=fs.readFileSync(path.join(__dirname,'../server/routes/cities.js'),'utf8');
const home=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
test('unresolved records are editorially excluded without deletion or rank mutation',()=>{
  assert.match(route,/editorialHoldIds = new Set\(\[1023, 1087\]\)/);
  assert.match(route,/if \(editorialHoldIds\.has\(city\.id\)\) continue;/);
  assert.match(route,/!editorialHoldIds\.has\(city\.id\)/);
  assert.match(route,/router\.get\('\/hot'/);
});
test('homepage no longer claims unverified rent is a monthly price or low cost',()=>{
  const begin=home.indexOf('function visibleRent(city)');
  const end=home.indexOf('// ===== Render Functions',begin);
  const fn=home.slice(begin,end);
  assert.match(fn,/租金待核实/);
  assert.doesNotMatch(fn,/toLocaleString/);
  assert.doesNotMatch(home,/tags\.push\('低成本'\)/);
});
