#!/usr/bin/env node
'use strict';
// Read-only all-ranking coverage inventory. Produces sanitized, public-data-only
// working candidates; does NOT approve photos, invent facts or edit any database.
// Intended for an existing GitHub Actions runner when ChatGPT DNS is unavailable.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const {loadAll, audit} = require('../audit/yiju_city_quality_audit.js');
const OUT = 'artifacts/yiju-all-city-coverage.json';
const MISSING = ['population','gdp','area','notes','location_intro','avg_rent'];

export function summarize(cities,pagination=[]){
  if(!Array.isArray(cities)) throw Error('cities required');
  const knownNames = new Map();
  for(const city of cities){
    const k=[String(city.name||'').trim(),String(city.province||'').trim(),
      String(city.country||'').trim()].join('|');
    knownNames.set(k,(knownNames.get(k)||0)+1);
  }
  // Exact approved URL repeats across *different* named places require manual photo review.
  // Keep same-place cross-ranking repeats out of this warning; never automatically reject a photo.
  const coverByUrl = new Map();
  for (const c of cities) {
    const url=c.cover_image?.image_url||c.cover_image?.thumbnail_url;
    if (!url) continue;
    const group=coverByUrl.get(url)||[];
    group.push({id:c.id,name:c.name,province:c.province});
    coverByUrl.set(url,group);
  }
  const sharedCoverById=new Map(),sharedCoverGroups=[];
  for (const group of coverByUrl.values()){
    const distinct=new Set(group.map(c=>[String(c.name||'').trim(),String(c.province||'').trim()].join('|')));
    if(group.length<2||distinct.size<2)continue;
    const ids=group.map(c=>c.id);
    sharedCoverGroups.push({city_ids:ids,place_names:group.map(c=>c.name)});
    for(const c of group)sharedCoverById.set(c.id,ids.filter(id=>id!==c.id));
  }
  const rows=cities.map(c=>{
    const approved=Boolean(c.cover_image?.image_url||c.cover_image?.thumbnail_url);
    // Use ONLY the production API response, never the PR checkout's local maps.
    const rawPhoto=!approved?c.licensed_photo:null;
    const fallback=rawPhoto && /^https:\/\/(?:thumb|upload)\.wikimedia\.org\//.test(rawPhoto.image_url||'') &&
      /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(rawPhoto.source_url||'') &&
      /^CC BY-SA (?:3\.0|4\.0)$/.test(rawPhoto.license||'') && rawPhoto.author && rawPhoto.caption ? rawPhoto : null;
    const facts=c.official_facts_summary || null;
    const missing=MISSING.filter(k=>c[k]===undefined||c[k]===null||c[k]==='');
    const k=[String(c.name||'').trim(),String(c.province||'').trim(),
      String(c.country||'').trim()].join('|');
    const flaggedRent=typeof c.avg_rent==='number' &&
      (c.avg_rent<=200||c.avg_rent>=10000);
    const identityReview=!String(c.name||'').trim() ||
      knownNames.get(k)>1 || /小贵丽|测试|示例/.test(String(c.name||''));
    return {
      id:c.id,name:c.name,province:c.province||null,country:c.country||null,
      list_type:c.list_type,
      official_fact_count:facts?.count||0,
      approved_image:approved,licensed_fallback:!!fallback,
      approved_cover_missing_alt:approved&&!String(c.cover_image?.alt_text||'').trim(),
      shared_approved_cover_city_ids:sharedCoverById.get(c.id)||[],
      fallback_source_url:fallback?fallback.source_url:null,
      needs_cover:!approved&&!fallback,missing_fields:missing,
      uncertain_rent:flaggedRent,identity_review:identityReview,
      work_status:'source_or_image_review_required'
    };
  });
  const report=audit({cities,pagination});
  const count=fn=>rows.filter(fn).length;
  const summary={
    at:new Date().toISOString(),
    scanned:rows.length,
    unique_ids:report.uniqueCityIds,
    duplicate_ids:report.duplicateIds,
    lists:report.byType,
    official_facts_covered:count(r=>r.official_fact_count>0),
    without_approved_cover:count(r=>!r.approved_image),
    available_licensed_fallbacks:count(r=>!r.approved_image&&r.licensed_fallback),
    without_any_usable_cover:count(r=>r.needs_cover),
    approved_cover_missing_alt:count(r=>r.approved_cover_missing_alt),
    reused_cover_across_different_places_groups:sharedCoverGroups.length,
    cities_with_reused_cover_across_different_places:count(r=>r.shared_approved_cover_city_ids.length>0),
    without_sourced_facts:count(r=>r.official_fact_count===0),
    measurement:'all source/cover counts are derived from live API fields, not repository code',
    missing:report.missing,
    suspicious_rent_records:count(r=>r.uncertain_rent),
    identity_review_records:count(r=>r.identity_review),
    pagination
  };
  // Keep all rows, not just the first page or only the cities already sourced.
  const priorities=[...rows].sort((a,b)=>{
    const weight=x=>(x.needs_cover?5:0)+(x.official_fact_count===0?5:0)+
      (x.identity_review?4:0)+(x.uncertain_rent?3:0)+x.missing_fields.length;
    return weight(b)-weight(a)||a.id-b.id;
  });
  return {summary,rows,priorities:priorities.slice(0,60),photo_reuse_review:sharedCoverGroups};
}
async function main(){
 const baseUrl=process.env.YIJU_BASE_URL||'https://yiju.zhibeimao.com';
 const fetched=await loadAll({
  baseUrl,
  fetchFn:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(12000)})
 });
 const report=summarize(fetched.cities,fetched.pagination);
 fs.mkdirSync(path.dirname(OUT),{recursive:true});
 fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
 console.log('YIJU_ALL_CITY_COVERAGE '+JSON.stringify(report.summary));
 console.log('YIJU_ALL_CITY_TOP30 '+JSON.stringify(report.priorities.slice(0,30)));
 console.log('YIJU_ALL_CITY_ARTIFACT '+OUT+' (public city metadata only)');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(err=>{console.error('YIJU_ALL_CITY_AUDIT_ERROR',String(err));process.exitCode=1;});
}
