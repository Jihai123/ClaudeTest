import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,selectPhotoSamples,resolveSafePhotoUrl,checkPhotoLinks} from '../scripts/ops/yiju_all_city_coverage.mjs';

const entry=(id,opts={})=>({
 id,name:'测试城市'+id,province:'省份',country:'中国',
 list_type:'china_general',population:null,gdp:null,area:null,
 avg_rent:null,cover_image:null,location_intro:null,notes:null,
 ...opts
});
test('all-ranking coverage keeps every ID and separates usable photos from approval',()=>{
 const photo={image_url:'https://thumb.wikimedia.org/test.jpg',
  source_url:'https://commons.wikimedia.org/wiki/File:Test.jpg',author:'Author',
  license:'CC BY-SA 4.0',caption:'Precise location',license_url:'https://creativecommons.org/licenses/by-sa/4.0/'};
 const input=[
  entry(11,{cover_image:{image_url:'https://example.com/approved.jpg'},official_facts_summary:{count:8}}),
  entry(12,{licensed_photo:photo,official_facts_summary:{count:8}}),
  entry(13,{licensed_photo:photo}),entry(14,{avg_rent:50})];
 const r=summarize(input);
 assert.equal(r.summary.scanned,4);
 assert.equal(r.summary.unique_ids,4);
 assert.equal(r.summary.official_facts_covered,2);
 assert.equal(r.summary.without_sourced_facts,2);
 assert.equal(r.summary.without_approved_cover,3);
 assert.equal(r.summary.available_licensed_fallbacks,2);
 assert.equal(r.summary.without_any_usable_cover,1);
 assert.equal(r.summary.suspicious_rent_records,1);
 assert.equal(r.rows.find(x=>x.id===12).approved_image,false);
 assert.equal(r.rows.find(x=>x.id===12).licensed_fallback,true);
 assert.equal(r.rows.find(x=>x.id===14).uncertain_rent,true);
 assert.equal(r.priorities.length,4);
});
test('same place names, source gap and zero score must not be auto-repaired',()=>{
 const rows=[entry(21,{name:'同名',province:'同省'}),entry(22,{name:'同名',province:'同省'})];
 const r=summarize(rows);
 assert.equal(r.summary.identity_review_records,2);
 assert.deepEqual(r.summary.duplicate_ids,[]);
 assert.ok(r.rows.every(x=>x.work_status==='source_or_image_review_required'));
 assert.ok(r.rows.every(x=>x.missing_fields.includes('population')));
 assert.equal(rows[0].population,null);
});


test('a PR-only verified photo and sourced facts never inflate actual production counts',()=>{
 const fake=[entry(901,{licensed_photo:null,official_facts_summary:null})];
 const r=summarize(fake);
 assert.equal(r.summary.official_facts_covered,0);
 assert.equal(r.summary.available_licensed_fallbacks,0);
 assert.equal(r.summary.without_any_usable_cover,1);
 assert.match(r.summary.measurement,/live API fields/);
});
test('non-Wikimedia or unlicensed raw photo cannot be counted as covered',()=>{
 const fake=[entry(902,{licensed_photo:{image_url:'https://example.com/stock.jpg',
  source_url:'https://commons.wikimedia.org/wiki/File:NotThis.jpg',
  author:'unverified',license:'unknown',caption:'somewhere'}})];
 const r=summarize(fake);
 assert.equal(r.summary.available_licensed_fallbacks,0);
 assert.equal(r.rows[0].needs_cover,true);
});


