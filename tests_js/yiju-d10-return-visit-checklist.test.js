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
 for(const name of ['bar','count','progress','targetCity','cityContext','savedState','pendingOutput','reset','copyPending']) element(name);
 const localStorage={
  getItem(k){if(storageBlocked)throw Error('storage blocked');return store.has(k)?store.get(k):null},
  setItem(k,v){if(storageBlocked)throw Error('storage blocked');store.set(k,String(v));},
  removeItem(k){if(storageBlocked)throw Error('storage blocked');store.delete(k)}
 };
 const writes=[];
 const navigator=clipboard?{clipboard:{writeText:async v=>{writes.push(v)}}}:{};
 const document={
  title:'通用选城核查清单',
  querySelectorAll(s){assert.equal(s,'input[type="checkbox"]');return inputs},
  getElementById(id){return items.get(id)}
 };
 const first=html.lastIndexOf('<script>'),last=html.indexOf('</script>',first);
 assert.ok(first>=0&&last>first);
 const source=html.slice(first+8,last);
 new vm.Script(source,{filename:'city-living-checklist.html'}).runInNewContext(
  {document,localStorage,navigator,encodeURIComponent,Set,Date,location:{search},URLSearchParams}
 );
 return {items,inputs,writes,store,document};
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


test('D14 homepage uses the new source explorer version and preserves checklist links',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'../public/city-evidence-explorer.js'),'utf8');
 const probe=fs.readFileSync(path.join(__dirname,'../scripts/ops/yiju_public_api_probe.mjs'),'utf8');
 assert.match(page,/<script src="city-evidence-explorer\.js\?v=20261121-d14" defer><\/script>/);
 assert.match(source,/city-living-checklist\.html\?city=/);
 assert.match(probe,/homepage-js-fresh/);
 assert.match(probe,/hasChecklistDeepLink/);
 assert.match(probe,/hasFreshScriptVersion/);
 assert.match(probe,/hasCityLinkPrefill/);
});


test('WB01 homepage canonical and city detail checklist deep link are present',()=>{
 const home=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const detail=fs.readFileSync(path.join(__dirname,'../public/city-detail.html'),'utf8');
 assert.match(home,/<link rel="canonical" href="https:\/\/yiju\.zhibeimao\.com\/">/);
 assert.equal((home.match(/rel="canonical"/g)||[]).length,1);
 assert.match(detail,/<a id="cityChecklistLink"[^>]*hidden>/);
 const start=detail.indexOf("const checklistLink = document.getElementById('cityChecklistLink');");
 const end=detail.indexOf("document.getElementById('citySlogan')",start);
 assert.ok(start>=0&&end>start);
 const link={hidden:true,href:'city-living-checklist.html'};
 new vm.Script(detail.slice(start,end)).runInNewContext({document:{getElementById:()=>link},cityData:{name:'  张掖市  '},encodeURIComponent});
 assert.equal(link.hidden,false);
 const url=new URL(link.href,'https://yiju.zhibeimao.com/');
 assert.equal(url.pathname,'/city-living-checklist.html');
 const page=makePage(new Map(),{search:url.search});
 assert.equal(page.items.get('targetCity').value,'张掖市');
});


test('WB02 city-linked checklist shows correct context without changing generic canonical or saved progress',()=>{
 const store=new Map();
 const generic=makePage(store);
 assert.equal(generic.items.get('cityContext').hidden,true);
 assert.equal(generic.document.title,'通用选城核查清单');
 const linked=makePage(store,{search:'?city='+encodeURIComponent('琼海市')});
 assert.equal(linked.items.get('cityContext').hidden,false);
 assert.match(linked.items.get('cityContext').textContent,/当前考察城市：琼海市/);
 assert.match(linked.document.title,/琼海市/);
 linked.inputs[0].checked=true;linked.inputs[0].fire('change');
 assert.equal(makePage(store,{search:'?city='+encodeURIComponent('琼海市')}).inputs[0].checked,true);
 linked.items.get('targetCity').value='张掖市';linked.items.get('targetCity').fire('change');
 assert.match(linked.items.get('cityContext').textContent,/张掖市/);
 assert.equal(linked.inputs[0].checked,false);
 const bad=makePage(store,{search:'?city=%3Cscript%3E'});
 assert.equal(bad.items.get('cityContext').hidden,true);
 assert.equal(bad.document.title,'通用选城核查清单');
 assert.match(html,/<link rel="canonical" href="https:\/\/yiju\.zhibeimao\.com\/city-living-checklist\.html">/);
});
