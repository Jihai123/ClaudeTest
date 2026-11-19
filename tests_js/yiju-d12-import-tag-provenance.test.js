'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../import-layflat-ranking.js'),'utf8');
test('unaudited legacy city imports never synthesize low rent, warm, or cold marketing tags',()=>{
  const begin=script.indexOf('function generateTags(cityData) {');
  const end=script.indexOf('/**\n * 计算躺平评分',begin);
  assert.ok(begin>=0 && end>begin);
  const fn=script.slice(begin,end);
  assert.doesNotMatch(fn,/tags\.push\('(low_rent|warm|cold)'\)/);
  assert.match(fn,/tags\.push\('northeast'\)/);
  assert.match(fn,/缺采样日期|来源/);
});