test('reused approved cover between distinct cities is flagged, not removed',()=>{
 const url='https://img.example.org/shared.jpg';
 const rows=[
  entry(100,{name:'甲市',province:'甲省',cover_image:{image_url:url,alt_text:'甲市街景'}}),
  entry(101,{name:'乙市',province:'乙省',cover_image:{image_url:url,alt_text:''}}),
  entry(102,{name:'乙市',province:'乙省',cover_image:{image_url:'https://img.example.org/unique.jpg',alt_text:'乙市'}})
 ];
 const r=summarize(rows);
 assert.equal(r.summary.reused_cover_across_different_places_groups,1);
 assert.equal(r.summary.cities_with_reused_cover_across_different_places,2);
 assert.equal(r.summary.approved_cover_missing_alt,1);
 assert.deepEqual(r.rows.find(c=>c.id===100).shared_approved_cover_city_ids,[101]);
 assert.deepEqual(r.rows.find(c=>c.id===101).shared_approved_cover_city_ids,[100]);
 assert.equal(r.rows.find(c=>c.id===100).approved_image,true,'do not auto-revoke approval');
 assert.equal(r.photo_reuse_review.length,1);
});
test('the same named place on different ranking IDs is not automatically a wrong-photo flag',()=>{
 const url='https://img.example.org/same.jpg';
 const r=summarize([
  entry(111,{name:'上海',province:'上海市',cover_image:{image_url:url,alt_text:'上海'}}),
  entry(112,{name:'上海',province:'上海市',cover_image:{image_url:url,alt_text:'上海'}})
 ]);
 assert.equal(r.summary.reused_cover_across_different_places_groups,0);
 assert.equal(r.summary.cities_with_reused_cover_across_different_places,0);
});


test('sample 20 covers prioritizing missing alt and licensed fallback while distributing rankings',()=>{
 const cities=[];
 for(let i=0;i<28;i++){
  cities.push(entry(100+i,{list_type:i<10?'china_general':i<20?'china_layflat':'world',
   cover_image:{image_url:'/uploads/photo'+i+'.jpg',alt_text:i<2?'':'实景描述'}}));
 }
 for(let i=0;i<5;i++)cities.push(entry(200+i,{list_type:'china_layflat',cover_image:null,
   licensed_photo:{image_url:'https://thumb.wikimedia.org/wikipedia/commons/thumb/test'+i+'.jpg',
    source_url:'https://commons.wikimedia.org/wiki/File:Test'+i+'.jpg',author:'Author',
    license:'CC BY-SA 4.0',caption:'某城市地点'}}));
 const out=selectPhotoSamples(cities);
 assert.equal(out.length,20);
 assert.equal(new Set(out.map(x=>x.id)).size,20);
 assert.deepEqual(out.filter(x=>x.alt_missing).map(x=>x.id),[100,101]);
 assert.equal(out.filter(x=>x.kind==='licensed_fallback').length,3);
 assert.ok(out.some(x=>x.list_type==='world'));
});
test('only HTTPS own-site or Wikimedia URLs are probed, never private/IP or userinfo',()=>{
 assert.equal(resolveSafePhotoUrl('/uploads/a.jpg'),'https://yiju.zhibeimao.com/uploads/a.jpg');
 assert.equal(resolveSafePhotoUrl('http://127.0.0.1/latest'),null);
 assert.equal(resolveSafePhotoUrl('https://user:pass@yiju.zhibeimao.com/a.jpg'),null);
 assert.equal(resolveSafePhotoUrl('https://evil.example.org/a.jpg'),null);
 assert.equal(resolveSafePhotoUrl('https://thumb.wikimedia.org/a.jpg'),'https://thumb.wikimedia.org/a.jpg');
});
test('HEAD checks do not fetch image bytes; errors are inconclusive, not fake missing photos',async()=>{
 const requests=[];
 const samples=[
  {id:10,name:'甲',kind:'approved',list_type:'china_general',raw_url:'/uploads/a.jpg',alt_missing:false},
  {id:11,name:'乙',kind:'approved',list_type:'china_general',raw_url:'https://evil.example.org/a.jpg',alt_missing:true},
  {id:12,name:'丙',kind:'approved',list_type:'world',raw_url:'/uploads/redirect.jpg',alt_missing:false}
 ];
 const result=await checkPhotoLinks(samples,{fetchFn:async(url,opts)=>{
  requests.push({url,opts});
  return {status:url.includes('redirect')?302:200};
 }});
 assert.equal(requests.length,2);
 assert.ok(requests.every(x=>x.opts.method==='HEAD'&&x.opts.redirect==='manual'));
 assert.equal(result[0].link_status,'head_ok');
 assert.equal(result[1].link_status,'external_host_review');
 assert.equal(result[2].link_status,'redirect_needs_check');
});
