const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const dataset = JSON.parse(read('public/city-official-facts-2025.json'));
const { getOfficialFacts, getSummary } = require('../server/utils/officialCityFacts');

test('D07 retains its four EXACT city mappings after D10 adds Miyun', () => {
  assert.equal(dataset.schema_version, 'yiju.city_official_facts.v2');
  assert.equal(dataset.statistical_year, 2025);
  assert.equal(dataset.cities.length, 37);
  assert.equal(dataset.cities.reduce((acc, c) => acc + c.facts.length, 0), 286);
  const expected = new Map([[927,['本溪市',4]],[971,['鹤壁市',9]],
                            [996,['启东市',8]],[1074,['襄阳市',16]]]);
  for (const [id, [name, count]] of expected) {
    const entry = getOfficialFacts(id);
    assert.ok(entry, 'missing city ' + id);
    assert.equal(entry.name, name);
    assert.equal(entry.facts.length, count);
    assert.deepEqual(getSummary(id).count, count);
    assert.deepEqual(entry.city_ids, [id]);
    assert.equal(entry.statistical_year, 2025);
    assert.match(entry.tip, /租金|房租|房源|旅居|生活/);
    assert.ok(entry.sources.length >= 1);
  }
  assert.equal(getOfficialFacts(927).facts.find(f =>
    f.key === 'gdp_2025_billion_cny').value, 1006);
  assert.equal(getOfficialFacts(971).facts.find(f =>
    f.key === 'urban_disposable_income_2025_cny').value, 43014);
  assert.equal(getOfficialFacts(996).facts.find(f =>
    f.key === 'ltc_insurance_beneficiaries_2025_count').value, 9990);
  assert.equal(getOfficialFacts(1074).facts.find(f =>
    f.key === 'urban_consumption_2025_cny').value, 30030);
});

test('all facts carry provenance, honest admin-region mapping, unique keys and source notes', () => {
  const ids = new Set();
  for (const entry of dataset.cities) {
    assert.ok(entry.tip && entry.focus, entry.name);
    // Some original D05 records predate source_note; only D07 mandates it.
    if ([927, 971, 996, 1074].includes(entry.id)) {
      assert.ok(entry.source_note && entry.source_note.length > 20, entry.name);
    }
    assert.ok(['government', 'official_bulletin_reprint'].includes(entry.source_level));
    const keys = new Set(entry.sources.map(s => s.key));
    assert.equal(keys.size, entry.sources.length);
    for (const source of entry.sources) {
      assert.match(source.url, /^https:\/\/\S+$/);
      assert.match(source.date, /^2026-\d{2}-\d{2}$/);
    }
    for (const f of entry.facts) {
      assert.ok(keys.has(f.source), 'no source for ' + entry.name + '/' + f.key);
      assert.ok(Number.isFinite(f.value), 'non numeric ' + entry.name + '/' + f.key);
      assert.ok(f.note && f.unit && f.label);
    }
    assert.equal(new Set(entry.facts.map(f => f.key)).size, entry.facts.length);
    for (const cityId of entry.city_ids) {
      assert.equal(ids.has(cityId), false, 'duplicate city binding ' + cityId);
      ids.add(cityId);
    }
  }
  assert.equal(ids.size, 39, 'all original aliases plus ten new exact city source mappings');
});

