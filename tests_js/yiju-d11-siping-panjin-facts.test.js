'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../public/city-official-facts-2025.json');
const {getOfficialFacts,getSummary}=require('../server/utils/officialCityFacts');
const expected=[
 {id:910,name:'四平市',province:'吉林',source:'https://tjj.jl.gov.cn/tjsj/tjgb/ndgb/202609/t20260908_3668990.html',
  values:{gdp_2025_billion_cny:601.6,resident_population_2025_ten_thousand:160.98,
  urban_disposable_income_2025_cny:37047,rural_disposable_income_2025_cny:21766,
  health_institutions_2025_count:1736,healthcare_beds_2025_count:13665,
  eldercare_institutions_2025_count:120,eldercare_beds_2025_count:9864,
  air_quality_good_days_2025_pct:91.78,avg_temperature_2025_c:7.8,
  annual_precipitation_2025_mm:533.9,health_technicians_2025_count:17332}},
 {id:926,name:'盘锦市',province:'辽宁',source:'https://panjin.gov.cn/html/1934/2026-04-14/content-150766.html',
  values:{gdp_2025_billion_cny:1417.6,all_resident_disposable_income_2025_cny:46105,
  urban_disposable_income_2025_cny:52641,rural_disposable_income_2025_cny:27907,
  health_institutions_2025_count:1252,hospital_count_2025:70,
  healthcare_beds_2025_ten_thousand:1.1,
  eldercare_institutions_2025_count:85,residential_social_services_beds_2025_count:5240,
  air_quality_good_days_2025_pct:88.2,pm25_annual_mean_2025_ug_m3:29,
  public_transport_passenger_2025_ten_thousand:2020,registered_population_2025_ten_thousand:127.2}}
];
test('D11 two government bulletins map exactly to existing ranking IDs; 25 facts total',()=>{
 assert.equal(expected.reduce((n,c)=>n+Object.keys(c.values).length,0),25);
 for(const city of expected){
  const src=getOfficialFacts(city.id);
  assert.ok(src);
  assert.equal(src.id,city.id);
  assert.equal(src.name,city.name);
  assert.equal(src.province,city.province);
  assert.equal(src.source_level,'government');
  assert.equal(src.facts.length,Object.keys(city.values).length);
  assert.equal(getSummary(city.id).count,src.facts.length);
  assert.equal(src.sources.length,1);
  assert.equal(src.sources[0].url,city.source);
  assert.deepEqual(src.city_ids,[city.id]);
  assert.equal(src.statistical_year,2025);
  const values=Object.fromEntries(src.facts.map(f=>[f.key,f.value]));
  assert.deepEqual(values,city.values);
  assert.ok(src.facts.every(f=>f.note&&f.unit&&f.source===src.sources[0].key));
  assert.ok(!src.facts.some(f=>['avg_rent','house_price','ranking','medical_facilities'].includes(f.key)));
 }
 const ids=data.cities.flatMap(x=>x.city_ids);
 assert.equal(ids.length,new Set(ids).size);
});
test('citywide / city center and registered / permanent resident population cannot be mixed',()=>{
 const siping=getOfficialFacts(910),panjin=getOfficialFacts(926);
 assert.match(siping.source_level,'government');
 assert.match(panjin.facts.find(x=>x.key==='registered_population_2025_ten_thousand').note,/户籍/);
 assert.ok(!panjin.facts.some(x=>x.key==='resident_population_2025_ten_thousand'));
 assert.match(panjin.facts.find(x=>x.key==='healthcare_beds_2025_ten_thousand').note,/取整/);
 assert.match(siping.facts.find(x=>x.key==='avg_temperature_2025_c').note,/全地区/);
});
