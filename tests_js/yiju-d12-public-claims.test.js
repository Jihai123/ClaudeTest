'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sanitizePublicCityClaims}=require('../server/utils/publicCityTrust');
const route=fs.readFileSync(path.join(__dirname,'../server/routes/cities.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/city-detail.html'),'utf8');

test('only specific bad city fields are redacted; database inputs remain unchanged',()=>{
  const cases=[
    [{id:1076,name:'天门市',evaluation:'南岳衡山',slogan:'南岳衡山'},['evaluation','slogan']],
    [{id:1002,name:'丽水市',district:'公阳城区'},['district']],
    [{id:1004,name:'淳安县',district:'乌湖',standard_location:'千岛湖',has_lake:0,evaluation:'西湖美景五月天啊，灵隐寺济公',slogan:'西湖美景五月天啊，灵隐寺济公'},['district','has_lake','evaluation','slogan']]
  ];
  for(const [city,fields] of cases) {
    const original=JSON.stringify(city), output=sanitizePublicCityClaims(city);
    for(const field of fields) assert.equal(output[field],null);
    assert.ok(output.public_data_quality_note);
    assert.equal(JSON.stringify(city),original);
  }
  const correct=sanitizePublicCityClaims({id:1076,evaluation:'湖北天门',slogan:'正常',district:'城区'});
  assert.equal(correct.evaluation,'湖北天门');
  assert.equal(correct.public_data_quality_note,undefined);
  assert.equal(sanitizePublicCityClaims({id:1238,district:'正常'}).district,'正常');
  assert.match(sanitizePublicCityClaims({id:1013,name:'尔勒市'}).public_data_quality_note,/尚未完成核实/);
});
test('public list, featured and detail use same projection and display explanatory notice',()=>{
  assert.match(route,/cities: cities\.map\(sanitizePublicCityClaims\)/);
  assert.match(route,/res\.json\(\{ cities: cities\.map\(sanitizePublicCityClaims\) \}\)/);
  assert.match(route,/\.\.\.sanitizePublicCityClaims\(city\)/);
  assert.match(html,/id="cityTrustNotice"/);
  assert.match(html,/trustNotice\.textContent = cityData\.public_data_quality_note/);
});
