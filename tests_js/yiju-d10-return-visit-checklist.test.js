'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../public/city-living-checklist.html'),'utf8');
function makePage(store=new Map(),{clipboard=true,storageBlocked=false,search=''}={}){
 const items=new Map();
 function element(id){
  const e={id,checked:false,textContent:'',value:'',hidden:true,
   style:{},handlers:{},setAttribute(name,value){this[name]=value;},
   addEventListener(type,fn){this.handlers[type]=fn;},
   fire(type){return this.handlers[type]();},
   focus(){this.focused=true;},select(){this.selected=true;}};
  items.set(id,e);return e;
 }
 const inputs=Array.from({length:6},(_,i)=>{
  const el=element('c'+(i+1));
  el.nextElementSibling={textContent:'核查事项'+(i+1)};
  return el;
 });
 for(const name of ['bar','count','progress','targetCity','savedState','pendingOutput','reset','copyPending']) element(name);
 const localStorage={
  getItem(k){if(storageBlocked)throw Error('storage blocked');return store.has(k)?store.get(k):null},
  setItem(k,v){if(storageBlocked)throw Error('storage blocked');store.set(k,String(v));},
  removeItem(k){if(storageBlocked)throw Error('storage blocked');store.delete(k)}
 };
 const writes=[];
 const navigator=clipboard?{clipboard:{writeText:async v=>{writes.push(v)}}}:{};
 const document={
  querySelectorAll(s){assert.equal(s,'input[type="checkbox"]');return inputs},
  getElementById(id){return items.get(id)}
 };
 const first=html.lastIndexOf('<script>'),last=html.indexOf('</script>',first);
 assert.ok(first>=0&&last>first);
 const source=html.slice(first+8,last);
 new vm.Script(source,{filename:'city-living-checklist.html'}).runInNewContext(
  {document,localStorage,navigator,encodeURIComponent,Set,Date,location:{search},URLSearchParams}
 );
 return {items,inputs,writes,store};
}

test('checklist progress persists per city and returns after reload',()=>{
 const store=new Map(),ui=makePage(store),city=ui.items.get('targetCity');
 city.value='西安';city.fire('change');
 ui.inputs[0].checked=true;ui.inputs[0].fire('change');
 assert.equal(ui.items.get('count').textContent,'已核查 1 / 6 项');
 assert.equal(store.has('yiju.checklist.items.v2:%E8%A5%BF%E5%AE%89'),true);
 city.value='鹤岗';city.fire('change');
 assert.equal(ui.inputs[0].checked,false);
 ui.inputs[1].checked=true;ui.inputs[1].fire('change');
 city.value='西安';city.fire('change');
 assert.equal(ui.inputs[0].checked,true);
 assert.equal(ui.inputs[1].checked,false);
 const reloaded=makePage(store);
 assert.equal(reloaded.items.get('targetCity').value,'西安');
 assert.equal(reloaded.inputs[0].checked,true);
 assert.equal(reloaded.items.get('progress')['aria-valuenow'],'1');
});

test('clear affects only active city and copy includes only unchecked items',async()=>{
 const ui=makePage();
 const city=ui.items.get('targetCity');
 city.value='张掖';city.fire('change');
 ui.inputs[0].checked=true;ui.inputs[0].fire('change');
 await ui.items.get('copyPending').fire('click');
 assert.equal(ui.writes.length,1);
 assert.match(ui.writes[0],/张掖/);
 assert.doesNotMatch(ui.writes[0],/核查事项1/);
 assert.match(ui.writes[0],/核查事项2/);
 assert.equal(ui.items.get('pendingOutput').hidden,false);
 ui.items.get('reset').fire('click');
 assert.equal(ui.inputs[0].checked,false);
 assert.equal(ui.items.get('count').textContent,'已核查 0 / 6 项');
 assert.equal(ui.store.has('yiju.checklist.items.v2:%E5%BC%A0%E6%8E%96'),false);
});

test('private storage or clipboard denial keeps checklist available',async()=>{
 const ui=makePage(new Map(),{clipboard:false,storageBlocked:true});
 ui.inputs[2].checked=true;ui.inputs[2].fire('change');
 assert.equal(ui.items.get('count').textContent,'已核查 1 / 6 项');
 assert.match(ui.items.get('savedState').textContent,/无法本地保存/);
 await ui.items.get('copyPending').fire('click');
 assert.equal(ui.items.get('pendingOutput').selected,true);
 assert.match(ui.items.get('savedState').textContent,/手动复制/);
});


test('sourced fact card links to a per-city checklist without mixing saved progress',()=>{
 const explorer=fs.readFileSync(path.join(__dirname,'../public/city-evidence-explorer.js'),'utf8');
 assert.match(explorer,/city-living-checklist\.html\?city=/);
 assert.match(explorer,/encodeURIComponent\(city\.name\)/);
 new vm.Script(explorer);
 const saved=new Map([
  ['yiju.checklist.active-city.v2','西安'],
  ['yiju.checklist.items.v2:%E5%AE%89%E5%BA%B7%E5%B8%82',JSON.stringify({checked:['c2']})]
 ]);
 const link='?city='+encodeURIComponent('安康市');
 const page=makePage(saved,{search:link});
 assert.equal(page.items.get('targetCity').value,'安康市');
 assert.equal(page.inputs[1].checked,true);
 assert.equal(page.items.get('count').textContent,'已核查 1 / 6 项');
 assert.equal(page.inputs[0].checked,false);
 const stale=makePage(saved,{search:'?city=%3Cscript%3Ebad%3C%2Fscript%3E'});
 assert.equal(stale.items.get('targetCity').value,'西安');
});


test('D11 homepage uses a fresh cache key for the sourced-city deep-link script',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'../public/city-evidence-explorer.js'),'utf8');
 const probe=fs.readFileSync(path.join(__dirname,'../scripts/ops/yiju_public_api_probe.mjs'),'utf8');
 assert.match(page,/<script src="city-evidence-explorer\.js\?v=20261118-d11" defer><\/script>/);
 assert.match(source,/city-living-checklist\.html\?city=/);
 assert.match(probe,/homepage-js-fresh/);
 assert.match(probe,/hasChecklistDeepLink/);
 assert.match(probe,/hasFreshScriptVersion/);
 assert.match(probe,/hasCityLinkPrefill/);
});
