import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const draftSource=await readFile(new URL('../src/purchase-draft.js',import.meta.url),'utf8');
const panelSource=await readFile(new URL('../src/promptpay-panel.jsx',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,bad)=>{resolve=ok;reject=bad});return {promise,resolve,reject}};
let tested=0;
async function test(name,run){await run();tested++;console.log('PASS:',name)}
function draftEnv(){
 const timers=new Map(),opens=[],session=new Map(),records=new Map(),transactions=[];let timerId=0;
 const e={DOMException,Blob,btoa,atob,File:globalThis.File,Uint8Array,sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),indexedDB:{open:()=>{const r={};opens.push(r);return r}}};
 const module=new Function('env',`with(env){${draftSource.replace(/export /g,'')};return {savePurchaseDraft,loadPurchaseDraft}}`)(e);
 function connect(index){const r=opens[index],db={closed:false,close(){this.closed=true},objectStoreNames:{contains:()=>true},transaction(store,mode){const tx={aborted:false,pending:null,abort(){this.aborted=true;this.onabort?.()},objectStore(){return {put(value,key){tx.pending={value,key};return {}},get(key){const result={result:records.get(key)};queueMicrotask(()=>result.onsuccess?.());return result}}},complete(){if(!this.aborted){if(this.pending)records.set(this.pending.key,this.pending.value);this.oncomplete?.()}}};transactions.push(tx);return tx}};r.result=db;r.onsuccess?.();return db}
 return {...module,e,timers,opens,records,transactions,session,connect,expire(){const scheduled=[...timers.values()];timers.clear();scheduled.forEach(fn=>fn())}};
}
await test('late IndexedDB open cannot overwrite a newer successful checkout draft',async()=>{
 const e=draftEnv();const first=e.savePurchaseDraft({walletId:'A',jobId:'A'});await tick();assert.equal(e.opens.length,1);e.expire();await first;
 const second=e.savePurchaseDraft({walletId:'B',jobId:'B'});await tick();e.connect(1);await tick();e.transactions[0].complete();await second;assert.equal(e.records.get('current').jobId,'B');
 const late=e.connect(0);await tick();assert.equal(e.transactions.length,1,'timed-out database open must never create a late write');assert.equal(late.closed,true);assert.equal(e.records.get('current').jobId,'B');
});
await test('timed-out IndexedDB write is aborted before a later draft is saved',async()=>{
 const e=draftEnv(),first=e.savePurchaseDraft({jobId:'A'});await tick();e.connect(0);await tick();assert.equal(e.transactions.length,1);e.expire();await first;assert.equal(e.transactions[0].aborted,true);
 const second=e.savePurchaseDraft({jobId:'B'});await tick();e.connect(1);await tick();e.transactions[1].complete();await second;e.transactions[0].complete();assert.equal(e.records.get('current').jobId,'B');
});
await test('storage quota denial prevents durable checkout and preserves complete memory draft',async()=>{
 const e=draftEnv(),photo=new Blob(['fixture-photo'],{type:'image/png'});e.e.sessionStorage.setItem=()=>{throw new DOMException('quota','QuotaExceededError')};const saving=e.savePurchaseDraft({jobId:'A',originalFile:photo});await tick();e.opens[0].error=new DOMException('denied','SecurityError');e.opens[0].onerror();await assert.rejects(saving,{name:'DraftStorageError',primaryCode:'SecurityError',backupCode:'QuotaExceededError'});assert.equal((await e.loadPurchaseDraft()).originalFile,photo);
});
await test('session backup restores original blobs after IndexedDB denial',async()=>{
 const e=draftEnv(),photo=new Blob(['fixture-photo'],{type:'image/png'}),saving=e.savePurchaseDraft({walletId:'A',jobId:'A',originalFile:photo});await tick();e.opens[0].error=new DOMException('denied','SecurityError');e.opens[0].onerror();const result=await saving;assert.equal(result.storage,'session');const restored=draftEnv();for(const [key,value] of e.session)restored.session.set(key,value);const draft=await restored.loadPurchaseDraft();assert.equal(draft.jobId,'A');assert.equal(await draft.originalFile.text(),'fixture-photo');
});
await test('completed IndexedDB read restores the saved checkout draft',async()=>{
 const e=draftEnv();e.records.set('current',{walletId:'A',jobId:'saved',studio:{layers:[{name:'head',jobId:'saved'}]}});const loading=e.loadPurchaseDraft();await tick();e.connect(0);await tick();e.transactions[0].complete();const draft=await loading;assert.equal(draft.jobId,'saved');assert.equal(draft.studio.layers[0].jobId,'saved');
});
await test('blocked database falls back to session and closes any late connection',async()=>{
 const e=draftEnv(),saving=e.savePurchaseDraft({jobId:'blocked'});await tick();e.opens[0].onblocked();const result=await saving;assert.equal(result.storage,'session');const late=e.connect(0);await tick();assert.equal(late.closed,true);assert.equal(e.transactions.length,0);
});
function panelEnv(packageId='89'){
 const effects=[],requests=[],intervals=[],clearedIntervals=new Set(),events={focus:[],visibilitychange:[]},messages=[],checking=[],payment={paymentIntentId:'pi_fixture',walletId:'A',packageId,amount:Number(packageId)},settlement=deferred();let paid=0,received;
 const removeListener=(name,fn)=>{const index=events[name].indexOf(fn);if(index>=0)events[name].splice(index,1)};
 const e={payment,coveredRef:{current:false},setCovered:()=>{},callbacks:{current:{headers:()=>({'X-Wallet-Id':'A'}),onPaid:async(...args)=>{paid++;received=args;return settlement.promise}}},checkRef:{current:null},lifecycleRef:{current:null},downloadRef:{current:null},actionRef:{current:null},setExpired:()=>{},setImageError:()=>{},setDownloading:()=>{},setMessage:value=>messages.push(value),setChecking:value=>checking.push(value),AbortController,Date,encodeURIComponent,requestPromptpay:(url,options)=>{const d=deferred();requests.push({url,options,...d});return d.promise},useEffect:effect=>effects.push(effect),setInterval:fn=>{intervals.push(fn);return intervals.length},clearInterval:id=>clearedIntervals.add(id),window:{addEventListener:(name,fn)=>events[name].push(fn),removeEventListener:removeListener},document:{visibilityState:'visible',addEventListener:(name,fn)=>events[name].push(fn),removeEventListener:removeListener}};
 const start=panelSource.indexOf(' useEffect(()=>{'),end=panelSource.indexOf('\n const download=',start);assert(start>=0&&end>start);new Function('env',`with(env){${panelSource.slice(start,end)}}`)(e);const cleanup=effects[0]();
 return {e,requests,events,messages,checking,payment,settlement,cleanup,paid:()=>paid,received:()=>received,intervals,clearedIntervals};
}
await test('banking-app focus events share one pending paid settlement',async()=>{
 const e=panelEnv();e.requests[0].resolve({response:{ok:true},data:{ok:true,status:'succeeded',paymentIntentId:'pi_fixture'}});await tick();assert.equal(e.paid(),1);assert.equal(e.received()[1],e.payment);e.events.focus[0]();e.events.visibilitychange[0]();e.intervals[0]();await tick();assert.equal(e.requests.length,1,'focus must not abort and repeat settlement');e.settlement.resolve();await tick();e.events.focus[0]();assert.equal(e.requests.length,1);e.cleanup();
});
await test('failed paid-rights verification permits a later manual retry',async()=>{
 const e=panelEnv();e.requests[0].resolve({response:{ok:true},data:{ok:true,status:'succeeded'}});await tick();e.settlement.reject(Error('rights temporarily unavailable'));await tick();assert(e.messages.includes('rights temporarily unavailable'));e.e.checkRef.current();assert.equal(e.requests.length,2);e.cleanup();
});
await test('focus replaces a suspended status read and ignores its late response',async()=>{
 const e=panelEnv();e.events.focus[0]();assert.equal(e.requests.length,2);assert.equal(e.requests[0].options.signal.aborted,true);e.requests[0].resolve({response:{ok:true},data:{ok:true,status:'succeeded'}});await tick();assert.equal(e.paid(),0);e.requests[1].resolve({response:{ok:true},data:{status:'processing'}});await tick();assert.equal(e.messages.at(-1),'กำลังยืนยันการชำระเงิน…');e.cleanup();
});
await test('a sibling payment hides the old QR and settles the existing output once',async()=>{
 const e=panelEnv();e.requests[0].resolve({response:{ok:true},data:{ok:true,status:'work_unlocked',paymentIntentId:'pi_fixture',paidElsewhere:true}});await tick();assert.equal(e.paid(),1);assert.equal(e.e.coveredRef.current,true);e.events.focus[0]();assert.equal(e.requests.length,1);e.settlement.resolve();await tick();e.events.focus[0]();assert.equal(e.requests.length,1);e.cleanup();
});
await test('covered-work verification failure permits retry while keeping old QR unavailable',async()=>{
 const e=panelEnv();e.requests[0].resolve({response:{ok:true},data:{ok:true,status:'work_unlocked',paymentIntentId:'pi_fixture'}});await tick();e.settlement.reject(Error('rights temporarily unavailable'));await tick();assert.equal(e.e.coveredRef.current,true);assert(e.messages.includes('rights temporarily unavailable'));e.e.checkRef.current();assert.equal(e.requests.length,2);e.cleanup();
});
await test('a QR image requested before another payment settles is never delivered late',async()=>{
 const e=panelEnv(),delivered=[];e.e.deliverImage=(...args)=>delivered.push(args);
 const start=panelSource.indexOf(' const download=async'),end=panelSource.indexOf('\n const changePackage=',start);assert(start>=0&&end>start);
 const download=new Function('env',`with(env){${panelSource.slice(start,end)};return download}`)(e.e);
 const pending=download();await tick();assert.equal(e.requests.length,2);assert(e.requests[1].url.endsWith('/image'));
 e.requests[0].resolve({response:{ok:true},data:{ok:true,status:'work_unlocked',paymentIntentId:'pi_fixture'}});await tick();assert.equal(e.e.coveredRef.current,true);
 e.requests[1].resolve({response:{ok:true},data:new Blob(['old QR'],{type:'image/png'})});await pending;assert.equal(delivered.length,0);assert(!e.messages.some(m=>m.startsWith('ส่งคำขอบันทึก QR')));
 await download();assert.equal(e.requests.length,2,'a covered work must not request another QR image');e.settlement.resolve();await tick();e.cleanup();
});
await test('closed QR download refreshes settled rights instead of suggesting a screenshot',async()=>{
 const e=panelEnv(),delivered=[];e.e.deliverImage=(...args)=>delivered.push(args);e.requests[0].resolve({response:{ok:true},data:{status:'requires_action'}});await tick();
 const start=panelSource.indexOf(' const download=async'),end=panelSource.indexOf('\n const changePackage=',start);const download=new Function('env',`with(env){${panelSource.slice(start,end)};return download}`)(e.e);
 const pending=download();await tick();e.requests[1].resolve({response:{ok:false,status:409},data:new Blob(['closed'])});await tick();assert.equal(e.requests.length,3);assert(!e.messages.some(m=>m.includes('ถ่ายภาพหน้าจอ')));
 e.requests[2].resolve({response:{ok:true},data:{ok:true,status:'work_unlocked',paymentIntentId:'pi_fixture'}});await tick();assert.equal(e.paid(),1);e.settlement.resolve();await pending;assert.equal(delivered.length,0);assert.equal(e.e.coveredRef.current,true);e.cleanup();
});
for(const terminal of ['canceled','expired'])await test('closed 89/159 '+terminal+' receipts stop timer/focus checks only after an authoritative response',async()=>{
 for(const packageId of ['89','159']){
  const e=panelEnv(packageId),focus=e.events.focus[0],visibility=e.events.visibilitychange[0];
  e.requests[0].resolve({response:{ok:true},data:{status:'requires_action',expiresAt:Math.floor(Date.now()/1000)+3600}});await tick();
  assert.equal(e.clearedIntervals.size,0);focus();assert.equal(e.requests.length,2);
  const terminalData={status:terminal};
  e.requests[1].resolve({response:{ok:false,status:503},data:terminalData});await tick();
  assert.equal(e.clearedIntervals.size,0,'failed HTTP responses cannot stop recovery');
  visibility();assert.equal(e.requests.length,3);e.requests[2].resolve({response:{ok:true},data:terminalData});await tick();
  assert(e.clearedIntervals.has(1));assert.equal(e.events.focus.length,0);assert.equal(e.events.visibilitychange.length,0);
  e.intervals[0]();focus();visibility();await tick();assert.equal(e.requests.length,3,'queued automatic callbacks cannot resume terminal polling');assert.equal(e.paid(),0);assert.equal(e.e.coveredRef.current,false);
  assert.equal(e.payment.paymentIntentId,'pi_fixture');assert.equal(e.payment.packageId,packageId);
  e.e.checkRef.current();assert.equal(e.requests.length,4,'explicit status checks remain available without another charge');assert(e.requests.every(({options})=>!options.method||options.method==='GET'));e.cleanup();
 }
});
await test('a past client-clock QR timestamp keeps requires_action/processing polling until authoritative paid success',async()=>{
 for(const packageId of ['89','159'])for(const status of ['requires_action','processing']){
  const e=panelEnv(packageId),pending={response:{ok:true},data:{status,expiresAt:1}};
  e.requests[0].resolve(pending);await tick();e.intervals[0]();assert.equal(e.requests.length,2);e.requests[1].resolve(pending);await tick();e.events.focus[0]();assert.equal(e.requests.length,3);e.requests[2].resolve(pending);await tick();
  assert.equal(e.clearedIntervals.size,0);assert.equal(e.events.focus.length,1);assert.equal(e.events.visibilitychange.length,1);assert.equal(e.paid(),0);
  e.intervals[0]();assert.equal(e.requests.length,4);e.requests[3].resolve({response:{ok:true},data:{ok:true,status:'succeeded',paymentIntentId:'pi_fixture',expiresAt:1}});await tick();assert.equal(e.paid(),1);e.settlement.resolve();await tick();e.events.focus[0]();assert.equal(e.requests.length,4,'successful paid verification completes once');e.cleanup();
 }
});
await test('failed verification of a paid receipt keeps automatic timer/focus retries',async()=>{
 for(const packageId of ['89','159']){
  const e=panelEnv(packageId),paid={response:{ok:true},data:{ok:true,status:'succeeded',paymentIntentId:'pi_fixture',expiresAt:1}};
  e.requests[0].resolve(paid);await tick();e.settlement.reject(Error('paid rights temporarily unavailable'));await tick();
  e.intervals[0]();assert.equal(e.requests.length,2);e.requests[1].resolve(paid);await tick();e.events.focus[0]();assert.equal(e.requests.length,3);
  assert.equal(e.clearedIntervals.size,0);assert.equal(e.events.visibilitychange.length,1);assert.equal(e.e.coveredRef.current,true);assert(e.messages.includes('paid rights temporarily unavailable'));e.cleanup();
 }
});
console.log(`PASS: ${tested} checkout storage and QR lifecycle regressions; isolated mocks, no external requests.`);
