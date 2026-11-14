const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..','public');
const key='5ddf663b0e3d4efcba8dfaded111021b';
test('IndexNow domain ownership key exists at public web root and contains only key',()=>{
 const file=path.join(base,key+'.txt');
 const body=fs.readFileSync(file,'utf8');
 assert.equal(body.trim(),key);
 assert.match(body,/^[a-f0-9]{32}\n?$/);
 assert.doesNotMatch(body,/Bearer|Authorization|YIJU_AGENT|SECRET/);
});
test('new verified city atlas and sitemap remain present',()=>{
 const atlas=fs.readFileSync(path.join(base,'2025-city-evidence-atlas.html'),'utf8');
 const sitemap=fs.readFileSync(path.join(base,'sitemap.xml'),'utf8');
 assert.match(atlas,/6座城市，28项/);
 assert.match(sitemap,/2025-city-evidence-atlas\.html/);
});
