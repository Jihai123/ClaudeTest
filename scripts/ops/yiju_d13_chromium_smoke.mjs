// Free, read-only Chromium verification of the actual public production UI.
// No login, POST, DB updates, screenshots of private content, or paid services.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const chrome=(process.env.CHROME_PATH||['google-chrome','google-chrome-stable','chromium','chromium-browser'].map(x=>spawnSync('which',[x],{encoding:'utf8'})).find(x=>x.status===0)?.stdout||'').trim();
const ROOT='https://yiju.zhibeimao.com/';
const observations=[];
function check(ok,name,details={}) {
 const value={name,ok:!!ok,...details};observations.push(value);
 console.log('YIJU_BROWSER_PROBE '+JSON.stringify(value));
 if(!ok)throw Error(name+' failed: '+JSON.stringify(details));
}
async function until(fn,name,ms=18000){
 const began=Date.now();let last;
 while(Date.now()-began<ms){try{const v=await fn();if(v)return v;last=v;}catch(e){last=e.message;}await sleep(300);}
 throw Error('Timeout '+name+': '+JSON.stringify(last));
}
async function connect(url){
 const sock=new WebSocket(url),waiting=new Map();let n=0;
 sock.addEventListener('message',ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}
 const p=waiting.get(m.id);if(!p)return;waiting.delete(m.id);
 m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result||{});
 });
 await new Promise((ok,err)=>{sock.addEventListener('open',ok,{once:true});sock.addEventListener('error',err,{once:true});});
 return {call:(method,params={})=>new Promise((resolve,reject)=>{
 const id=++n;waiting.set(id,{resolve,reject});sock.send(JSON.stringify({id,method,params}));
 }),close:()=>sock.close()};
}
async function main(){
 if(!chrome)throw Error('GitHub-hosted Chrome missing; not browser verified');
 const profile=mkdtempSync(join(tmpdir(),'yiju-ui-'));
 const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let session;
 try{
  const portFile=join(profile,'DevToolsActivePort');
  await until(()=>existsSync(portFile),'Chrome debug port',12000);
  const port=Number(readFileSync(portFile,'utf8').split('\n')[0]);
  const page=await until(async()=>{
   const r=await fetch('http://127.0.0.1:'+port+'/json/list');
   return (await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
  },'browser target',12000);
  session=await connect(page.webSocketDebuggerUrl);
  const call=session.call;
  const evalJs=async code=>{
   const r=await call('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
   return r.result?.value;
  };
  async function click(selector){
   const p=await evalJs('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()');
   if(!p)throw Error('Element absent or hidden: '+selector);
   for(const type of ['mouseMoved','mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:type==='mouseMoved'?'none':'left',clickCount:1});
  }
  const summary=()=>evalJs('(()=>({names:[...document.querySelectorAll("#evidenceExplorerCards .evidence-city-name")].map(x=>x.textContent.trim()),labels:[...document.querySelectorAll("#evidenceExplorerCards .evidence-metric-label")].map(x=>x.textContent.trim()),count:document.querySelector("#evidenceExplorerCounter")?.textContent||"",saved:document.querySelector(".evidence-card .evidence-save")?.getAttribute("aria-pressed"),inputRight:document.querySelector("#evidenceExplorerSearch")?.getBoundingClientRect().right,viewport:innerWidth,featured:[...document.querySelectorAll("#carouselTrack .featured-card")].map(x=>x.dataset.cityId)}))()');
  const settled=()=>until(()=>evalJs('(()=>document.readyState==="complete"&&document.querySelectorAll("#evidenceExplorerCards .evidence-card").length>=6&&!!document.querySelector("#evidenceExplorerSearch")&&!!document.querySelector("#rotateFeaturedCities"))()'),'city cards and JS controls',20000);
  await call('Page.enable');await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1365,height:900,deviceScaleFactor:1,mobile:false});
  const nav=await call('Page.navigate',{url:ROOT});
  if(nav.errorText)throw Error('Production browser navigation: '+nav.errorText);
  await settled();
  const start=await summary();
  check(start.names.length>=6,'desktop home rendered',{cards:start.names.length});
  await click('#evidenceExplorerSearch');
  await call('Input.insertText',{text:'张掖'});
  const found=await until(async()=>{const s=await summary();return s.names.length===1&&s.names[0]==='张掖市'?s:null;},'desktop typed search');
  check(found.names.length===1,'desktop Chrome typed 张掖',{names:found.names,count:found.count});
  await click('[data-evidence-group="care"]');
  const medical=await until(async()=>{const s=await summary();return s.labels.some(x=>x.includes('医院'))?s:null;},'care category');
  check(medical.names.length===1,'desktop medical category real click',{labels:medical.labels});
  const prev=await summary();
  if(prev.featured.length>3){
   await click('#rotateFeaturedCities');
   const rotated=await until(async()=>{const s=await summary();return s.featured[0]!==prev.featured[0]?s:null;},'featured carousel click');
   check(true,'desktop featured rotation real click',{before:prev.featured[0],after:rotated.featured[0]});
  }else check(false,'featured rotation coverage',{cardCount:prev.featured.length});
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await call('Page.reload',{ignoreCache:true});
  await settled();
  const mobile=await summary();
  check(mobile.inputRight<=mobile.viewport+2,'mobile input within viewport',{right:mobile.inputRight,viewport:mobile.viewport});
  await click('#evidenceExplorerSearch');
  await call('Input.insertText',{text:'甘肃'});
  const province=await until(async()=>{const s=await summary();return s.names.length===1&&s.names[0]==='张掖市'?s:null;},'mobile province filter');
  check(province.names.length===1,'mobile Chrome typed 甘肃',{names:province.names});
  await click('.evidence-card .evidence-save');
  const saved=await until(async()=>{const s=await summary();return s.saved==='true'?s:null;},'mobile save clicked');
  check(saved.saved==='true','mobile bookmark real click',{saved:saved.saved});
  console.log('YIJU_BROWSER_PROBE_SUMMARY '+JSON.stringify({checkedAt:new Date().toISOString(),base:ROOT,viewportChecks:['1365x900','390x844'],passed:observations.length,failed:0}));
 }finally{
  session?.close();proc.kill('SIGTERM');await sleep(350);
  try{rmSync(profile,{recursive:true,force:true,maxRetries:6,retryDelay:200});}catch(e){console.warn('YIJU_BROWSER_CLEANUP '+e.message);}
 }
}
main().catch(e=>{console.error('YIJU_BROWSER_PROBE_FAIL '+JSON.stringify({at:new Date().toISOString(),error:e.message,passed:observations.length}));process.exitCode=1;});
