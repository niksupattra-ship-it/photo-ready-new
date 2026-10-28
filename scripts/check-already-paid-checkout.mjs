import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walletScope} from '../src/wallet-refresh.js';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
function compile(name,env){
 const start=main.indexOf(' const '+name+'=async'),end=main.indexOf('\n };',start);
 assert(start>=0&&end>start,name+' exists');
 return new Function('env',`with(env){return ${main.slice(start,end+4).trim().replace(new RegExp('^const '+name+'='),'').replace(/;$/,'')}}`)(env);
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
function fixture(packageId='89'){
 const events=[],storage=new Map([['token','fixture-token'],['wallet','fixture-wallet']]);let checks=0;
 const e={
  walletScope,authToken:()=>storage.get('token')||'',currentWalletId:()=>storage.get('wallet')||'',
  appStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  AUTH_TOKEN_KEY:'token',checkoutReturnRef:{current:null},checkoutBusyRef:{current:false},qrPaymentRef:{current:null},
  currentOutputJobRef:{current:'fixture-job'},currentOutputTrialRef:{current:true},savedWorkOpenRequestRef:{current:1},
  savedWorkIdRef:{current:''},firstUploadedPhotoRef:{current:null},editCache:{current:null},restoredCheckoutRef:{current:null},
  paymentStudioRef:{current:()=>({layers:[{kind:'head',jobId:'fixture-job'}]})},activeUniformTemplate:'/fixture.png',hairId:'',
  claimAccountOutput:async()=>{},refreshWallet:async()=>({walletId:e.currentWalletId(),processRemaining:0}),
  walletHeaders:()=>({}),authHeaders:()=>({}),femaleFinishMetadata:()=>null,savePurchaseDraft:async()=>{},
  verifyOutputRights:async()=>{checks++;events.push(['rights',checks]);return{checked:true,unlocked:checks>1,premiumHair:checks>1&&packageId==='159'}},
  requestPromptpay:async(url,options)=>{events.push(['request',url,options.method]);assert.equal(options.method,'POST');return {response:{ok:false,status:409},data:{error:'already_unlocked',message:'This work was already paid'}}},
  analyticsEvent:()=>{},analyticsCheckout:()=>{},fetch:async()=>({}),
 };
 for(const name of ['setPendingLegacyCheckout','setPayBusy','setPayMsg','setPendingPackage','setAuthMode','setAuthMsg','setAuthOpen','setBuyOpen','setTrialPreview','setAccountSaveNotice','setDownloadUnlockSignal','setPurchaseEditing'])e[name]=value=>events.push([name,value]);
 e.setCheckoutRecovery=update=>{e.checkoutRecovery=typeof update==='function'?update(e.checkoutRecovery):update;events.push(['recovery',e.checkoutRecovery])};
 e.setQrPayment=payment=>{e.qrPaymentRef.current=payment;events.push(['qr',payment])};
 e.clearQrPayment=paymentId=>{assert.equal(e.qrPaymentRef.current?.paymentIntentId,paymentId);e.setQrPayment(null);const stored=JSON.parse(storage.get('idprom_pending_qr_v1')||'null');if(stored?.paymentIntentId===paymentId){storage.delete('idprom_pending_qr_v1');storage.delete('idprom_qr_attempt_v1')}};
 e.savePaidCheckout=compile('savePaidCheckout',e);e.startCheckout=compile('startCheckout',e);
 return {e,events,storage,checks:()=>checks};
}
const eventsOf=(f,name)=>f.events.filter(([kind])=>kind===name);
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name)}
for(const packageId of ['89','159']){
 await test(packageId+' paid during checkout is verified before download and purchase dialog close',async()=>{
  const f=fixture(packageId);await f.e.startCheckout(packageId);
  assert.equal(f.checks(),2);assert.deepEqual(eventsOf(f,'setDownloadUnlockSignal').map(([,value])=>value),[{id:'existing:fixture-job',jobId:'fixture-job'}]);
  assert.equal(eventsOf(f,'request').length,1);assert(eventsOf(f,'setBuyOpen').some(([,value])=>value===false));assert.equal(f.storage.has('idprom_qr_attempt_v1'),false);
  assert(f.events.findIndex(([kind,n])=>kind==='rights'&&n===2)<f.events.findIndex(([kind])=>kind==='setDownloadUnlockSignal'));
 });
 for(const right of [{checked:false,unlocked:null},{checked:true,unlocked:false},...(packageId==='159'?[{checked:true,unlocked:true,premiumHair:false}]:[])]){
  await test(packageId+' conflict alone cannot complete unverified offer '+JSON.stringify(right),async()=>{
   const f=fixture(packageId);let reads=0;f.e.verifyOutputRights=async()=>++reads===1?{checked:true,unlocked:false}:right;
   await f.e.startCheckout(packageId);assert.equal(reads,2);assert.equal(eventsOf(f,'setDownloadUnlockSignal').length,0);assert(!eventsOf(f,'setBuyOpen').some(([,value])=>value===false));assert(f.storage.has('idprom_qr_attempt_v1'));
  });
 }
 await test(packageId+' async duplicate clicks share checkout and wait for paid verification',async()=>{
  const f=fixture(packageId),gate=deferred();let reads=0;f.e.verifyOutputRights=async()=>++reads===1?{checked:true,unlocked:false}:gate.promise;
  const pending=f.e.startCheckout(packageId);await tick();await f.e.startCheckout(packageId);assert.equal(eventsOf(f,'request').length,1);assert.equal(eventsOf(f,'setDownloadUnlockSignal').length,0);assert(f.storage.has('idprom_qr_attempt_v1'));
  gate.resolve({checked:true,unlocked:true,premiumHair:packageId==='159'});await pending;assert.equal(eventsOf(f,'setDownloadUnlockSignal').length,1);assert.equal(f.e.checkoutBusyRef.current,false);
 });
 for(const change of ['account','job','work'])await test(packageId+' changing '+change+' during paid verification preserves pending recovery and current image',async()=>{
  const f=fixture(packageId),gate=deferred();let reads=0;f.e.verifyOutputRights=async()=>++reads===1?{checked:true,unlocked:false}:gate.promise;
  const pending=f.e.startCheckout(packageId);await tick();
  if(change==='account'){f.storage.set('token','replacement-token');f.storage.set('wallet','replacement-wallet')}
  else if(change==='job')f.e.currentOutputJobRef.current='replacement-job';else f.e.savedWorkOpenRequestRef.current++;
  gate.resolve({checked:true,unlocked:true,premiumHair:true});await pending;
  assert.equal(eventsOf(f,'setDownloadUnlockSignal').length,0);assert(!eventsOf(f,'setBuyOpen').some(([,value])=>value===false));assert(f.storage.has('idprom_qr_attempt_v1'));assert.equal(f.e.checkoutBusyRef.current,false);
 });
 await test(packageId+' verification exception keeps recovery retryable and releases busy lock',async()=>{
  const f=fixture(packageId);let reads=0;f.e.verifyOutputRights=async()=>{if(++reads===1)return{checked:true,unlocked:false};throw Error('temporary network failure')};
  await f.e.startCheckout(packageId);assert.equal(eventsOf(f,'setDownloadUnlockSignal').length,0);assert(f.storage.has('idprom_qr_attempt_v1'));assert.equal(f.e.checkoutBusyRef.current,false);
  f.e.verifyOutputRights=async()=>({checked:true,unlocked:true,premiumHair:packageId==='159'});await f.e.startCheckout(packageId);assert.equal(eventsOf(f,'setDownloadUnlockSignal').length,1);assert(eventsOf(f,'setBuyOpen').some(([,value])=>value===false));assert.equal(eventsOf(f,'request').length,1,'retry with paid rights cannot create a second charge');assert.equal(f.storage.has('idprom_qr_attempt_v1'),false);
 });
 await test(packageId+' success clears only matching job recovery records',async()=>{
  for(const jobId of ['fixture-job','other-job']){
   const f=fixture(packageId),request=f.e.requestPromptpay;f.e.requestPromptpay=async(...args)=>{const result=await request(...args);const payment={walletId:'fixture-wallet',jobId,paymentIntentId:'pi_fixture'};f.storage.set('idprom_pending_qr_v1',JSON.stringify(payment));f.e.checkoutRecovery=payment;return result};
   await f.e.startCheckout(packageId);assert.equal(f.storage.has('idprom_pending_qr_v1'),jobId==='other-job');assert.equal(Boolean(f.e.checkoutRecovery),jobId==='other-job');
  }
 });
}
console.log(`${passed} already-paid checkout scenarios passed; actual App checkout/verification functions with inert local fixtures only.`);
