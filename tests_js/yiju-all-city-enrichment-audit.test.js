'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
async function load(){return import('../scripts/ops/yiju_full_city_enrichment_audit.mjs')}
function city(id,type,options={}){return {
  id,name:'城市'+id,province:'陕西省',country:'中国',list_type:type,
  population:null,gdp:null,area:null,location_intro:null,standard_location:null,
  avg_rent:null,cover_image:null,licensed_photo:null,...options
}}
test('inventory makes distinct 2025 source, legacy fields, and licensed pictures',async()=>{
 const {buildInventory}=await load();
 const fixture={
  cities:[{id:5,name:'城市5',city_ids:[5],source_level:'government',
    sources:[{key:'s',url:'https://example.gov.cn/5'}],
    facts:[{key:'population_2025',value:1},{key:'gdp_2025',value:2}]}]
 };
 const report=buildInventory([
  city(5,'china_general',{cover_image:{image_url:'/approved.jpg'},avg_rent:1200}),
  city(6,'china_layflat',{licensed_photo:{source_url:'https://commons.wikimedia.org/wiki/File:X',
     author:'Author',license:'CC BY-SA 4.0'},avg_rent:50}),
  city(7,'world',{population:123,avg_rent:500})
 ],{officialData:fixture,scannedAt:'2026-11-18T08:00:00Z'});
 assert.equal(report.totals.city_records,3);
 assert.equal(report.totals.with_sourced_2025_facts,1);
 assert.equal(report.totals.sourced_2025_fact_total,2);
 assert.equal(report.totals.with_approved_cover,1);
 assert.equal(report.totals.with_attributed_fallback_only,1);
 assert.equal(report.totals.without_verified_cover,1);
 assert.equal(report.totals.rent_needs_source_review,1);
 assert.equal(report.totals.missing_population,2);
 assert.equal(report.cities.find(x=>x.id===6).rent_status,'needs_source_review');
 assert.equal(report.cities.find(x=>x.id===7).rent_status,'unverified_existing_value');
 assert.equal(report.cities.find(x=>x.id===5).photo_status,'approved_cover');
 assert.equal(report.by_type.world.cities,1);
 assert.equal(report.next_priority[0].id,7); // no sourced facts + no licensed image outranks reviewed extreme rent
});
test('duplicate source city IDs or ranking city IDs are rejected',async()=>{
 const {buildInventory}=await load();
 const entry=(id)=>({id,city_ids:[id],sources:[],facts:[]});
 assert.throws(()=>buildInventory([city(1,'world')],
  {officialData:{cities:[entry(1),entry(1)]}}),/duplicate sourced mapping/);
 assert.throws(()=>buildInventory([city(1,'world'),city(1,'china_general')],
  {officialData:{cities:[]}}),/Duplicate city IDs/);
});
test('missing images and 0 score cannot automatically create sourced facts',async()=>{
 const {buildInventory}=await load();
 const data=buildInventory([city(8,'china_general',{medical_facilities:0,
  cover_image:{image_url:''},licensed_photo:{source_url:'https://commons.wikimedia.org/X'}})],
  {officialData:{cities:[]}});
 assert.equal(data.totals.with_sourced_2025_facts,0);
 assert.equal(data.totals.without_verified_cover,1);
 assert.equal(data.cities[0].sourced_2025_facts,0);
});
