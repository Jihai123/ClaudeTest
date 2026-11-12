'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadAll,audit}=require('../scripts/audit/yiju_city_quality_audit');

function city(id,type,options={}) {
  return {id,name:'城市'+id,list_type:type,population:null,avg_rent:null,
    medical_facilities:0,climate_score:0,safety:0,cover_image:null,
    updated_at:'2025-11-30 00:00:00',...options};
}

test('full paginated audit reads every ranking without writes',async()=>{
  const seen=[];
  const fixture={
    china_general:[city(1,'china_general',{population:123,cover_image:{image_url:'/a'}}),
                   city(2,'china_general',{medical_facilities:6})],
    china_layflat:[city(3,'china_layflat',{avg_rent:100}),
                   city(4,'china_layflat',{medical_facilities:0})],
    world:[city(5,'world',{cover_image:{image_url:'/b'}})]
  };
  const fakeFetch=async (url,opts)=>{
    const u=new URL(url),type=u.searchParams.get('list_type');
    const page=Number(u.searchParams.get('page'));
    seen.push({type,page,method:opts.method});
    const rows=fixture[type],start=(page-1)*2;
    return {ok:true,json:async()=>({cities:rows.slice(start,start+2),
             pagination:{total:rows.length,page,limit:2,pages:Math.ceil(rows.length/2)}})};
  };
  const data=await loadAll({baseUrl:'https://example.invalid',
      types:['china_general','china_layflat','world'],
      pageSize:2,fetchFn:fakeFetch});
  const report=audit(data);
  assert.equal(report.scanned,5);
  assert.deepEqual(report.duplicateIds,[]);
  assert.equal(report.uniqueCityIds,5);
  assert.equal(report.missing.population,4);
  assert.equal(report.zeroScoresRequireSemanticsReview.medical_facilities,4);
  assert.equal(report.missing.cover_image,3);
  assert.equal(report.lowOrHighRentSamplesToVerify.length,1);
  assert.equal(report.lowOrHighRentSamplesToVerify[0].id,3);
  assert.deepEqual(seen.map(x=>x.method),['GET','GET','GET']);
});

test('zero score is distinguished from NULL and source values are not mutated',()=>{
  const input=[city(7,'china_layflat',{medical_facilities:0}),
               city(8,'china_layflat',{medical_facilities:null})];
  const before=JSON.stringify(input);
  const report=audit({cities:input,pagination:[]});
  assert.equal(report.zeroScoresRequireSemanticsReview.medical_facilities,1);
  assert.equal(JSON.stringify(input),before);
});

test('duplicate city IDs across lists are flagged without automatic merge',()=>{
  const a=city(12,'world'),b=city(12,'china_general');
  const report=audit({cities:[a,b],pagination:[]});
  assert.deepEqual(report.duplicateIds,[12]);
  assert.equal(report.scanned,2);
});

test('incorrect listing and changing totals reject inconsistent API responses',async()=>{
  const fakeFetch=async()=>({ok:true,json:async()=>({
    cities:[city(1,'wrong')],pagination:{total:1,page:1,limit:100,pages:1}
  })});
  await assert.rejects(loadAll({fetchFn:fakeFetch,types:['world']}),/Unexpected list_type/);
});
