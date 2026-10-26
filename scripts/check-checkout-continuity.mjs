import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walletScope} from '../src/wallet-refresh.js';
const main=await readFile(process.env.IDPROM_AUDIT_MAIN||new URL('../src/main.jsx',import.meta.url),'utf8');
function compile(name,env){const start=main.indexOf(' const '+name+'=async');assert(start>=0,name+' exists');const end=main.indexOf('\n };',start);assert(end>=0);const expression=main.slice(start,end+4).trim().replace(new RegExp('^const '+name+'='),'').replace(/;$/,'');return new Function('env',`with(env){return ${expression}}`)(env)}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
function fixture({job='jobA',paymentJob=job}={}){
 const events=[],storage=new Map([['token','tokenA'],['wallet','walletA']]);
 const payment={paymentIntentId:'pi_fixtureA',walletId:'walletA',jobId:paymentJob,packageId:'119'};
 const e={walletScope,authToken:()=>storage.get('token')||'',currentWalletId:()=>storage.get('wallet')||'',appStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  AUTH_TOKEN_KEY:'token',WALLET_KEY:'wallet',qrSettlementRef:{current:new Map()},qrPayment:payment,qrPaymentRef:{current:payment},currentOutputJobRef:{current:job},currentOutputTrialRef:{current:true},savedWorkOpenRequestRef:{current:1},restoredCheckoutRef:{current:null},paymentStudioRef:{current:()=>({layers:[]})},savedWorkIdRef:{current:''},firstUploadedPhotoRef:{current:null},editCache:{current:null},checkoutBusyRef:{current:false},checkoutReturnRef:{current:null},activeUniformTemplate:'/fixture.png',hairId:'',
  walletHeaders:()=>({Authorization:'Bearer '+e.authToken(),'X-Wallet-Id':e.currentWalletId()}),authHeaders:()=>({Authorization:'Bearer '+e.authToken()}),claimAccountOutput:async()=>{},refreshWallet:async()=>null,verifyOutputRights:async()=>({checked:true,unlocked:true}),savePurchaseDraft:async()=>{},femaleFinishMetadata:()=>null,
  acceptWalletRights:data=>events.push(['rights',data]),setTrialPreview:value=>events.push(['trial',value]),setPurchaseEditing:value=>events.push(['editing',value]),setAccountSaveNotice:value=>events.push(['notice',value]),setDownloadUnlockSignal:value=>events.push(['unlock',value]),setPayMsg:value=>events.push(['message',value]),setBuyOpen:value=>events.push(['buy',value]),setPayBusy:value=>events.push(['busy',value]),setPendingPackage:()=>{},setAuthMode:()=>{},setAuthMsg:()=>{},setAuthOpen:value=>events.push(['auth',value]),setQrPayment:value=>{e.qrPayment=value;e.qrPaymentRef.current=value;events.push(['qr',value])},
  analyticsEvent:()=>{},analyticsCheckout:()=>{},analyticsPurchase:()=>{},fetch:async()=>response({}),restorePurchaseDraft:async()=>({jobId:paymentJob}),requestPromptpay:async()=>({response:response({}),data:{}}),history:{replaceState:()=>events.push(['history'])},location:{pathname:'/'}};
 e.clearQrPayment=id=>{if(id&&e.qrPaymentRef.current?.paymentIntentId!==id)return;e.setQrPayment(null);events.push(['clear',id])};
 e.savePaidCheckout=compile('savePaidCheckout',e);e.finishQrPayment=compile('finishQrPayment',e);e.startCheckout=compile('startCheckout',e);e.useDownloadCredit=compile('useDownloadCredit',e);e.expireQrPayment=compile('expireQrPayment',e);
 return {e,events,storage,payment,switchAccount:()=>{storage.set('token','tokenB');storage.set('wallet','walletB')}};
}
let passed=0,failed=0;
async function test(name,run){try{await run();passed++;console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+': '+error.message)}}
await test('delayed paid-right verification cannot clear a different account watermark',async()=>{
 const f=fixture(),read=deferred();f.e.verifyOutputRights=()=>read.promise;const pending=f.e.savePaidCheckout('pi_fixtureA');await tick();f.switchAccount();read.resolve({checked:true,unlocked:true});await Promise.allSettled([pending]);assert(!f.events.some(([kind])=>kind==='unlock'||kind==='trial'));
});
await test('legacy credit-only payment completes without requiring an image unlock',async()=>{
 const f=fixture({job:''});await f.e.finishQrPayment({ok:true,status:'succeeded',paymentIntentId:f.payment.paymentIntentId},f.payment);assert(f.events.some(([kind])=>kind==='clear'));assert(!f.events.some(([kind])=>kind==='unlock'));
});
await test('paid result for an older image never removes current image watermark',async()=>{
 const f=fixture({job:'newJob',paymentJob:'oldJob'});await f.e.finishQrPayment({ok:true,status:'succeeded',paymentIntentId:f.payment.paymentIntentId},f.payment);assert(!f.events.some(([kind])=>kind==='unlock'||kind==='trial'));assert(f.events.some(([kind])=>kind==='clear'));
});
await test('a QR for another account is never queried or canceled with current headers',async()=>{
 const f=fixture();let calls=0;f.e.requestPromptpay=async()=>{calls++;return {response:response({}),data:{status:'canceled'}}};f.switchAccount();await Promise.allSettled([f.e.expireQrPayment(f.payment)]);assert.equal(calls,0);
});
await test('QR creation cannot attach an old response to a newly signed-in wallet',async()=>{
 const f=fixture(),request=deferred();f.e.verifyOutputRights=async()=>({checked:true,unlocked:false});f.e.requestPromptpay=()=>request.promise;const pending=f.e.startCheckout('119');await tick();f.switchAccount();request.resolve({response:response({}),data:{paymentIntentId:'pi_old',qrImage:'https://fixture.invalid/qr.png'}});await pending;assert(!f.events.some(([kind,value])=>kind==='qr'&&value?.paymentIntentId==='pi_old'));
});
await test('late 401 from QR creation cannot sign out the replacement account',async()=>{
 const f=fixture(),request=deferred();f.e.verifyOutputRights=async()=>({checked:true,unlocked:false});f.e.requestPromptpay=()=>request.promise;const pending=f.e.startCheckout('119');await tick();f.switchAccount();request.resolve({response:response({},401),data:{message:'old session'}});await pending;assert.equal(f.storage.get('token'),'tokenB');assert(!f.events.some(([kind,value])=>kind==='auth'&&value===true));
});
await test('credit unlock response cannot settle into a replacement account',async()=>{
 const f=fixture(),request=deferred();f.e.portraitFetch=()=>request.promise;const pending=f.e.useDownloadCredit();await tick();f.switchAccount();request.resolve(response({walletId:'walletA',processRemaining:2}));await pending;assert(!f.events.some(([kind])=>['rights','unlock','trial'].includes(kind)));
});
await test('already-settled idempotent QR creation succeeds without another QR image',async()=>{
 const f=fixture();f.e.verifyOutputRights=async()=>({checked:true,unlocked:false});f.e.requestPromptpay=async()=>({response:response({}),data:{ok:true,status:'succeeded',paymentIntentId:'pi_settled',walletId:'walletA'}});let settled;f.e.finishQrPayment=async(data,payment)=>{settled={data,payment}};await f.e.startCheckout('119');assert.equal(settled?.payment?.paymentIntentId,'pi_settled');assert(!f.events.some(([kind,value])=>kind==='message'&&value.includes('ไม่พบ QR')));
});
await test('new image offers require an image and unavailable rights prevent duplicate checkout',async()=>{
 for(const job of ['', 'jobA']){const f=fixture({job});let called=false;f.e.verifyOutputRights=async()=>({checked:false,message:'temporarily unavailable'});f.e.requestPromptpay=async()=>{called=true};await f.e.startCheckout('119');assert.equal(called,false);assert(f.events.some(([kind,value])=>kind==='message'&&value));}
});
await test('paid settlement ignores unconfirmed or mismatched provider results',async()=>{
 for(const data of [{ok:false,status:'succeeded',paymentIntentId:'pi_fixtureA'},{ok:true,status:'processing',paymentIntentId:'pi_fixtureA'},{ok:true,status:'succeeded',paymentIntentId:'pi_other'}]){const f=fixture();await assert.rejects(f.e.finishQrPayment(data,f.payment));assert(!f.events.some(([kind])=>kind==='clear'||kind==='unlock'||kind==='rights'));}
});
await test('a pending older payment cannot restore another image draft',async()=>{
 const f=fixture({job:'',paymentJob:'oldJob'});f.payment.recovered=true;let expected;f.e.restorePurchaseDraft=async options=>{expected=options;return null};await assert.rejects(f.e.finishQrPayment({ok:true,status:'succeeded',paymentIntentId:f.payment.paymentIntentId},f.payment));assert.deepEqual(expected,{jobId:'oldJob'});assert(!f.events.some(([kind])=>kind==='clear'||kind==='unlock'));
});
await test('draft recovery rejects a mismatched paid job before changing the current work',async()=>{
 const f=fixture();f.e.loadPurchaseDraft=async()=>({walletId:'walletA',jobId:'differentJob'});const restore=compile('restorePurchaseDraft',f.e);assert.equal(await restore({jobId:'paidJob'}),null);assert.equal(f.e.savedWorkOpenRequestRef.current,1);
});
await test('a delayed Checkout return retries confirmation then unlocks the verified target',async()=>{
 const f=fixture(),urls=[];let calls=0;f.e.requestPromptpay=async url=>{urls.push(url);return ++calls===1?{response:response({},409),data:{message:'waiting'}}:{response:response({}),data:{ok:true,jobId:'jobA',walletId:'walletA'}}};const recover=compile('recoverCheckoutReturn',f.e);await assert.rejects(recover('cs_fixture',{walletId:'walletA'}),{retryable:true});assert(!f.events.some(([kind])=>kind==='history'||kind==='unlock'));await recover('cs_fixture',{walletId:'walletA'});assert.deepEqual(urls,['/api/payments/confirm','/api/payments/confirm']);assert(f.events.some(([kind])=>kind==='unlock'));assert(f.events.some(([kind])=>kind==='history'));
});
await test('Checkout success query alone never grants rights or reports a paid purchase',async()=>{
 const f=fixture(),recover=compile('recoverCheckoutReturn',f.e);await assert.rejects(recover(null),{retryable:false});assert(!f.events.some(([kind])=>kind==='rights'||kind==='unlock'||kind==='editing'||kind==='history'));
});
await test('verified historic Checkout top-up completes without unlocking an unrelated current image',async()=>{
 const f=fixture();f.e.requestPromptpay=async()=>({response:response({}),data:{ok:true,jobId:'',walletId:'walletA'}});await compile('recoverCheckoutReturn',f.e)('cs_legacy',{walletId:'walletA'});assert(!f.events.some(([kind])=>kind==='unlock'||kind==='trial'));assert(f.events.some(([kind])=>kind==='history'));
});
await test('late Checkout confirmation cannot settle into another account',async()=>{
 const f=fixture(),request=deferred();f.e.requestPromptpay=()=>request.promise;const pending=compile('recoverCheckoutReturn',f.e)('cs_fixture',{walletId:'walletA'});await tick();f.switchAccount();request.resolve({response:response({}),data:{ok:true,jobId:'jobA',walletId:'walletA'}});await assert.rejects(pending,{retryable:false});assert(!f.events.some(([kind])=>['rights','unlock','trial','history'].includes(kind)));
});
await test('confirmed payment keeps its return recovery URL until image rights can be verified',async()=>{
 const f=fixture();f.e.verifyOutputRights=async()=>({checked:false,unlocked:null});f.e.requestPromptpay=async()=>({response:response({}),data:{ok:true,jobId:'jobA',walletId:'walletA'}});await assert.rejects(compile('recoverCheckoutReturn',f.e)('cs_fixture',{walletId:'walletA'}));assert(!f.events.some(([kind])=>kind==='history'||kind==='unlock'));
});
await test('paid Checkout return retains recovery until its original draft is actually restored',async()=>{
 const f=fixture({job:'',paymentJob:'paidJob'}),restores=[];
 f.e.requestPromptpay=async()=>({response:response({}),data:{ok:true,jobId:'paidJob',walletId:'walletA'}});
 let draftAvailable=false;
 f.e.restorePurchaseDraft=async options=>{restores.push(options);if(!draftAvailable)return null;f.e.currentOutputJobRef.current='paidJob';return {jobId:'paidJob',layers:[{kind:'head',jobId:'paidJob'}]}};
 const recover=compile('recoverCheckoutReturn',f.e);
 await assert.rejects(recover('cs_paid_original',{walletId:'walletA'}),/ชำระเงินแล้ว.*ไม่ต้องชำระซ้ำ/);
 assert.equal(f.e.currentOutputJobRef.current,'');
 assert(!f.events.some(([kind,value])=>kind==='history'||kind==='unlock'||kind==='buy'&&value===false));
 draftAvailable=true;await recover('cs_paid_original',{walletId:'walletA'});
 assert.deepEqual(restores,[{jobId:'paidJob'},{jobId:'paidJob'}]);
 assert(f.events.some(([kind,value])=>kind==='unlock'&&value.jobId==='paidJob'));
 assert.equal(f.events.filter(([kind])=>kind==='history').length,1);
});
await test('payment panel is rendered in a stable React tree across wallet and rights updates',async()=>{
 assert(!main.includes('<CreditUI'),'inline component types remount QR and re-enter settlement on every App state change');assert(main.includes('CreditUI({showBalance:false})'));assert(main.includes('{CreditUI()}{AuthUI()}'),'checkout remains in the same modal during embedded authentication');assert(main.includes("if(!authOpen||(checkoutAuth&&!embedded))return null"),'embedded checkout authentication cannot open a second backdrop');
});
await test('closing and reopening a QR shares its in-flight paid settlement',async()=>{
 const f=fixture(),rights=deferred();let reads=0;f.e.verifyOutputRights=()=>{reads++;return rights.promise};const data={ok:true,status:'succeeded',paymentIntentId:f.payment.paymentIntentId};const a=f.e.finishQrPayment(data,f.payment);await tick();const b=f.e.finishQrPayment(data,f.payment);await tick();assert.equal(reads,1);assert.equal(f.events.filter(([kind])=>kind==='rights').length,1);rights.resolve({checked:true,unlocked:true});await Promise.all([a,b]);assert.equal(f.events.filter(([kind])=>kind==='unlock').length,1);assert.equal(f.events.filter(([kind])=>kind==='clear').length,1);
});
console.log(`${passed} checkout continuity scenarios passed; ${failed} failed. Mock requests only; no payments or customer writes.`);
if(failed)process.exitCode=1;

