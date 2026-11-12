// Regression: verified facts are real user-visible, source-linked static content.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'public/verified-city-facts.html'),'utf8');
const sitemap=fs.readFileSync(path.join(root,'public/sitemap.xml'),'utf8');

test('official fact page is indexable static HTML and has inbound sitemap entry',()=>{
  assert.match(page,/<!DOCTYPE html>/i);
  assert.match(page,/<html lang="zh-CN">/);
  assert.match(page,/<h1>城市公开数据核验/);
  assert.match(page,/rel="canonical" href="https:\/\/yiju\.zhibeimao\.com\/verified-city-facts\.html"/);
  assert.match(sitemap,/<loc>https:\/\/yiju\.zhibeimao\.com\/verified-city-facts\.html<\/loc>/);
  assert.doesNotMatch(page,/tangping\.com|yourdomain\.com/);
});

test('both exact production city IDs and government source URLs are present',()=>{
  assert.match(page,/\/city-detail\.html\?id=1238/);
  assert.match(page,/\/city-detail\.html\?id=897/);
  assert.match(page,/https:\/\/www\.xa\.gov\.cn\/sq\/csgk\/rkzk\/1\.html/);
  assert.match(page,/https:\/\/www\.hegang\.gov\.cn\/hegang\/tjgb\/202608\/92535\.shtml/);
  assert.match(page,/2025年末常住人口/);
  assert.match(page,/1323\.63 万人/);
  assert.match(page,/13902\.67 亿元/);
  assert.match(page,/81\.01%/);
  assert.match(page,/737 个/);
  assert.match(page,/42 个/);
  assert.match(page,/7312 张/);
  assert.match(page,/117 家 \/ 6176 张/);
});

test('published source notes distinguish units from site scores and include update date',()=>{
  assert.match(page,/不能直接推断单个街道/);
  assert.match(page,/不将“卫生机构737个”写成易居医疗维度737分/);
  assert.match(page,/2026年11月12日/);
  assert.match(page,/noopener noreferrer/);
});
