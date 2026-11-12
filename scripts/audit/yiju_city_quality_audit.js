#!/usr/bin/env node
'use strict';

/**
 * Read-only full ranking quality audit. No mutations, no credentials, no DB.
 * Usage: node scripts/audit/yiju_city_quality_audit.js [base_url]
 * Prints JSON to stdout; production API is paginated at up to 100 cities/page.
 */
const TYPES = ['china_general', 'china_layflat', 'world'];
const NULLABLE = ['population','gdp','area','latitude','longitude','avg_rent',
  'house_price','avg_temp','slow_pace_score','digital_nomad_score',
  'notes','location_intro'];
const SCORE_FIELDS = ['medical_facilities','safety','climate_score'];

async function loadAll({baseUrl='https://yiju.zhibeimao.com', fetchFn=globalThis.fetch,
                        types=TYPES, pageSize=100, maxPages=100}={}) {
  if (typeof fetchFn!=='function') throw new Error('fetch function required');
  const results = [];
  const pagination = [];
  for (const type of types) {
    let page=1, expectedTotal=null;
    do {
      if (page>maxPages) throw new Error('Page limit exceeded for '+type);
      const url=new URL('/api/cities',baseUrl);
      url.searchParams.set('list_type',type);
      url.searchParams.set('page',String(page));
      url.searchParams.set('limit',String(pageSize));
      const res=await fetchFn(url.toString(),{method:'GET',headers:{'Accept':'application/json'}});
      if (!res.ok) throw new Error('City API '+type+' page '+page+' HTTP '+res.status);
      const data=await res.json();
      if (!Array.isArray(data.cities)||!data.pagination ||
          !Number.isInteger(data.pagination.total)||data.pagination.total<0 ||
          data.pagination.page!==page) throw new Error('Invalid pagination for '+type);
      if (expectedTotal===null) expectedTotal=data.pagination.total;
      if (expectedTotal!==data.pagination.total) throw new Error('City total changed during scan: '+type);
      for (const c of data.cities) {
        if (c.list_type!==type || !Number.isInteger(c.id)) {
          throw new Error('Unexpected list_type or city ID: '+type);
        }
      }
      if (page>1 && data.cities.length===0) throw new Error('Empty intermediate page: '+type);
      results.push(...data.cities);
      page++;
    } while (results.filter(c=>c.list_type===type).length<expectedTotal);
    const actual=results.filter(c=>c.list_type===type).length;
    if (actual!==expectedTotal) throw new Error('City count mismatch: '+type);
    pagination.push({type,expected:expectedTotal,scanned:actual,pages:page-1});
  }
  return {cities:results,pagination};
}

function audit({cities,pagination}) {
  if (!Array.isArray(cities)) throw new Error('Expected cities array');
  const missing={},zero={},byType={};
  for (const k of NULLABLE) {
    missing[k]=cities.filter(c=>c[k]===null || c[k]===undefined || c[k]==='').length;
  }
  missing.cover_image=cities.filter(c=>!c.cover_image).length;
  for (const k of SCORE_FIELDS) zero[k]=cities.filter(c=>c[k]===0).length;
  for (const type of [...new Set(cities.map(c=>c.list_type))]) {
    const subset=cities.filter(c=>c.list_type===type);
    byType[type]={
      scanned:subset.length,
      withoutPopulation:subset.filter(c=>c.population==null).length,
      withoutCover:subset.filter(c=>!c.cover_image).length,
      medicalScoreZero:subset.filter(c=>c.medical_facilities===0).length,
      climateScoreZero:subset.filter(c=>c.climate_score===0).length
    };
  }
  const seen=new Set(),duplicateIds=[];
  for (const c of cities) {
    if (seen.has(c.id)) duplicateIds.push(c.id);
    seen.add(c.id);
  }
  const noCover=cities.filter(c=>!c.cover_image)
    .map(c=>({id:c.id,name:c.name,list_type:c.list_type}));
  const rentReview=cities.filter(c=>typeof c.avg_rent==='number' &&
      (c.avg_rent<=200 || c.avg_rent>=10000))
    .map(c=>({id:c.id,name:c.name,avg_rent:c.avg_rent,
              list_type:c.list_type,location:c.standard_location||null}));
  const updated={};
  for (const c of cities) {
    const day=String(c.updated_at||'unknown').slice(0,10);
    updated[day]=(updated[day]||0)+1;
  }
  return {
    label:'read_only_quality_candidate_not_database_edit',
    scanned:cities.length,uniqueCityIds:seen.size,duplicateIds,
    byType,pagination,missing,zeroScoresRequireSemanticsReview:zero,
    missingCoverCities:noCover,lowOrHighRentSamplesToVerify:rentReview,
    updatedDateDistribution:updated,
    caveat:'Score zero is not proof of zero facilities; rent values are unverified records, not citywide averages.'
  };
}

async function main() {
  const baseUrl=process.argv[2]||'https://yiju.zhibeimao.com';
  const result=audit(await loadAll({baseUrl}));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if (result.duplicateIds.length) process.exitCode=2;
}
if (require.main===module) main().catch(e=>{
  process.stderr.write('Audit unavailable: '+e.message+'\n');
  process.exitCode=1;
});
module.exports={loadAll,audit,TYPES};
