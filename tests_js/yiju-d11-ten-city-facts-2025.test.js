'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../public/city-official-facts-2025.json');
const {getOfficialFacts,getSummary}=require('../server/utils/officialCityFacts');
const expected={
  "917": {
    "name": "白城市",
    "province": "吉林",
    "level": "china_layflat",
    "vals": {
      "gdp_2025_billion_cny": 626.52,
      "resident_population_2025_ten_thousand": 141.86,
      "urban_disposable_income_2025_cny": 33679,
      "rural_disposable_income_2025_cny": 17659,
      "eldercare_institutions_2025_count": 110
    }
  },
  "939": {
    "name": "通辽市",
    "province": "内蒙古",
    "level": "china_layflat",
    "vals": {
      "gdp_2025_billion_cny": 1737.7,
      "resident_population_2025_ten_thousand": 275.2,
      "urbanization_rate_2025_pct": 53.72,
      "elderly_65plus_population_2025_ten_thousand": 43.87,
      "new_urban_jobs_2025_count": 15614
    }
  },
  "943": {
    "name": "哈密市",
    "province": "新疆",
    "level": "china_layflat",
    "vals": {
      "all_resident_disposable_income_2025_cny": 40050,
      "urban_disposable_income_2025_cny": 48647,
      "rural_disposable_income_2025_cny": 27533,
      "health_institutions_2025_count": 389,
      "hospitals_clinics_beds_2025_count": 2755
    }
  },
  "972": {
    "name": "三门峡市",
    "province": "河南",
    "level": "china_layflat",
    "vals": {
      "gdp_2025_billion_cny": 1702.61,
      "resident_population_2025_ten_thousand": 199.5,
      "all_resident_disposable_income_2025_cny": 32469,
      "urban_disposable_income_2025_cny": 40487,
      "rural_disposable_income_2025_cny": 23534
    }
  },
  "1061": {
    "name": "淮南市",
    "province": "安徽",
    "level": "china_layflat",
    "vals": {
      "gdp_2025_billion_cny": 1750.1,
      "resident_population_2025_ten_thousand": 300,
      "urban_disposable_income_2025_cny": 49377,
      "rural_disposable_income_2025_cny": 21385,
      "residential_social_services_2025_count": 162
    }
  },
  "1079": {
    "name": "常德市",
    "province": "湖南",
    "level": "china_layflat",
    "vals": {
      "gdp_2025_billion_cny": 4770.9,
      "resident_population_2025_ten_thousand": 510.7,
      "urban_disposable_income_2025_cny": 45683,
      "rural_disposable_income_2025_cny": 25495,
      "health_institutions_2025_count": 4637
    }
  },
  "1210": {
    "name": "深圳",
    "province": "广东省",
    "level": "china_general",
    "vals": {
      "gdp_2025_billion_cny": 38731.8,
      "resident_population_2025_ten_thousand": 1824.85,
      "urban_resident_population_2025_ten_thousand": 1820.96,
      "all_resident_disposable_income_2025_cny": 84945,
      "urban_employee_medical_insurance_2025_ten_thousand": 1419.37
    }
  },
  "1212": {
    "name": "上海",
    "province": "上海市",
    "level": "china_general",
    "vals": {
      "gdp_2025_billion_cny": 56708.71,
      "resident_population_2025_ten_thousand": 2485.41,
      "all_resident_disposable_income_2025_cny": 91987,
      "urban_disposable_income_2025_cny": 96842,
      "pm25_annual_mean_2025_ug_m3": 26.3
    }
  },
  "1214": {
    "name": "广州",
    "province": "广东省",
    "level": "china_general",
    "vals": {
      "resident_population_2025_ten_thousand": 1910.1,
      "urbanization_rate_2025_pct": 87.56,
      "all_resident_disposable_income_2025_cny": 80591,
      "urban_disposable_income_2025_cny": 86069,
      "rural_disposable_income_2025_cny": 43145
    }
  },
  "1216": {
    "name": "北京",
    "province": "北京市",
    "level": "world",
    "vals": {
      "gdp_2025_billion_cny": 52073.4,
      "resident_population_2025_ten_thousand": 2180,
      "health_institutions_2025_count": 11994,
      "hospital_count_2025": 782,
      "pm25_annual_mean_2025_ug_m3": 27
    }
  }
};
test('D11 10 existing city IDs map to 10 government 2025 bulletins with exactly 50 verified values',()=>{
 assert.equal(Object.keys(expected).length,10);
 assert.equal(Object.values(expected).reduce((a,c)=>a+Object.keys(c.vals).length,0),50);
 const ids=data.cities.flatMap(c=>c.city_ids);
 assert.equal(ids.length,new Set(ids).size,'no duplicate city ID binding');
 assert.equal(data.cities.length,38);
 assert.equal(data.cities.reduce((a,c)=>a+c.facts.length,0),310);
 for(const [id,check] of Object.entries(expected)){
  const c=getOfficialFacts(Number(id));
  assert.ok(c,'missing mapping '+id);
  assert.equal(c.id,Number(id));
  assert.equal(c.name,check.name,id);
  assert.equal(c.province,check.province,id);
  assert.equal(c.statistical_year,2025);
  assert.equal(c.source_level,'government');
  assert.deepEqual(c.city_ids,[Number(id)]);
  assert.equal(data.cities.find(x=>x.id===Number(id)).list_type,check.level);
  assert.equal(c.facts.length,5,id);
  assert.equal(getSummary(Number(id)).count,5,id);
  assert.equal(c.sources.length,1,id);
  assert.ok(/^https:\/\//.test(c.sources[0].url),id);
  assert.ok(c.focus.length>=14&&c.tip.length>=18,id);
  assert.ok(c.facts.every(x=>x.unit&&x.note&&x.source===c.sources[0].key),id);
  const vals=Object.fromEntries(c.facts.map(x=>[x.key,x.value]));
  assert.deepEqual(vals,check.vals,id);
  assert.ok(c.facts.every(x=>!['avg_rent','house_price','rank','medical_facilities'].includes(x.key)),id);
 }
});
test('year, city boundary and income interpretation must stay explicit',()=>{
 for(const id of [943,1061,1079,939,917,972,1216,1212,1214,1210]){
  const c=getOfficialFacts(id);
  assert.match(c.tip,/租|城市|社区|全市|城区|街区|县区|市域|房源|住房|实地|目标/,String(id));
  assert.match(c.policy,/不覆盖原城市数据库/);
 }
 const beijing=getOfficialFacts(1216);
 assert.match(beijing.tip,/世界榜/);
 const shenzhen=getOfficialFacts(1210);
 assert.match(shenzhen.facts.find(x=>x.key==='urban_employee_medical_insurance_2025_ten_thousand').note,/不是/);
 const hami=getOfficialFacts(943);
 assert.match(hami.facts.find(x=>x.key==='hospitals_clinics_beds_2025_count').note,/不等于养老/);
});
