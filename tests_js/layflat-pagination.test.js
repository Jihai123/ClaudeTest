// Read-only API pagination regression. Real route code, synthetic database fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const endpoints = {};
  const router = {};
  for (const method of ['get','post','put','patch','delete']) {
    router[method] = (route, ...fns) => { endpoints[method.toUpperCase() + ' ' + route] = fns.at(-1); };
  }
  const sample = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1, name: '城市' + (i + 1), list_type: 'china_layflat',
    status: 'approved', overall_score: 7, layflat_score: 7,
    avg_rent: 100 + i, province: '测试省'
  }));
  const sqlQueries = [];
  const db = {
    async query(sql, args) {
      if (sql.includes('FROM city_tags')) return [];
      if (sql.includes('FROM cities c') && sql.includes('GROUP BY c.id')) {
        sqlQueries.push(sql);
        let arr = sample.slice();
        const pseudo = sql.match(/ORDER BY \(\(c\.id \* (\d+) \+ (\d+)\) % 2147483647\) ASC, c\.id ASC/);
        if (pseudo) {
          const multiplier = Number(pseudo[1]), offsetSeed = Number(pseudo[2]);
          arr.sort((a,b)=>((a.id*multiplier+offsetSeed)%2147483647)-
            ((b.id*multiplier+offsetSeed)%2147483647) || a.id-b.id);
        } else if (sql.includes('ORDER BY c.avg_rent ASC, c.id ASC')) {
          arr.sort((a,b)=>a.avg_rent-b.avg_rent||a.id-b.id);
        } else if (sql.includes('ORDER BY c.overall_score DESC, c.id ASC')) {
          arr.sort((a,b)=>b.overall_score-a.overall_score||a.id-b.id);
        } else {
          throw Error('unexpected or unstable SQL order: ' + sql);
        }
        const limit=Number(args.at(-2)), offset=Number(args.at(-1));
        return arr.slice(offset, offset+limit).map(x=>({...x}));
      }
      throw Error('unexpected query '+sql);
    },
    async get(sql) {
      if (sql.includes('COUNT(*) as total FROM cities')) return {total:sample.length};
      if (sql.includes('FROM city_images')) return null;
      throw Error('unexpected get '+sql);
    },
    async run(){throw Error('no database changes allowed')}
  };
  const fakeRequire = name => {
    if (name==='express') return {Router:()=>router};
    if (name==='../models/database') return db;
    if (name==='../middleware/auth') return {optionalAuth:(req,res,next)=>next(),verifyToken:()=>{}};
    if (name==='../middleware/validator') return {validateCity:()=>{},validateDimensions:()=>{},validateId:()=>{}};
    if (name==='../utils/sanitize') return {sanitizeObject:x=>x};
    throw Error(name);
  };
  const module={exports:{}};
  const source=fs.readFileSync(path.join(__dirname,'../server/routes/cities.js'),'utf8');
  const factory=new vm.Script('(function(require,module,exports,console,Date){'+source+'\n})').runInNewContext();
  factory(fakeRequire,module,module.exports,console,Date);
  const handler=endpoints['GET /'];
  assert.ok(handler,'GET / endpoint');
  async function get(query) {
    const res={
      statusCode:200,
      status(code){this.statusCode=code;return this},
      json(body){this.body=body;return this}
    };
    await handler({query},res);
    assert.equal(res.statusCode,200,JSON.stringify(res.body));
    return res.body;
  }
  return {get,sqlQueries};
}

test('default layflat random-looking ordering remains stable across 3 pages',async()=>{
  const h=harness();
  const pages=[];
  for(let page=1;page<=3;page++){
    const value=await h.get({list_type:'china_layflat',page:String(page),limit:'10'});
    assert.equal(value.pagination.total,30);
    pages.push(value.cities.map(c=>c.id));
  }
  assert.equal(new Set(pages.flat()).size,30);
  const again=await h.get({list_type:'china_layflat',page:'2',limit:'10'});
  assert.deepEqual(again.cities.map(c=>c.id),pages[1]);
  for(const q of h.sqlQueries) {
    assert.doesNotMatch(q,/ORDER BY RANDOM\(\)/);
    assert.match(q,/ORDER BY \(\(c\.id \* \d+ \+ \d+\) % 2147483647\) ASC, c\.id ASC/);
  }
});

test('explicit sort including overall_score takes priority over layflat variety',async()=>{
  const h=harness();
  const p1=await h.get({list_type:'china_layflat',sort:'overall_score',page:'1',limit:'10'});
  const p2=await h.get({list_type:'china_layflat',sort:'overall_score',page:'2',limit:'10'});
  assert.deepEqual(p1.cities.map(x=>x.id),Array.from({length:10},(_,i)=>i+1));
  assert.deepEqual(p2.cities.map(x=>x.id),Array.from({length:10},(_,i)=>i+11));
  const asc=await h.get({list_type:'china_layflat',sort:'avg_rent',order:'ASC',page:1,limit:10});
  assert.deepEqual(asc.cities.map(x=>x.id),p1.cities.map(x=>x.id));
  assert.match(h.sqlQueries.at(-1),/ORDER BY c.avg_rent ASC, c.id ASC/);
});
