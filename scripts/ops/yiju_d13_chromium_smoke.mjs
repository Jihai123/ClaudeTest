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
   // Production has html { scroll-behavior:smooth }. Do not compute a mouse
   // coordinate before scrolling completes: that can click a DIV instead of the link.
   const exists=await evalJs('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)return false;e.scrollIntoView({block:"center",behavior:"instant"});return true})()');
   if(!exists)throw Error('Element absent: '+selector);
   let p;
   for(let attempt=0;attempt<5;attempt++){
    await sleep(attempt?260:160);
    p=await evalJs('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)return null;const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);return {x,y,visible:r.width>0&&r.height>0,hit:hit===e||e.contains(hit),hitTag:hit?.tagName||null,hitClass:hit?.className||null}})()');
    if(p?.visible&&p.hit)break;
   }
   if(!p?.visible||!p.hit)throw Error('Click target not hit by pointer: '+selector+' '+JSON.stringify(p));
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
  // D13 same-day continued evidence: follow the production Baoji card as a user.
  const back=await call('Page.navigate',{url:ROOT});
  if(back.errorText)throw Error('Return to production homepage: '+back.errorText);
  await settled();
  await click('#evidenceExplorerSearch');
  await call('Input.insertText',{text:'宝鸡'});
  const baoji=await until(async()=>{const s=await summary();return s.names.length===1&&s.names[0]==='宝鸡市'?s:null;},'Baoji sourced city search');
  check(baoji.names.length===1,'desktop Chrome typed 宝鸡',{names:baoji.names,count:baoji.count});
  const linkProbe=await evalJs('(()=>{const a=document.querySelector("#evidenceExplorerCards .evidence-city-name");const r=a?.getBoundingClientRect();return {href:a?.href,target:a?.target,html:a?.outerHTML.slice(0,260),atPoint:r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,200):null}})()');
  console.log('YIJU_BROWSER_BAOJI_LINK '+JSON.stringify(linkProbe));
  await evalJs('(()=>{window.__yijuClickTrace=[];for(const type of ["pointerdown","pointerup","mousedown","mouseup","click"]){document.addEventListener(type,e=>{window.__yijuClickTrace.push({type,tag:e.target?.tagName,href:e.target?.href||"",defaultPrevented:e.defaultPrevented,isTrusted:e.isTrusted,active:document.activeElement?.tagName||""});},true);}return true})()');
  await click('#evidenceExplorerCards .evidence-city-name');
  const visible=()=>evalJs('(()=>({id:new URL(location.href).searchParams.get("id"),count:document.querySelectorAll("#officialFactsBody .official-fact-card").length,source:[...document.querySelectorAll("#officialFactsBody .official-fact-source")].map(x=>x.href),title:document.querySelector("#officialFactsCount")?.textContent}))()');
  let b970;
  try{b970=await until(async()=>{const x=await visible();return x.id==='970'&&x.count===13?x:null;},'Baoji 970 real city detail');}
  catch(err){
   const diagnostic=await evalJs('(()=>({url:location.href,state:document.readyState,title:document.title,cards:document.querySelectorAll("#officialFactsBody .official-fact-card").length,section:document.querySelector("#officialFactsSection")?.style.display,source:document.querySelector("#officialFactsCount")?.textContent,searchCount:document.querySelector("#evidenceExplorerCounter")?.textContent,clickTrace:window.__yijuClickTrace||null}))()');
   console.log('YIJU_BROWSER_BAOJI_DETAIL_DIAGNOSTIC '+JSON.stringify({linkProbe,diagnostic}));
   throw err;
  }
  check(b970.count===13,'desktop Baoji layflat ID970 visible 13 facts',{id:b970.id,count:b970.count,officialSource:b970.source.some(x=>x.includes('tjj.baoji.gov.cn'))});
  const nav1343=await call('Page.navigate',{url:ROOT+'city-detail.html?id=1343'});
  if(nav1343.errorText)throw Error('Baoji general detail navigation: '+nav1343.errorText);
  const b1343=await until(async()=>{const x=await visible();return x.id==='1343'&&x.count===13?x:null;},'Baoji 1343 real city detail');
  check(b1343.count===13,'desktop Baoji general ID1343 visible 13 facts',{id:b1343.id,count:b1343.count,officialSource:b1343.source.some(x=>x.includes('tjj.baoji.gov.cn'))});
  const navMobile=await call('Page.navigate',{url:ROOT});
  if(navMobile.errorText)throw Error('Return to production homepage for mobile: '+navMobile.errorText);
  await settled();

  await until(async()=>evalJs('(()=>{const b=document.querySelector("#rotateFeaturedCities");return !!(b&&!b.disabled&&document.querySelectorAll("#carouselTrack .featured-card").length>3)})()'),'featured carousel ready',15000);
  await sleep(600);
  const prev=await summary();
  if(prev.featured.length>3){
   const initial=await evalJs('(()=>({aria:document.querySelector("#rotateFeaturedCities")?.getAttribute("aria-label"),disabled:document.querySelector("#rotateFeaturedCities")?.disabled,cards:[...document.querySelectorAll("#carouselTrack .featured-card")].map(x=>x.dataset.cityId)}))()');
   await click('#rotateFeaturedCities');
   let rotated;
   try{rotated=await until(async()=>{const s=await summary();return s.featured[0]!==prev.featured[0]?s:null;},'featured carousel click');}
   catch(err){
    const after=await evalJs('(()=>({aria:document.querySelector("#rotateFeaturedCities")?.getAttribute("aria-label"),disabled:document.querySelector("#rotateFeaturedCities")?.disabled,cards:[...document.querySelectorAll("#carouselTrack .featured-card")].map(x=>x.dataset.cityId)}))()');
    console.log('YIJU_BROWSER_CAROUSEL_DIAGNOSTIC '+JSON.stringify({initial,after}));
    throw err;
   }
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