test('public city decision page compares real 2025 fields and never treats legacy rents as verified', () => {
  const html = read('public/2025-city-living-comparison.html');
  assert.match(html, /鹤壁/);
  assert.match(html, /本溪/);
  assert.match(html, /启东/);
  assert.match(html, /襄阳/);
  assert.match(html, /const targets=\[971,927,996,1074\]/);
  assert.match(html, /city-official-facts-2025\.json/);
  assert.match(html, /urban_consumption_2025_cny/);
  assert.match(html, /medical|health_institutions_2025_count/);
  assert.match(html, /不能|不代表/);
  assert.match(html, /没有核实任何城市的实时“平均房租”/);
  assert.match(html, /textContent/);
  assert.match(html, /noopener noreferrer/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  new vm.Script(scripts[0][1], {filename:'comparison-inline.js'});
  const indexScript = read('public/city-evidence-explorer.js');
  assert.match(indexScript, /2025-city-living-comparison\.html/);
  assert.match(indexScript, /hero-city-guide/);
  assert.match(indexScript, /ltc_insurance_beneficiaries_2025_count/);
  new vm.Script(indexScript, {filename:'city-evidence-explorer.js'});
});

test('new selection guide has a discoverable sitemap link', () => {
  assert.match(read('server/routes/sitemap.js'), /\/2025-city-living-comparison\.html/);
  assert.match(read('public/sitemap.xml'), /2025-city-living-comparison\.html/);
});

test('D10 Miyun district 955 has 17 sourced facts with transparent reprint provenance', () => {
  const c = getOfficialFacts(955);
  assert.ok(c);
  assert.equal(c.name, '密云区');
  assert.equal(c.province, '北京');
  assert.deepEqual(c.city_ids, [955]);
  assert.equal(c.facts.length, 17);
  assert.equal(c.source_level, 'official_bulletin_reprint');
  assert.ok(dataset.cities.find(x => x.id === 955).source_note.includes('原始DOC未完整下载复核'));
  const byKey = Object.fromEntries(c.facts.map(f => [f.key, f.value]));
  assert.equal(byKey.resident_population_2025_ten_thousand, 52.2);
  assert.equal(byKey.urban_disposable_income_2025_cny, 63624);
  assert.equal(byKey.health_institutions_2025_count, 570);
  assert.equal(byKey.eldercare_beds_2025_count, 6627);
  assert.equal(byKey.pm25_annual_mean_2025_ug_m3, 23);
  assert.match(c.sources[0].url, /^https:\/\/tjgb\.hongheiku\.com\//);
  assert.match(c.sources[1].url, /^https:\/\/www\.bjmy\.gov\.cn\//);
  assert.ok(c.facts.every(f => f.source === 'miyun_bulletin_2025_reprint'));
  assert.ok(!c.facts.some(f => f.key === 'medical_facilities' || f.key === 'avg_rent'));
});


test('D10 Xiangyang health, eldercare and city-center air readings have transparent reprint origin',()=>{
 const c=getOfficialFacts(1074);
 assert.equal(c.source_level,'official_bulletin_reprint');
 assert.equal(c.facts.length,16);
 assert.match(dataset.cities.find(x=>x.id===1074).source_note,/原件DOCX未完整取得/);
 assert.ok(c.sources.some(x=>x.url==='https://tjgb.hongheiku.com/xjtjgb/xj2020/74464.html'));
 assert.ok(c.sources.some(x=>x.url.includes('tjj.hubei.gov.cn')));
 const rows=Object.fromEntries(c.facts.map(f=>[f.key,f]));
 assert.equal(rows.health_institutions_2025_count.value,4405);
 assert.equal(rows.hospital_count_2025.value,139);
 assert.equal(rows.healthcare_beds_2025_ten_thousand.value,4.49);
 assert.equal(rows.eldercare_institutions_2025_count.value,216);
 assert.equal(rows.eldercare_beds_2025_ten_thousand.value,5.01);
 assert.equal(rows.air_quality_good_days_2025_count.value,290);
 assert.equal(rows.pm25_annual_mean_2025_ug_m3.value,41.3);
 assert.ok(rows.pm25_annual_mean_2025_ug_m3.note.includes('市区'));
 assert.ok(c.facts.every(f=>!['avg_rent','medical_facilities','price','ranking'].includes(f.key)));
 assert.deepEqual(c.city_ids,[1074]);
});


test('D11 Ankang city 1449 has official primary-source 2025 figures without scores or rentals',()=>{
 const c=getOfficialFacts(1449), raw=dataset.cities.find(x=>x.id===1449);
 assert.ok(c&&raw);
 assert.equal(raw.name,'安康市');
 assert.equal(raw.province,'陕西省');
 assert.equal(raw.list_type,'china_general');
 assert.deepEqual(raw.city_ids,[1449]);
 assert.equal(raw.source_level,'government');
 assert.equal(raw.facts.length,15);
 assert.equal(getSummary(1449).count,15);
 assert.equal(raw.sources.length,1);
 assert.equal(raw.sources[0].url,'https://tjj.ankang.gov.cn/Content-2919483.html');
 assert.equal(raw.sources[0].date,'2026-05-26');
 assert.match(raw.source_note,/站内名称“安康”/);
 const facts=Object.fromEntries(raw.facts.map(f=>[f.key,f]));
 const expected={
  gdp_2025_billion_cny:1190.03,resident_population_2025_ten_thousand:242.64,
  urbanization_rate_2025_pct:56.23,all_resident_disposable_income_2025_cny:25730,
  urban_disposable_income_2025_cny:37174,rural_disposable_income_2025_cny:16399,
  health_institutions_2025_count:2742,hospital_count_2025:55,
  healthcare_beds_2025_count:19166,air_quality_good_days_2025_count:352,
  forest_coverage_rate_2025_pct:72,public_eldercare_homes_2025_count:129,
  public_eldercare_beds_2025_count:18484,new_urban_jobs_2025_count:22050,
  airport_passenger_trips_2025_ten_thousand:47.94
 };
 for(const [k,v] of Object.entries(expected))assert.equal(facts[k]?.value,v,k);
 assert.ok(raw.facts.every(f=>f.source===raw.sources[0].key&&f.unit&&f.note));
 assert.ok(!raw.facts.some(f=>['avg_rent','medical_facilities','house_price','rank'].includes(f.key)));
 assert.match(facts.air_quality_good_days_2025_count.note,/中心城区/);
});


test('all-city enrichment batch: Zhoushan 1308 and Shangrao 1365 retain accurate reprint provenance',()=>{
 const cases=[
  {id:1308,name:'舟山市',total:15,population:118.1,gdp:2346.1,medical:749,
   rent:null,url:'https://tjgb.hongheiku.com/djs/71400.html'},
  {id:1365,name:'上饶市',total:16,population:627.1,gdp:3935.9,medical:5974,
   rent:null,url:'https://tjgb.hongheiku.com/xjtjgb/xj2020/71249.html'}
 ];
 for(const e of cases){
  const c=dataset.cities.find(x=>x.id===e.id),api=getOfficialFacts(e.id);
  assert.ok(c&&api);
  assert.equal(c.name,e.name);
  assert.deepEqual(c.city_ids,[e.id]);
  assert.equal(c.source_level,'official_bulletin_reprint');
  assert.equal(c.facts.length,e.total);
  assert.equal(c.sources[0].url,e.url);
  assert.match(c.source_note,/尚未完整读取政府官网原件/);
  assert.equal(c.facts.find(f=>f.key==='resident_population_2025_ten_thousand').value,e.population);
  assert.equal(c.facts.find(f=>f.key==='gdp_2025_billion_cny').value,e.gdp);
  assert.equal(c.facts.find(f=>f.key==='health_institutions_2025_count').value,e.medical);
  assert.ok(c.facts.every(f=>f.source===c.sources[0].key && f.unit && f.note));
  assert.ok(!c.facts.some(f=>['avg_rent','score','ranking','medical_facilities'].includes(f.key)));
  assert.equal(getSummary(e.id).count,e.total);
 }
});


test('Baishan 915 from吉林省统计局 government bulletin stays separate from scores',()=>{
 const c=dataset.cities.find(x=>x.id===915);
 assert.ok(c);
 assert.equal(c.name,'白山市');
 assert.equal(c.province,'吉林省');
 assert.equal(c.list_type,'china_layflat');
 assert.deepEqual(c.city_ids,[915]);
 assert.equal(c.source_level,'government');
 assert.equal(c.sources[0].url,'https://tjj.jl.gov.cn/tjsj/tjgb/ndgb/202609/t20260907_3668512.html');
 assert.equal(c.facts.length,10);
 assert.equal(getSummary(915).count,10);
 const facts=Object.fromEntries(c.facts.map(x=>[x.key,x]));
 assert.equal(facts.gdp_2025_billion_cny.value,590.17);
 assert.equal(facts.resident_population_2025_ten_thousand.value,87.53);
 assert.equal(facts.urban_disposable_income_2025_cny.value,33304);
 assert.equal(facts.rural_disposable_income_2025_cny.value,18078);
 assert.equal(facts.healthcare_beds_2025_count.value,9568);
 assert.ok(c.facts.every(f=>f.source===c.sources[0].key && f.unit && f.note));
 assert.ok(!c.facts.some(f=>['avg_rent','score','medical_facilities','rank'].includes(f.key)));
});
