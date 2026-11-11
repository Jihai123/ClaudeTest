const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const get = p => fs.readFileSync(path.join(root,p), 'utf8');

test('main menu points to an existing image upload page, not a missing URL', ()=>{
  const home=get('public/index.html');
  assert.match(home, /href="upload-images\.html"/);
  assert.doesNotMatch(home, /href="upload-image\.html"/);
  assert.match(get('public/upload-images.html'), /<!DOCTYPE html>/i);
});

test('city comparison canonical is the production Yiju URL',()=>{
  const html=get('public/city-compare.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/yiju\.zhibeimao\.com\/city-compare\.html">/);
  assert.doesNotMatch(html, /yourdomain\.com/);
});

test('static fallback sitemap contains unique approved city URLs on the production host',()=>{
  const xml=get('public/sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.doesNotMatch(xml, /tangping\.com|yourdomain\.com|\/admin|\/api\/|<loc>http:/);
  const ids=[...xml.matchAll(/<loc>https:\/\/yiju\.zhibeimao\.com\/city-detail\.html\?id=(\d+)<\/loc>/g)].map(x=>Number(x[1]));
  assert.equal(ids.length,561,'fallback snapshot should include 561 currently approved city records');
  assert.equal(new Set(ids).size,ids.length,'no duplicate ID URLs');
  assert.equal((xml.match(/<url>/g)||[]).length,ids.length+2);
  assert.match(xml, /<loc>https:\/\/yiju\.zhibeimao\.com\/city-compare\.html<\/loc>/);
  assert.match(xml, /<loc>https:\/\/yiju\.zhibeimao\.com\/<\/loc>/);
});

test('Express dynamic sitemap route takes precedence over static fallback',()=>{
  const code=get('server.js');
  const dynamic=code.indexOf("app.use(BASE_PATH || '/', require('./server/routes/sitemap'))");
  const staticFile=code.indexOf("app.use(BASE_PATH || '/', express.static(");
  assert.ok(dynamic>0 && staticFile>0 && dynamic<staticFile);
});
