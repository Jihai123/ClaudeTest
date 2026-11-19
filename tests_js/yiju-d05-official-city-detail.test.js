const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dataset = JSON.parse(read('public/city-official-facts-2025.json'));
const { getOfficialFacts, getSummary, getLicensedPhoto } =
  require('../server/utils/officialCityFacts');

test('D05/D07/D10 baseline plus Xiangyang expansion: 37 city regions and 290 sourced 2025 facts', () => {
  assert.equal(dataset.schema_version, 'yiju.city_official_facts.v2');
  assert.equal(dataset.statistical_year, 2025);
  assert.equal(dataset.cities.length, 37);
  assert.equal(dataset.cities.reduce((sum, c) => sum + c.facts.length, 0), 290);
  const ids = new Set();
  for (const city of dataset.cities) {
    assert.ok(city.focus && city.tip && city.province);
    assert.ok(['government', 'official_bulletin_reprint'].includes(city.source_level));
    for (const id of city.city_ids) {
      assert.ok(!ids.has(id), 'duplicate city id ' + id);
      ids.add(id);
      assert.equal(getSummary(id).count, city.facts.length);
      assert.equal(getOfficialFacts(id).id, city.id);
      assert.equal(getOfficialFacts(id).statistical_year, 2025);
    }
    const sourceMap = new Map(city.sources.map(s => [s.key, s]));
    assert.equal(sourceMap.size, city.sources.length);
    for (const source of city.sources) {
      assert.match(source.url, /^https:\/\/[^ \t\r\n]+/);
      assert.match(source.date, /^2026-\d{2}-\d{2}$/);
    }
    const metrics = new Set();
    for (const f of city.facts) {
      assert.ok(Number.isFinite(f.value), 'invalid numeric value');
      assert.ok(f.unit && f.label && f.note && f.category);
      assert.ok(sourceMap.has(f.source), 'unresolved source key');
      assert.ok(!metrics.has(f.key), 'duplicate metric key for city');
      metrics.add(f.key);
    }
  }
  assert.equal(ids.size, 39, 'add ten unique exact city IDs, preserve all existing aliases');
});

test('original city IDs and cross-ranking alias maps are exact, not fuzzy', () => {
  assert.equal(getOfficialFacts(897).id, 897);
  assert.equal(getOfficialFacts(1502).id, 897);
  assert.equal(getOfficialFacts(965).id, 965);
  assert.equal(getOfficialFacts(1458).id, 965);
  assert.equal(getOfficialFacts(1238).name, '西安市');
  assert.equal(getOfficialFacts(1247).facts.length, 10, 'Fuzhou source-backed medical and incomes');
  assert.equal(getOfficialFacts(1232).facts.length, 10, 'Ningbo sourced eldercare and medical');
  assert.equal(getOfficialFacts(1232).source_level, 'official_bulletin_reprint');
  assert.equal(getOfficialFacts(1236).facts.length, 10, 'Jinan sourced transit and environment');

  assert.equal(getOfficialFacts(951).name, '张掖市');
  assert.equal(getOfficialFacts(1490), null, 'unverified Zhangye alias cannot inherit facts');
  assert.equal(getOfficialFacts(999999), null);
  assert.equal(getOfficialFacts(1238).facts.find(x => x.key === 'resident_population_2025_ten_thousand').value, 1323.63);
  assert.equal(getOfficialFacts(1238).facts.find(x => x.key === 'gdp_2025_billion_cny').value, 13902.67);
});

