// Exercise actual App credit/export handlers with local inert account and HTTP
// boundaries. No live account, payment provider, AI or customer write is used.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {walletScope,hasWalletBalance} from '../src/wallet-refresh.js';
import {outputAccessResult} from '../src/output-rights.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
function compile(name,e){const a=main.indexOf(' const '+name+'='),b=main.indexOf('\n };',a);assert(a>=0&&b>a,name);return new Function('env',`with(env){${main.slice(a,b+4)};return ${name}}`)(e)}
const rows=[];
const check=async(name,run)=>{await run();rows.push({name,passed:true});console.log('PASS '+name)};
function fixture({premium=2,legacy=0}={}){
 const events=[],unlocked=new Map(),storage={token:'fixture-token',wallet:'fixture-wallet'};
 let balance={premium,legacy};
 const summary=()=>({walletId:storage.wallet,processRemaining:balance.legacy,premiumDownloadRemaining:balance.premium});
 const e={walletScope,hasWalletBalance,checkoutReturnRef:{current:null},checkoutBusyRef:{current:false},currentOutputJobRef:{current:'job-a'},savedWorkOpenRequestRef:{current:1},
  authToken:()=>storage.token,currentWalletId:()=>storage.wallet,walletHeaders:()=>({Authorization:'Bearer '+storage.token,'X-Wallet-Id':storage.wallet}),
  refreshWallet:async options=>{events.push(['refresh',options]);return summary()},
  claimAccountOutput:async()=>events.push(['claim']),
  portraitFetch:async(url,options)=>{
   events.push(['request',url,options]);const job=decodeURIComponent(url.split('/')[3]),premium=JSON.parse(options.body||'{}').premium===true;
   if(!unlocked.has(job)){
    if(premium?balance.premium<1:balance.legacy<1)return {ok:false,status:402,json:async()=>({error:'credit_required'})};
    if(premium)balance.premium--;else balance.legacy--;unlocked.set(job,{premium});
   }
   return {ok:true,status:200,json:async()=>({ok:true,...summary()})};
  },
  acceptWalletRights:data=>events.push(['balance',data]),
  verifyOutputRights:async id=>{events.push(['verify',id]);const right=unlocked.get(id);return {checked:true,unlocked:!!right,fullEdit:!!right,premiumHair:right?.premium===true}},
 };
 for(const n of ['setPendingPackage','setAuthMode','setAuthOpen','setPayMsg','setPayBusy','setBuyOpen','setTrialPreview','setAccountSaveNotice','setDownloadUnlockSignal'])e[n]=value=>events.push([n,value]);
 e.savePaidCheckout=compile('savePaidCheckout',e);e.useDownloadCredit=compile('useDownloadCredit',e);e.unlockOutputWithCredit=compile('unlockOutputWithCredit',e);
 return {e,events,storage,unlocked,summary,setJob:id=>{e.currentOutputJobRef.current=id;e.savedWorkOpenRequestRef.current++},setBalance:(premium,legacy=balance.legacy)=>{balance={premium,legacy}},get premium(){return balance.premium},get legacy(){return balance.legacy},requests:()=>events.filter(v=>v[0]==='request'),signals:()=>events.filter(v=>v[0]==='setDownloadUnlockSignal'),buys:()=>events.filter(v=>v[0]==='setBuyOpen'&&v[1]===true)};
}
await check('ordinary direct download consumes premium credits2→1→0 with fresh authoritative balance and no automatic original-file signal',async()=>{
 const f=fixture();for(const job of ['job-a','job-b']){
  f.setJob(job);const r=await f.e.unlockOutputWithCredit(job);assert.deepEqual(r,{available:true,unlocked:true,message:''});
 }
 assert.equal(f.premium,0);assert.equal(f.requests().length,2);assert(f.requests().every(v=>JSON.parse(v[2].body).premium===true));assert.equal(f.signals().length,0);assert.equal(f.buys().length,0);assert.equal(f.events.filter(v=>v[0]==='verify').length,2);
 f.setJob('job-c');assert.deepEqual(await f.e.unlockOutputWithCredit('job-c'),{available:false,unlocked:false});assert.equal(f.requests().length,2);
});
await check('a stale zero visible balance cannot hide two fresh premium credits',async()=>{
 const f=fixture();f.e.rights={premiumDownloadRemaining:0,downloadRemaining:0};assert.equal((await f.e.unlockOutputWithCredit('job-a')).unlocked,true);assert.equal(f.premium,1);assert.equal(f.requests().length,1);assert.deepEqual(f.events[0],['refresh',{throwOnError:true}]);
});
await check('a stale positive visible balance cannot spend or bypass a fresh zero balance',async()=>{
 const f=fixture({premium:0});f.e.rights={premiumDownloadRemaining:2,downloadRemaining:2};assert.deepEqual(await f.e.unlockOutputWithCredit('job-a'),{available:false,unlocked:false});assert.equal(f.requests().length,0);assert.equal(f.buys().length,0);
});
await check('a concurrently unlocked work at zero balance resumes without spending or suggesting a package',async()=>{
 const f=fixture({premium:0});f.unlocked.set('job-a',{premium:true});assert.deepEqual(await f.e.unlockOutputWithCredit('job-a'),{available:true,unlocked:true});assert.equal(f.requests().length,0);assert.equal(f.buys().length,0);assert.equal(f.events.filter(v=>v[0]==='verify').length,1);assert.equal(f.signals().length,0);
});
await check('zero balance with unavailable or malformed current-work rights is retryable rather than a new-purchase invitation',async()=>{
 for(const right of [undefined,{checked:false,unlocked:null},{checked:true},{checked:true,unlocked:'true'},'offline']){
  const f=fixture({premium:0});f.e.verifyOutputRights=async()=>{if(right==='offline')throw Error('fixture rights offline');return right};const r=await f.e.unlockOutputWithCredit('job-a');assert.equal(r.available,true);assert.equal(r.unlocked,false);assert.equal(f.requests().length,0);assert.equal(f.buys().length,0);
 }
});
await check('a zero-balance concurrent rights response cannot escape an account or work change',async()=>{
 for(const changed of ['account','job','work']){
  const f=fixture({premium:0});f.e.verifyOutputRights=async()=>{if(changed==='account')f.storage.token='other';else if(changed==='job')f.e.currentOutputJobRef.current='other';else f.e.savedWorkOpenRequestRef.current++;return {checked:true,unlocked:true,premiumHair:true}};const r=await f.e.unlockOutputWithCredit('job-a');assert.equal(r.available,true);assert.equal(r.unlocked,false);assert.equal(f.requests().length,0);assert.equal(f.signals().length,0);
 }
});
await check('premium credits take the159 path while legacy credits retain their own basic path',async()=>{
 const both=fixture({premium:2,legacy:7});assert.equal((await both.e.unlockOutputWithCredit('job-a')).unlocked,true);assert.equal(both.premium,1);assert.equal(both.legacy,7);assert.equal(JSON.parse(both.requests()[0][2].body).premium,true);
 const old=fixture({premium:0,legacy:3});assert.equal((await old.e.unlockOutputWithCredit('job-a')).unlocked,true);assert.equal(old.legacy,2);assert.equal(old.requests()[0][2].body,undefined);assert.equal(old.unlocked.get('job-a').premium,false);
});
await check('guest or missing/replaced output never triggers a balance debit',async()=>{
 const guest=fixture();guest.storage.token='';assert.deepEqual(await guest.e.unlockOutputWithCredit('job-a'),{available:false,unlocked:false});assert.equal(guest.events.length,0);
 for(const job of ['',null,'different']){const f=fixture(),r=await f.e.unlockOutputWithCredit(job);assert.equal(r.available,true);assert.equal(r.unlocked,false);assert.equal(f.requests().length,0);assert.equal(f.events.filter(v=>v[0]==='refresh').length,0)}
});
await check('offline failed and wrong-wallet balance reads stay retryable without a purchase suggestion or debit',async()=>{
 for(const reply of ['offline',null,{walletId:'other',processRemaining:0,premiumDownloadRemaining:2},{walletId:'fixture-wallet',processRemaining:'bad',premiumDownloadRemaining:2}]){
  const f=fixture();f.e.refreshWallet=async()=>{if(reply==='offline')throw Error('fixture offline');return reply};const r=await f.e.unlockOutputWithCredit('job-a');assert.equal(r.available,true);assert.equal(r.unlocked,false);assert(r.message);assert.equal(f.requests().length,0);assert.equal(f.buys().length,0);
 }
});
await check('malformed premium or legacy balances fail closed before a credit request',async()=>{
 for(const key of ['premiumDownloadRemaining','processRemaining'])for(const value of ['bad',Infinity,NaN,-1,.5,true,[2],{}]){
  const f=fixture();f.e.refreshWallet=async()=>({...f.summary(),[key]:value});const r=await f.e.unlockOutputWithCredit('job-a');assert.equal(r.available,true,key+' '+String(value));assert.equal(r.unlocked,false,key+' '+String(value));assert.equal(f.requests().length,0,key+' '+String(value));
 }
});
await check('pending checkout or in-flight credit redemption never starts a parallel redemption',async()=>{
 for(const key of ['checkoutReturnRef','checkoutBusyRef']){const f=fixture();f.e[key].current=true;const r=await f.e.unlockOutputWithCredit('job-a');assert.equal(r.available,true);assert.equal(r.unlocked,false);assert.equal(f.requests().length,0);assert.equal(f.events.filter(v=>v[0]==='refresh').length,0)}
});
for(const at of ['balance','claim','unlock','verify'])for(const identity of ['account','job','work']){
 await check(identity+' changes during '+at+' cannot authorize the replacement output',async()=>{
  const f=fixture(),change=()=>{if(identity==='account')f.storage.token='other';else if(identity==='job')f.e.currentOutputJobRef.current='other';else f.e.savedWorkOpenRequestRef.current++};
  if(at==='balance')f.e.refreshWallet=async()=>{const r=f.summary();change();return r};
  else if(at==='claim')f.e.claimAccountOutput=async()=>change();
  else if(at==='unlock'){const request=f.e.portraitFetch;f.e.portraitFetch=async(...args)=>{const r=await request(...args);change();return r}}
  else{const verify=f.e.verifyOutputRights;f.e.verifyOutputRights=async(...args)=>{const r=await verify(...args);change();return r}}
  const r=await f.e.unlockOutputWithCredit('job-a');assert.equal(r.available,true);assert.equal(r.unlocked,false);assert.equal(f.signals().length,0);assert.equal(f.buys().length,0);
  if(at==='balance'||at==='claim')assert.equal(f.requests().length,0);
 });
}
await check('unconfirmed premium rights never complete a direct download after a server response',async()=>{
 for(const right of [{checked:false,unlocked:null},{checked:true,unlocked:false},{checked:true,unlocked:true,premiumHair:false}]){
  const f=fixture();f.e.verifyOutputRights=async()=>right;const r=await f.e.unlockOutputWithCredit('job-a');assert.equal(r.available,true);assert.equal(r.unlocked,false);assert.equal(f.signals().length,0);assert.equal(f.buys().length,0);assert(!f.events.some(v=>v[0]==='setTrialPreview'&&v[1]===false));
 }
});
await check('default explicit credit button retains auto-download while direct download suppresses only that signal',async()=>{
 const f=fixture();assert.equal(await f.e.useDownloadCredit({premium:true}),true);assert.equal(f.signals().length,1);assert.equal(f.signals()[0][1].jobId,'job-a');assert.equal(f.premium,1);
 assert.equal(await f.e.useDownloadCredit({premium:true,autoDownload:false}),true);assert.equal(f.signals().length,1);assert.equal(f.premium,1);assert.equal(f.requests().length,2);assert(f.events.some(v=>v[0]==='setTrialPreview'&&v[1]===false));
 f.setJob('job-b');assert.equal(await f.e.useDownloadCredit({premium:true,autoDownload:false}),true);assert.equal(f.premium,0);f.setJob('job-a');assert.equal(await f.e.useDownloadCredit({premium:true,autoDownload:false}),true);assert.equal(f.premium,0);assert.equal(f.signals().length,1);
});
function legacyFixture({paid=false,credit={available:true,unlocked:true}}={}){
 const f=fixture(),events=f.events,master={},lock={};let outputPaid=paid;
 Object.assign(f.e,{editCache:{current:{master,lock}},downloadBusyRef:{current:false},downloadBusy:false,hairBusy:false,busy:false,uniformChanging:false,photoSizeBusy:false,
  setDownloadBusy:v=>events.push(['downloadBusy',v]),setMsg:v=>events.push(['message',v]),setDownloadNotice:v=>events.push(['notice',v]),trialPreview:!paid,
  DEFAULT_PHOTO_CROP:{sizeId:'original'},photoCrop:{sizeId:'2-inch',scale:1.22,x:11,y:-5},outputAccessResult,withDeadline:async fn=>fn(),analyticsEvent:()=>{},
  verifyOutputRights:async()=>({checked:true,unlocked:outputPaid,fullEdit:outputPaid,premiumHair:outputPaid}),
  unlockOutputWithCredit:async job=>{events.push(['direct-credit',job]);if(credit.unlocked)outputPaid=true;return credit},
  beautyTimerRef:{current:null},beautyRenderRef:{current:0},renderTimer:{current:null},renderSeqRef:{current:0},liveAdjustRef:{current:{}},liveCollarWarpRef:{current:0},liveNeckAdjustRef:{current:{}},backgroundRef:{current:null},ribbonRef:{current:null},ribbonAdjustRef:{current:{}},collarPinRef:{current:null},collarPinAdjustRef:{current:{left:{},right:{}}},liveCollarHeightRef:{current:0},chestPinRef:{current:null},chestPinAdjustRef:{current:{}},beautyRef:{current:{}},
  renderAdjustedFinal:async()=>{events.push(['render']);return new Blob(['base'])},applyLocalBeauty:async blob=>blob,
  cropPhotoForDownload:async(blob,crop)=>{events.push(['crop',{...crop}]);return new Blob(['selected-size'])},beautyBaseRef:{current:null},beautyPreviewBaseRef:{current:null},showBlob:()=>{},deliverImage:(blob,name)=>{events.push(['delivery',blob,name]);return 'download'},
 });
 return {...f,download:compile('downloadCurrentFinal',f.e)};
}
await check('legacy normal download redeems silently and delivers exactly its selected size without opening packages',async()=>{
 const f=legacyFixture();await f.download();assert.equal(f.events.filter(v=>v[0]==='direct-credit').length,1);assert.equal(f.events.filter(v=>v[0]==='delivery').length,1);assert.deepEqual(f.events.find(v=>v[0]==='crop')[1],{sizeId:'2-inch',scale:1.22,x:11,y:-5});assert.equal(f.events.find(v=>v[0]==='delivery')[2],'photo-ready-2-inch.png');assert.equal(f.buys().length,0);assert.equal(f.signals().length,0);
});
await check('legacy paid output skips credit consumption and keeps its existing file delivery',async()=>{
 const f=legacyFixture({paid:true});await f.download();assert.equal(f.events.filter(v=>v[0]==='direct-credit').length,0);assert.equal(f.events.filter(v=>v[0]==='delivery').length,1);assert.equal(f.buys().length,0);
});
await check('legacy zero credits opens the existing package flow while uncertain redemption stays retryable',async()=>{
 const empty=legacyFixture({credit:{available:false,unlocked:false}});await empty.download();assert.equal(empty.buys().length,1);assert.equal(empty.events.filter(v=>v[0]==='delivery').length,0);
 const uncertain=legacyFixture({credit:{available:true,unlocked:false,message:'fixture retry without repaying'}});await uncertain.download();assert.equal(uncertain.buys().length,0);assert.equal(uncertain.events.filter(v=>v[0]==='delivery').length,0);assert(uncertain.events.some(v=>v[0]==='notice'&&v[1]?.state==='error'));
});
await check('legacy credit success still requires a fresh paid right and unchanged captured scene',async()=>{
 for(const change of ['unconfirmed','scene']){
  const f=legacyFixture();f.e.unlockOutputWithCredit=async()=>{if(change==='scene')f.e.editCache.current={master:{},lock:{}};return {available:true,unlocked:true}};
  await f.download();assert.equal(f.events.filter(v=>v[0]==='delivery').length,0);assert.equal(f.buys().length,0);assert(f.events.some(v=>v[0]==='notice'&&v[1]?.state==='error'));
 }
});
const result={passed:rows.length,failed:0,sourceSha256:createHash('sha256').update(main).digest('hex'),scope:'Actual App direct-credit, existing credit redemption/rights confirmation and retained legacy download handlers. Wallet/account/HTTP/render boundaries are local inert fixtures; no production customer account, payment or provider mutation.',results:rows};
const output=process.env.IDPROM_DIRECT_CREDIT_OUTPUT;
if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({passed:rows.length,failed:0}));
