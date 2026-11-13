'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..','public');
const read=n=>fs.readFileSync(path.join(base,n),'utf8');
test('living checklist is indexable, sourced and privacy-preserving',()=>{
 const html=read('city-living-checklist.html');
 assert.match(html,/<link rel="canonical" href="https:\/\/yiju\.zhibeimao\.com\/city-living-checklist\.html">/);
 assert.match(html,/https:\/\/www\.xa\.gov\.cn\/sq\/csgk\/rkzk\/1\.html/);
 assert.match(html,/https:\/\/www\.hegang\.gov\.cn\/hegang\/tjgb\/202608\/92535\.shtml/);
 assert.match(html,/zhangye-city-facts-2025\.html/);
 for(const id of ['1238','897','951']) assert.match(html,new RegExp('city-detail\\.html\\?id='+id));
 assert.equal((html.match(/<input type="checkbox"/g)||[]).length,6);
 assert.doesNotMatch(html,/<form|localStorage|sessionStorage|sendBeacon|XMLHttpRequest|fetch\s*\(/i);
 assert.match(html,/aria-live="polite"/);
});
test('new content is linked from home and verified facts and listed exactly once in sitemap',()=>{
 const page='city-living-checklist.html';
 assert.match(read('index.html'),/href="\/city-living-checklist\.html"/);
 assert.match(read('verified-city-facts.html'),/href="\/city-living-checklist\.html"/);
 const sitemap=read('sitemap.xml');
 assert.equal((sitemap.match(/https:\/\/yiju\.zhibeimao\.com\/city-living-checklist\.html/g)||[]).length,1);
 assert.match(sitemap,/<lastmod>2026-11-13<\/lastmod>/);
});