test('licensed photo is isolated to empty Xi’an city ID with full attribution', () => {
  const p = getLicensedPhoto(1238);
  assert.ok(p);
  assert.match(p.image_url, /^https:\/\/thumb\.wikimedia\.org\//);
  assert.match(p.source_url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  assert.equal(p.author, 'Ideophagous');
  assert.equal(p.license, 'CC BY-SA 4.0');
  assert.equal(p.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(getLicensedPhoto(897), null, 'do not override existing approved photos');
});

test('Miyun 955 uses a Commons CC BY-SA real-photo fallback without overriding approved images', () => {
  const photo = getLicensedPhoto(955);
  assert.ok(photo);
  assert.match(photo.image_url, /^https:\/\/thumb\.wikimedia\.org\/.*Miyun_Reservoir_2019\.jpg/);
  assert.equal(photo.author, 'Shizhao');
  assert.equal(photo.license, 'CC BY-SA 4.0');
  assert.equal(photo.source_url, 'https://commons.wikimedia.org/wiki/File:Miyun_Reservoir_2019.jpg');
  assert.equal(photo.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(photo.changed, false);
  assert.match(photo.caption, /密云水库/);
  assert.equal(getLicensedPhoto(897), null, 'do not replace city gallery images');
});

test('sitewide photo candidates: 16 exact city IDs, real Commons place and license',()=>{
 const expected=[
  [1449,'Liuxingy',/安康水电站/,/安康市汉江瀛湖/],
  [971,'Amazingloong',/鹤壁东站/,/鹤壁东站/],
  [1063,'EditQ',/安徽黄山市街景/,/黄山市街景/],
  [1308,'Maeshima hiroki',/A_panorama_of_Zhoushan/,/舟山市新城/],
  [1365,'Qa003qa003',/Xinzhou_District/,/上饶市信州区/],
  [1410,'1969社论',/Changzhi_Museum/,/长治市博物馆/],
  [1520,'Lucas366',/Hamburg_City/,/汉堡市/],
  [1456,'颜邯',/Zhongshan_Street/,/佳木斯市中山街/],
  [918,'Tomskyhaha',/Scenery_in_Tieling_New_City/,/铁岭市凡河新区/],
  [1383,'Zeilmeter',/Yulin_Skyline/,/广西玉林市/],
  [988,'Yhy9630',/肥城市市民广场/,/肥城市市民广场/],
  [1426,'Amarespeco',/绥化市人民广场/,/绥化市人民广场/],
  [1495,'Windmemories',/20260809_Zhongwei_Gaomiao/,/中卫市高庙/],
  [1600,'瑞丽江的河水',/元江县天际线/,/元江县城天际线/],
  [903,'Prcshaw',/CRH5G_at_Mudanjiang/,/牡丹江火车站/],
  [915,'PanShiBo',/Baishan_Railway_Station/,/白山市火车站/]
 ];
 for(const [id,author,file,place] of expected){
  const p=getLicensedPhoto(id);
  assert.ok(p,'missing licensed fallback for city '+id);
  assert.match(decodeURIComponent(p.source_url),file);
  assert.match(p.caption,place);
  assert.equal(p.author,author);
  const expectedLicense=id===915?'3.0':'4.0';
  assert.equal(p.license,'CC BY-SA '+expectedLicense);
  assert.equal(p.license_url,'https://creativecommons.org/licenses/by-sa/'+expectedLicense+'/');
  assert.match(p.image_url,/^https:\/\/(?:thumb|upload)\.wikimedia\.org\//);
  assert.equal(p.changed,false);
 }
 assert.equal(getLicensedPhoto(897),null,'other city photos remain untouched');
 const page=read('public/city-detail.html');
 assert.match(page,/cityData\.images && cityData\.images\.length > 0/);
 assert.match(page,/cityData\.licensed_photo/);
 assert.match(page,/getElementById\('licensedPhotoFallback'\)/);
 assert.match(page,/caption\.append\(source, document\.createTextNode\(' · '\), license\)/);
 assert.match(page,/img\.addEventListener\('error'/);
 assert.doesNotMatch(read('server/utils/officialCityFacts.js'),/\bUPDATE\s+(?:city_images|cities)\b/i);
});

test('public city API exposes supplementary facts without overwriting legacy columns', () => {
  const server = read('server/routes/cities.js');
  assert.match(server, /official_facts: getOfficialFacts\(city\.id\)/);
  assert.match(server, /official_facts_summary = getSummary\(city\.id\)/);
  assert.match(server, /licensed_photo: images\.length \? null : getLicensedPhoto\(city\.id\)/);
  assert.doesNotMatch(read('server/utils/officialCityFacts.js'), /UPDATE cities|UPDATE city_dimensions|setField\(/);
});

test('actual city details show sourced values, citations and CC photo attribution', () => {
  const html = read('public/city-detail.html');
  const js = read('public/city-detail-official.js');
  assert.match(html, /id="officialFactsSection"/);
  assert.match(html, /id="officialFactsBody"/);
  assert.match(html, /id="officialFactsCount"/);
  assert.match(html, /id="licensedPhotoFallback"/);
  assert.match(html, /renderOfficialCityFacts\(cityData\)/);
  assert.match(html, /renderLicensedCityPhoto\(cityData\)/);
  assert.ok(html.indexOf('id="officialFactsSection"') < html.indexOf('id="imageGallery"'));
  assert.match(js, /document\.createElement\(/);
  assert.match(js, /textContent/);
  assert.match(js, /noopener noreferrer/);
  assert.match(js, /source_level === 'official_bulletin_reprint'/);
  assert.match(js, /原有排名、评分、租金估值分开/);
});

test('homepage renders evidence counts and licensed image credits', () => {
  const homepage = read('public/index.html');
  assert.match(homepage, /city\.official_facts_summary\.count/);
  assert.match(homepage, /city\.licensed_photo\.image_url/);
  assert.match(homepage, /city\.licensed_photo\.license_url/);
  assert.match(homepage, /city-card-photo-credit/);
  assert.match(homepage, /e\.target\.closest\('a'\)/);
});

test('admin shows field-change pending count separate from pending new cities', () => {
  const html = read('public/admin.html');
  assert.match(html, /id="statFieldChangesPending"/);
  assert.match(html, /id="statFieldReviewLink"/);
  assert.match(html, /\/admin\/city-data\/changes\?status=pending/);
  assert.match(html, /document\.getElementById\('cityDataStatus'\)\.value = 'pending'/);
});
