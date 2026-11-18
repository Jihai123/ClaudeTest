#!/usr/bin/env node
'use strict';
// D11 full-site public city inventory. READ-ONLY: HTTP GET, no secrets/database/POST.
// Run from GitHub Actions free runner: node scripts/ops/yiju_full_city_enrichment_audit.mjs
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {loadAll,audit}=require('../audit/yiju_city_quality_audit.js');
const official=require('../../public/city-official-facts-2025.json');

export function buildInventory(cities,{officialData=official,scannedAt=new Date().toISOString()}={}){
  if(!Array.isArray(cities))throw Error('cities array required');
  const sourceById=new Map();
  for(const s of officialData.cities){
    for(const id of s.city_ids){
      if(sourceById.has(id))throw Error('duplicate sourced mapping '+id);
      sourceById.set(id,s);
    }
  }
  const rows=cities.map(c=>{
    const sourced=sourceById.get(c.id);
    const hasCover=Boolean(c.cover_image?.image_url||c.cover_image?.thumbnail_url);
    const hasLicensedFallback=Boolean(c.licensed_photo?.source_url&&c.licensed_photo?.license&&c.licensed_photo?.author);
    const missing=['population','gdp','area','location_intro','standard_location',
      'avg_rent'].filter(k=>c[k]===null||c[k]===undefined||c[k]==='');
    const invalidRent=typeof c.avg_rent==='number'&&(c.avg_rent<=200||c.avg_rent>=10000);
    const nearEmpty=missing.length>=4;
    const priority=(sourced?0:6)+(hasCover||hasLicensedFallback?0:3)+
      (nearEmpty?3:0)+(invalidRent?2:0);
    return {
      id:c.id,name:c.name,province:c.province||null,country:c.country||null,
      list_type:c.list_type,
      sourced_2025_facts:sourced?.facts.length||0,
      sourced_level:sourced?.source_level||null,
      source_urls:(sourced?.sources||[]).map(s=>s.url),
      photo_status:hasCover?'approved_cover':hasLicensedFallback?'attributed_fallback':'no_verified_cover',
      missing_fields:missing,
      rent_status:invalidRent?'needs_source_review':
        (c.avg_rent===null||c.avg_rent===undefined?'missing':'unverified_existing_value'),
      priority,needs_review:(!sourced||(!hasCover&&!hasLicensedFallback)||invalidRent||nearEmpty)
    };
  });
  const counts=(fn)=>rows.filter(fn).length;
  const byType=Object.fromEntries([...new Set(rows.map(c=>c.list_type))].map(type=>{
    const set=rows.filter(c=>c.list_type===type);
    return [type,{cities:set.length,with_sourced_facts:set.filter(x=>x.sourced_2025_facts>0).length,
      with_verified_cover:set.filter(x=>x.photo_status!=='no_verified_cover').length,
      rent_review:set.filter(x=>x.rent_status==='needs_source_review').length,
      missing_population:set.filter(x=>x.missing_fields.includes('population')).length}];
  }));
  const totals={
    city_records:rows.length,
    unique_city_ids:new Set(rows.map(x=>x.id)).size,
    with_sourced_2025_facts:counts(x=>x.sourced_2025_facts>0),
    without_sourced_2025_facts:counts(x=>!x.sourced_2025_facts),
    sourced_2025_fact_total:rows.reduce((a,c)=>a+c.sourced_2025_facts,0),
    with_approved_cover:counts(x=>x.photo_status==='approved_cover'),
    with_attributed_fallback_only:counts(x=>x.photo_status==='attributed_fallback'),
    without_verified_cover:counts(x=>x.photo_status==='no_verified_cover'),
    rent_needs_source_review:counts(x=>x.rent_status==='needs_source_review'),
    missing_population:counts(x=>x.missing_fields.includes('population')),
    missing_location_intro:counts(x=>x.missing_fields.includes('location_intro')),
    records_needing_any_review:counts(x=>x.needs_review)
  };
  if(totals.city_records!==totals.unique_city_ids)throw Error('Duplicate city IDs; stop further use');
  return {
    version:'yiju.all_city_enrichment_public_inventory.v1',
    scanned_at:scannedAt,
    scope:'public API full pagination across 3 rankings, read-only',
    caveats:[
      'A 2025 sourced fact collection is separate from legacy city columns; zero coverage does not mean no older fields.',
      'Existing rent values have not been verified as citywide averages; do not publish them as verified prices.',
      'A missing approved cover does not authorize image reuse or waive license/attribution checks.',
      'This manifest is a candidate work queue, not a production database migration or editorial approval.'
    ],
    totals,by_type:byType,
    next_priority:rows.slice().sort((a,b)=>b.priority-a.priority||a.id-b.id).slice(0,30)
      .map(({id,name,province,list_type,sourced_2025_facts,photo_status,missing_fields,rent_status,priority})=>
        ({id,name,province,list_type,sourced_2025_facts,photo_status,missing_fields,rent_status,priority})),
    cities:rows
  };
}

async function main(){
  const baseUrl=process.env.YIJU_AUDIT_BASE||'https://yiju.zhibeimao.com';
  const {cities,pagination}=await loadAll({baseUrl});
  const base=audit({cities,pagination});
  if(base.duplicateIds.length)throw Error('duplicate city IDs');
  const inventory=buildInventory(cities);
  const report={...inventory,pagination,updated_date_distribution:base.updatedDateDistribution};
  const out=process.argv[2]||'/tmp/yiju-full-city-enrichment-inventory.json';
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log('YIJU_ENRICHMENT_BASELINE '+JSON.stringify({
    scanned_at:report.scanned_at,totals:report.totals,by_type:report.by_type,
    pagination:report.pagination,priority_preview:report.next_priority.slice(0,6),
    artifact_path:out
  }));
  if(report.totals.city_records!==561)console.error(
    'YIJU_ENRICHMENT_BASELINE_NOTICE expected historical 561; actual '+report.totals.city_records
  );
}
if(process.argv[1]&&process.argv[1].endsWith('yiju_full_city_enrichment_audit.mjs'))
  main().catch(err=>{console.error('YIJU_ENRICHMENT_AUDIT_ERROR '+String(err.stack||err));process.exitCode=1;});
