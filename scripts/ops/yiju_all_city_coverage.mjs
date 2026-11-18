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
const {getSummary, getLicensedPhoto} = require('../../server/utils/officialCityFacts.js');
const OUT = 'artifacts/yiju-all-city-coverage.json';
const MISSING = ['population','gdp','area','notes','location_intro','avg_rent'];

export function summarize(cities,pagination=[],lookups={getSummary,getLicensedPhoto}){
  if(!Array.isArray(cities)) throw Error('cities required');
  const knownNames = new Map();
  for(const city of cities){
    const k=[String(city.name||'').trim(),String(city.province||'').trim(),
      String(city.country||'').trim()].join('|');
    knownNames.set(k,(knownNames.get(k)||0)+1);
  }
  const rows=cities.map(c=>{
    const approved=Boolean(c.cover_image?.image_url||c.cover_image?.thumbnail_url);
    const fallback=!approved?lookups.getLicensedPhoto(c.id):null;
    const facts=lookups.getSummary(c.id);
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
    without_sourced_facts:count(r=>r.official_fact_count===0),
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
  return {summary,rows,priorities:priorities.slice(0,60)};
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
