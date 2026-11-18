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

export function selectPhotoSamples(cities){
 const chosen=[],seen=new Set();
 const add=(subset,n)=>{
  for(const c of subset.sort((a,b)=>a.id-b.id)){
   if(chosen.length>=20||n<=0||seen.has(c.id))continue;
   const photo=c.cover_image||c.licensed_photo;
   if(!photo?.image_url)continue;
   chosen.push({id:c.id,name:c.name,list_type:c.list_type,
     kind:c.cover_image?'approved':'licensed_fallback',
     alt_missing:!!c.cover_image&&!String(c.cover_image.alt_text||'').trim(),
     raw_url:photo.image_url});
   seen.add(c.id);n--;
  }
 };
 add(cities.filter(c=>c.cover_image?.image_url&&!String(c.cover_image.alt_text||'').trim()),2);
 add(cities.filter(c=>!c.cover_image&&c.licensed_photo?.image_url),3);
 for(const [type,n] of [['china_general',6],['china_layflat',6],['world',3]]){
  add(cities.filter(c=>c.list_type===type&&c.cover_image?.image_url),n);
 }
 add(cities.filter(c=>c.cover_image?.image_url||c.licensed_photo?.image_url),20-chosen.length);
 return chosen;
}
const SAFE_PHOTO_HOSTS=new Set(['yiju.zhibeimao.com','thumb.wikimedia.org','upload.wikimedia.org']);
export function resolveSafePhotoUrl(raw,base='https://yiju.zhibeimao.com'){
 try{
  const url=new URL(raw,base);
  if(url.protocol!=='https:'||!SAFE_PHOTO_HOSTS.has(url.hostname)||url.username||url.password)
   return null;
  return url.toString();
 }catch(_){return null;}
}
export async function checkPhotoLinks(items,{fetchFn=globalThis.fetch,baseUrl='https://yiju.zhibeimao.com'}={}){
 const results=[];
 for(let start=0;start<items.length;start+=4){
  const group=await Promise.all(items.slice(start,start+4).map(async item=>{
   const safe=resolveSafePhotoUrl(item.raw_url,baseUrl);
   const out={id:item.id,name:item.name,kind:item.kind,list_type:item.list_type,
      alt_missing:item.alt_missing,host:null,http:null,link_status:'not_checked'};
   if(!safe){out.link_status='external_host_review';return out;}
   out.host=new URL(safe).hostname;
   try{
    // HEAD only: never download image content or follow untrusted redirects.
    const response=await fetchFn(safe,{method:'HEAD',redirect:'manual',
      signal:AbortSignal.timeout(7000)});
    out.http=response.status;
    out.link_status=response.status>=200&&response.status<300?'head_ok':
      (response.status>=300&&response.status<400?'redirect_needs_check':
       'head_unconfirmed');
   }catch(error){out.link_status='network_unconfirmed';out.error=String(error?.cause?.code||error?.name||'fetch_error');}
   return out;
  }));
  results.push(...group);
 }
 return results;
}

async function main(){
 const baseUrl=process.env.YIJU_BASE_URL||'https://yiju.zhibeimao.com';
 const fetched=await loadAll({
  baseUrl,
  fetchFn:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(12000)})
 });
 const report=summarize(fetched.cities,fetched.pagination);
 const photoItems=selectPhotoSamples(fetched.cities);
 const photoChecks=await checkPhotoLinks(photoItems,{baseUrl});
 const missingAlt=fetched.cities.filter(c=>c.cover_image?.image_url&&
   !String(c.cover_image.alt_text||'').trim()).map(c=>({
    id:c.id,name:c.name,province:c.province||null,list_type:c.list_type
   }));
 report.photo_link_probe={
  checked_at:new Date().toISOString(),
  sampled:photoChecks.length,
  head_ok:photoChecks.filter(x=>x.link_status==='head_ok').length,
  unresolved:photoChecks.filter(x=>x.link_status!=='head_ok').length,
  status_note:'HEAD verifies reachability only. It does not validate photographed location, actual browser rendering, or copyright. No source image bytes fetched.',
  items:photoChecks,missing_alt_cities:missingAlt
 };
 fs.mkdirSync(path.dirname(OUT),{recursive:true});
 fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
 console.log('YIJU_ALL_CITY_COVERAGE '+JSON.stringify(report.summary));
 console.log('YIJU_ALL_CITY_TOP30 '+JSON.stringify(report.priorities.slice(0,30)));
 console.log('YIJU_PHOTO_LINK_AUDIT '+JSON.stringify(report.photo_link_probe));
 console.log('YIJU_ALL_CITY_ARTIFACT '+OUT+' (public city metadata only)');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(err=>{console.error('YIJU_ALL_CITY_AUDIT_ERROR',String(err));process.exitCode=1;});
}
