const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const home = read('public/index.html');
function runFunction(name, context = {}) {
  const start = home.indexOf('        function ' + name + '(');
  const end = home.indexOf('\n        function ', start + 1);
  vm.runInNewContext(home.slice(start, end), context);
  return context[name];
}
test('API base uses path segments, including the production root hostname', () => {
  for (const file of ['index', 'recommend', 'city-detail', 'upload-images']) {
    const html = read('public/' + file + '.html');
    const iife = html.match(/const API_BASE = (\(\(\) => \{[\s\S]*?\}\)\(\));/);
    const expression = iife ? iife[1] : '(' + html.match(/function getApiBase\(\) \{[\s\S]*?\n        \}/)[0] + ')()';
    for (const [pathname, expected] of [['/', ''], ['/city-detail.html', ''],
      ['/yiju/city-detail.html', '/yiju'], ['/livablecities/', '/livablecities'],
      ['/yijucity/', '']]) {
      const origin = 'https://yiju.zhibeimao.com';
      assert.equal(vm.runInNewContext(expression, {window: {location: {
        origin, pathname, href: origin + pathname}}}), origin + expected, file + pathname);
    }
  }
});
test('image failure terminates and removes stale attribution without guessing filenames', () => {
  const image = runFunction('getCityImageUrl');
  assert.equal(image({cover_image:{image_url:'cover'}, licensed_photo:{image_url:'licensed'}}), 'cover');
  assert.equal(image({licensed_photo:{image_url:'licensed'}}), 'licensed');
  assert.equal(image({image_url:'legacy'}), 'legacy');
  assert.match(image({id:1}), /^data:image\/gif;base64,/);
  const setup = runFunction('setupImageFallback', {Event: class {constructor(type){this.type=type;}}});
  const handlers = new Map(); const credit = {style:{}};
  const img = {style:{}, complete:true, naturalWidth:0,
    addEventListener(type, fn, options){handlers.set(type,{fn,options});},
    closest(){return {querySelector(){return credit;}};},
    dispatchEvent(e){handlers.get(e.type).fn.call(this);}};
  setup(img);
  assert.equal(img.style.display, 'none');
  assert.equal(credit.style.display, 'none');
  assert.equal(handlers.get('error').options.once, true);
  assert.equal(img.src, undefined);
});
test('approved photo selection works through HTTP and real isolated SQLite', async t => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yiju-photo-test-'));
  process.env.DB_PATH = path.join(dir, 'test.sqlite');
  const db = require('../server/models/database');
  const express = require('express');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close(); fs.rmSync(dir, {recursive:true, force:true});
  });
  await db.init();
  await db.run('ALTER TABLE cities ADD COLUMN house_price REAL');
  await db.run('ALTER TABLE cities ADD COLUMN climate_desc TEXT');
  await db.run("INSERT INTO cities(id,name,province,status,avg_rent,layflat_score) VALUES(1238,'Synthetic','Fixture','approved',300,8)");
  const app = express(); app.use('/api/cities', require('../server/routes/cities'));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  async function city(url) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + url);
    assert.equal(response.status, 200);
    return (await response.json()).cities[0];
  }
  assert.ok((await city('/api/cities')).licensed_photo);
  async function add(url, status, cover, weight, likes, date) {
    await db.run('INSERT INTO city_images(city_id,image_url,image_type,status,is_cover,weight,likes_count,created_at) VALUES(1238,?,?,?,?,?,?,?)',
      [url,'landscape',status,cover,weight,likes,date]);
  }
  await add('pending','pending',1,999,999,'2026-11-17');
  await add('older','approved',0,1,2,'2026-01-01');
  await add('newer','approved',0,1,2,'2026-02-01');
  for (const suffix of ['', '/hot?type=weekly', '/hot?type=featured', '/hot?type=new']) {
    const c = await city('/api/cities' + suffix);
    assert.equal(c.cover_image.image_url, 'newer');
    assert.equal(c.licensed_photo, null);
  }
  await add('weighted','approved',0,2,0,'2025-01-01');
  assert.equal((await city('/api/cities')).cover_image.image_url, 'weighted');
  await add('cover','approved',1,0,0,'2025-01-01');
  assert.equal((await city('/api/cities')).cover_image.image_url, 'cover');
});
