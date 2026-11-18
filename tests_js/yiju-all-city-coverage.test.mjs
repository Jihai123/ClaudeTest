import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../scripts/ops/yiju_all_city_coverage.mjs';

const entry=(id,opts={})=>({
 id,name:'测试城市'+id,province:'省份',country:'中国',
 list_type:'china_general',population:null,gdp:null,area:null,
 avg_rent:null,cover_image:null,location_intro:null,notes:null,
 ...opts
});
test('all-ranking coverage keeps every ID and separates usable photos from approval',()=>{
 const input=[entry(11,{cover_image:{image_url:'https://example.com/approved.jpg'}}),
  entry(12),entry(13),entry(14,{avg_rent:50})];
 const lookup={
  getSummary:id=>id===11||id===12?{count:8,year:2025}:null,
  getLicensedPhoto:id=>id===12||id===13?{image_url:'https://commons.example'}:null
 };
 const r=summarize(input,[],lookup);
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
 const r=summarize(rows,[],{getSummary:()=>null,getLicensedPhoto:()=>null});
 assert.equal(r.summary.identity_review_records,2);
 assert.deepEqual(r.summary.duplicate_ids,[]);
 assert.ok(r.rows.every(x=>x.work_status==='source_or_image_review_required'));
 assert.ok(r.rows.every(x=>x.missing_fields.includes('population')));
 assert.equal(rows[0].population,null);
});
