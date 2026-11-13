const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const atlas=read('public/2025-city-evidence-atlas.html');
const data=JSON.parse(read('public/city-verified-data-2025.json'));

test('six distinct city IDs and exactly 28 fully sourced metrics with 2025 units',()=>{
 assert.equal(data.schema_version,'yiju.city_government_facts.v1');
 assert.equal(data.statistical_year,2025);
 assert.equal(data.cities.length,6);
 assert.deepEqual(data.cities.map(c=>c.id).sort((a,b)=>a-b),[897,951,965,1021,1063,1238]);
 assert.equal(data.cities.reduce((n,c)=>n+c.facts.length,0),28);
 for(const c of data.cities){
   assert.equal(new Set(c.facts.map(f=>f.key)).size,c.facts.length);
   const sources=new Map(c.sources.map(s=>[s.key,s]));
   assert.ok(c.name && c.focus && c.tip);
   for(const s of c.sources){
     assert.match(s.url,/^https:\/\/[^\s]+/);
     assert.ok(/^2026-\d{2}-\d{2}$/.test(s.date));
     assert.ok(s.title.length>6);
   }
   for(const f of c.facts){
     assert.ok(Number.isFinite(f.value),c.name+' invalid number');
     assert.ok(f.label && f.unit && f.note && f.category);
     assert.ok(sources.has(f.source),c.name+' missing primary source');
     assert.ok(!/评分/.test(f.label) || /非.*评分/.test(f.note));
   }
 }
});

test('static atlas has crawlable visible facts, canonical, six linked city IDs',()=>{
 assert.match(atlas,/rel="canonical" href="https:\/\/yiju\.zhibeimao\.com\/2025-city-evidence-atlas\.html"/);
 assert.match(atlas,/<meta name="robots" content="index,follow">/);
 assert.equal((atlas.match(/class="city-panel"/g)||[]).length,6);
 assert.equal((atlas.match(/class="fact"/g)||[]).length,28);
 for(const c of data.cities){
   assert.match(atlas,new RegExp('id="city-'+c.id+'"'));
   assert.ok(atlas.includes('/city-detail.html?id='+c.id));
   for(const s of c.sources) assert.ok(atlas.includes(s.url),s.url);
 }
 assert.match(atlas,/黄山市与黄山风景区并非相同居住范围/);
 assert.match(atlas,/剔除沙尘天气影响/);
 assert.match(atlas,/政府原始来源/);
 assert.match(atlas,/type="application\/ld\+json"/);
 assert.doesNotMatch(atlas,/GoogleAnalytics|gtag\(|sendBeacon|localStorage|sessionStorage|<img[^>]+src="https:/i);
});

test('index, checklist, public and dynamic sitemaps include this one page',()=>{
 const url='https://yiju.zhibeimao.com/2025-city-evidence-atlas.html';
 assert.ok(read('public/index.html').includes('href="/2025-city-evidence-atlas.html"'));
 assert.ok(read('public/city-living-checklist.html').includes('href="/2025-city-evidence-atlas.html"'));
 const sitemap=read('public/sitemap.xml');
 assert.equal(sitemap.split(url).length-1,1);
 assert.equal((sitemap.match(/<url>/g)||[]).length,567);
 assert.equal((sitemap.match(/city-detail\.html\?id=/g)||[]).length,561);
 const dynamic=read('server/routes/sitemap.js');
 assert.ok(dynamic.includes("'/2025-city-evidence-atlas.html'"));
 assert.ok(dynamic.includes("'/city-living-checklist.html'"));
});

test('issue comment concurrency isolates requests so pending submissions are not cancelled',()=>{
 const workflow=read('.github/workflows/yiju-agent-github-bridge.yml');
 assert.ok(workflow.includes('group: yiju-agent-bridge-${{ github.event.comment.id }}'));
 assert.ok(workflow.includes('cancel-in-progress: false'));
 assert.doesNotMatch(workflow,/group: yiju-agent-bridge-\$\{\{ github\.event\.issue\.number \}\}/);
 assert.ok(workflow.includes("github.event.comment.user.login == 'Jihai123'"));
 assert.ok(workflow.includes("github.event.issue.number == 138"));
});
