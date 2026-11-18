'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../public',n),'utf8');

test('unverified historical rent cannot become a visible price, cheapest badge, or JSON-LD price',()=>{
 const detail=read('city-detail.html');
 assert.doesNotMatch(detail,/租金参考：¥\$\{cityData\.avg_rent\}/);
 assert.doesNotMatch(detail,/const rent = cityData\.avg_rent \?/);
 assert.match(detail,/租金：暂无可核实的当地房源样本/);
 assert.match(detail,/"priceRange": null/);
 assert.match(detail,/const rent = '待核实'/);
 const compare=read('city-compare.html');
 assert.doesNotMatch(compare,/const bestRent =/);
 assert.doesNotMatch(compare,/isBestRent/);
 assert.doesNotMatch(compare,/¥\$\{rent/);
 assert.doesNotMatch(compare,/calculateRentScore\(/);
 assert.doesNotMatch(compare,/\{ name: '房租成本'/);
 assert.match(compare,/历史租金未确认样本和统计口径/);
});
test('budget preference no longer ranks cities by unverified avg_rent',()=>{
 const recommend=read('recommend.html');
 const low=recommend.match(/case 'low':([\s\S]*?)break;/);
 assert.ok(low,'budget low clause must remain');
 assert.match(low[1],/china_layflat/);
 assert.doesNotMatch(low[1],/avg_rent/);
 assert.match(low[1],/overall_score/);
 const index=read('index.html');
 assert.match(index,/return \{value: '租金待核实', suffix: ''\}/);
});
test('hidden legacy rent protection does not touch database, official facts or approval paths',()=>{
 const compare=read('city-compare.html');
 const detail=read('city-detail.html');
 assert.match(compare,/查看详情/);
 assert.match(detail,/cityData\.official_facts/);
 assert.doesNotMatch(detail,/fetch\([^\n]*POST[^\n]*avg_rent/);
});
