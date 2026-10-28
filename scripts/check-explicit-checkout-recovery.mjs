import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {walletScope} from '../src/wallet-refresh.js';

// Exercise the current App functions, with every HTTP/storage/navigation boundary
// supplied by the fixture. No request can reach a payment provider or customer.
const main=await readFile(process.env.IDPROM_AUDIT_MAIN||new URL('../src/main.jsx',import.meta.url),'utf8');
const output=process.env.IDPROM_RECOVERY_OUTPUT;
function compile(name,env,{singleLine=false}={}){
 const marker=' const '+name+'=',start=main.indexOf(marker);assert(start>=0,name+' exists');
 const end=singleLine?main.indexOf('\n',start):main.indexOf('\n };',start)+4;
 assert(end>start,name+' is complete');
 const expression=main.slice(start,end).trim().replace(new RegExp('^const '+name+'='),'').replace(/;$/,'');
 return new Function('env',`with(env){return ${expression}}`)(env);
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(status=200)=>({ok:status>=200&&status<300,status});
const completeStates=['succeeded','work_unlocked'];
function fixture({status='requires_action',job='',draftKind='studio'}={}){
 const events=[],requests=[],storage=new Map([['token','token_original'],['wallet','wallet_original']]);
 const payment={walletId:'wallet_original',jobId:'job_original',paymentIntentId:'pi_original',packageId:'119',amount:119,qrImage:'data:image/png;base64,fixture',status:'requires_action'};
 storage.set('idprom_pending_qr_v1',JSON.stringify(payment));
 const head={kind:'head',name:'หัว · คอ · ผม',jobId:'job_original',source:'data:image/png;base64,fixture',restrictedTrial:true,portraitMode:'male'};
 let draft={walletId:payment.walletId,jobId:payment.jobId,isTrial:true,workId:'',originalFile:new Blob(['original'],{type:'image/png'}),downloadWorkId:'dwork_original',studio:{layers:[head],placement:{W:900,H:1200}}};
 if(draftKind==='classic')draft={...draft,studio:null,classicMaster:new Blob(['master']),classicLock:{W:900,H:1200}};
 const e={
  walletScope,authToken:()=>storage.get('token')||'',currentWalletId:()=>storage.get('wallet')||'',
  appStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  AUTH_TOKEN_KEY:'token',WALLET_KEY:'wallet',checkoutRecovery:{...payment},checkoutRecoveryBusyRef:{current:false},checkoutBusyRef:{current:false},checkoutReturnRef:{current:null},
  qrPaymentRef:{current:null},qrSettlementRef:{current:new Map()},currentOutputJobRef:{current:job},currentOutputTrialRef:{current:true},savedWorkOpenRequestRef:{current:1},studioData:null,studioDraftRef:{current:null},firstUploadedPhotoRef:{current:null},
  pendingLegacyCheckout:null,studioTrialRef:{current:true},savedWorkIdRef:{current:''},restoredCheckoutRef:{current:null},paymentStudioRef:{current:null},editCache:{current:null},initialProcessedMasterRef:{current:null},initialFemaleMakeupRef:{current:null},hairResultCacheRef:{current:new Map()},preparedHairBaseRef:{current:null},lastHairDonorRef:{current:null},cleanHairBaseRef:{current:null},initialStyledHairRef:{current:null},studioOriginRef:{current:null},backgroundRef:{current:null},
  activeUniformTemplate:'/fixture-template.png',hairId:'',URL,AbortController,
  walletHeaders:()=>({Authorization:'Bearer '+e.authToken(),'X-Wallet-Id':e.currentWalletId()}),authHeaders:()=>({Authorization:'Bearer '+e.authToken()}),
  loadPurchaseDraft:async()=>{events.push(['loadDraft']);return draft},
  savePurchaseDraft:async value=>{draft=value;events.push(['persistDraft',value]);return{storage:'indexeddb',persistent:true}},
  makeSavedProject:async value=>value,
  renderAdjustedFinal:async(...args)=>{args.at(-1).push({...head});events.push(['renderClassic'])},femaleFinishHeadMetadata:()=>({}),femaleFinishMetadata:()=>null,portraitFinishChoice:()=> 'natural',
  // Cache seeding is independently exercised by check-makeup-choice-cache; here
  // verify recovery invokes it only after the matching source/job are restored.
  rememberRestoredHairResult:restoredHead=>{assert.equal(restoredHead.jobId,e.currentOutputJobRef.current);assert.equal(e.firstUploadedPhotoRef.current,draft.originalFile);events.push(['rememberRestored',restoredHead])},
  refreshWallet:async()=>{events.push(['refresh']);return{walletId:e.currentWalletId()}},claimAccountOutput:async()=>{},
  verifyOutputRights:async target=>{events.push(['verify',target]);return{checked:true,unlocked:completeStates.includes(status),premiumHair:false}},
  acceptWalletRights:data=>events.push(['rights',data]),analyticsEvent:()=>{},analyticsCheckout:()=>{},analyticsPurchase:id=>events.push(['purchase',id]),
  fetch:async()=>({ok:true,status:204}),
  requestPromptpay:async(url,options={})=>{
   requests.push({url,method:options.method||'GET'});
   assert.equal(options.method||'GET','GET','recovery must never create or cancel a charge');
   return {response:response(),data:{...payment,status,ok:completeStates.includes(status),expiresAt:status==='expired'?1:Math.floor(Date.now()/1000)+3600}};
  },
  window:{confirm:message=>{events.push(['confirm',message]);return true},location:{assign:url=>events.push(['navigate',url])}},
 };
 const stateSetter=(name,event)=>value=>{e[name]=typeof value==='function'?value(e[name]):value;events.push([event,e[name]])};
 for(const [name,event] of [['checkoutRecovery','recovery'],['checkoutRecoveryMessage','recoveryMessage'],['checkoutRecoveryBusy','recoveryBusy'],['pendingLegacyCheckout','legacy'],['studioData','studio'],['payMsg','payMessage'],['buyOpen','buy'],['payBusy','payBusy'],['screen','screen']])e['set'+name[0].toUpperCase()+name.slice(1)]=stateSetter(name,event);
 for(const [name,event] of [['setTrialPreview','trial'],['setAccountSaveNotice','notice'],['setDownloadUnlockSignal','unlock'],['setPurchaseEditing','editing'],['setF','source'],['setA','sourceURL'],['setOutputJobId','output'],['setHairId','hair'],['setSavedWorkUnlocked','savedUnlocked'],['setSessionEditJob','sessionJob'],['setRestoredSourcePhoto','restoredSource'],['setSavedWorkRevision','revision'],['setPendingPackage','package'],['setAuthMode','authMode'],['setAuthMsg','authMessage'],['setAuthOpen','authOpen']])e[name]=value=>events.push([event,value]);
 e.setQrPayment=value=>{e.qrPaymentRef.current=value;events.push(['qr',value])};
 e.clearQrPayment=compile('clearQrPayment',e,{singleLine:true});
 for(const name of ['restorePurchaseDraft','savePaidCheckout','finishQrPayment','resumeStoredCheckout','continueLegacyCheckout','startCheckout'])e[name]=compile(name,e);
 return {e,events,requests,storage,payment,head,get draft(){return draft},set draft(value){draft=value},switchAccount(){storage.set('token','token_replacement');storage.set('wallet','wallet_replacement')}};
}
const results=[];let failures=0;
async function test(name,run){try{await run();results.push({name,passed:true});console.log('PASS '+name)}catch(error){failures++;results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+': '+error.message)}}
const eventsOf=(f,name)=>f.events.filter(([kind])=>kind===name);
function homeEffect(f){
 const start=main.indexOf(' useEffect(()=>{let cancelled=false;const controller=new AbortController();(async()=>{\n  const removeStored='),end=main.indexOf('\n const CreditUI=',start);assert(start>=0&&end>start,'stored checkout effect exists');
 let cleanup;f.e.useEffect=callback=>{cleanup=callback()};new Function('env',`with(env){${main.slice(start,end)}}`)(f.e);return()=>cleanup?.();
}

for(const status of ['requires_action','processing','succeeded','work_unlocked','expired','canceled']){
 await test('home offers explicit '+status+' recovery without opening a modal or restoring work',async()=>{
  const f=fixture({status}),cleanup=homeEffect(f);for(let i=0;i<8;i++)await tick();
  assert.equal(f.e.checkoutRecovery?.jobId,f.payment.jobId);assert.equal(eventsOf(f,'studio').length,0);assert.equal(eventsOf(f,'qr').length,0);assert.equal(eventsOf(f,'buy').length,0);assert.equal(eventsOf(f,'navigate').length,0);assert(f.storage.has('idprom_pending_qr_v1'));assert.equal(f.requests.length,1);cleanup();
 });
 await test('explicit '+status+' recovery restores the original from an empty page',async()=>{
  const f=fixture({status});await f.e.resumeStoredCheckout();
  assert.equal(f.e.currentOutputJobRef.current,'job_original');assert.equal(f.e.studioData[0].jobId,'job_original');assert.equal(f.e.firstUploadedPhotoRef.current,f.draft.originalFile);assert.equal(f.e.firstUploadedPhotoRef.current.idpromDownloadWorkId,'dwork_original');assert.equal(f.requests.length,1);assert.equal(eventsOf(f,'rememberRestored').length,1);assert.equal(eventsOf(f,'rememberRestored')[0][1].jobId,'job_original');assert.equal(eventsOf(f,'confirm').length,0);assert.equal(eventsOf(f,'navigate').length,0);
  if(completeStates.includes(status)){assert.equal(eventsOf(f,'unlock').length,1);assert.equal(eventsOf(f,'unlock')[0][1].jobId,'job_original');assert.equal(f.e.qrPaymentRef.current,null);assert.equal(f.storage.has('idprom_pending_qr_v1'),false);assert.equal(f.e.buyOpen,false)}
  else if(['expired','canceled'].includes(status)){assert.equal(eventsOf(f,'unlock').length,0);assert.equal(f.e.qrPaymentRef.current,null);assert.equal(f.e.buyOpen,true);assert.equal(f.storage.has('idprom_pending_qr_v1'),false)}
  else{assert.equal(eventsOf(f,'unlock').length,0);assert.equal(f.e.qrPaymentRef.current.paymentIntentId,'pi_original');assert.equal(f.e.buyOpen,true);assert(f.storage.has('idprom_pending_qr_v1'))}
  assert.equal(f.e.checkoutRecoveryBusyRef.current,false);assert.equal(f.e.checkoutBusyRef.current,false);
 });
}
await test('classic draft recovery rebuilds original layers before settling its paid job',async()=>{
 const f=fixture({status:'succeeded',draftKind:'classic'});await f.e.resumeStoredCheckout();assert.equal(eventsOf(f,'renderClassic').length,1);assert.equal(f.e.studioData[0].jobId,'job_original');assert.equal(eventsOf(f,'unlock')[0][1].jobId,'job_original');
});
await test('wrong account cannot load a draft, query payment, or replace work',async()=>{
 const f=fixture();f.switchAccount();await f.e.resumeStoredCheckout();assert.equal(eventsOf(f,'loadDraft').length,0);assert.equal(f.requests.length,0);assert.equal(eventsOf(f,'studio').length,0);assert.equal(eventsOf(f,'qr').length,0);
});
for(const bad of ['missing','wrong-wallet','wrong-job','empty-project'])await test(bad+' draft cannot query payment or replace work',async()=>{
 const f=fixture();if(bad==='missing')f.draft=null;else if(bad==='wrong-wallet')f.draft={...f.draft,walletId:'wallet_other'};else if(bad==='wrong-job')f.draft={...f.draft,jobId:'job_other'};else f.draft={...f.draft,studio:{layers:[]}};
 await f.e.resumeStoredCheckout();assert.equal(f.requests.length,0);assert.equal(eventsOf(f,'studio').length,0);assert.equal(eventsOf(f,'unlock').length,0);assert.equal(f.e.currentOutputJobRef.current,'');assert(f.e.checkoutRecoveryMessage);assert(f.storage.has('idprom_pending_qr_v1'));
});
await test('declining replacement preserves unsaved other work without payment or draft reads',async()=>{
 const f=fixture({job:'job_unsaved'}),current=[{kind:'head',jobId:'job_unsaved',x:77}];f.e.studioDraftRef.current={layers:current};f.e.firstUploadedPhotoRef.current=new Blob(['unsaved']);f.e.window.confirm=()=>{f.events.push(['confirm']);return false};
 await f.e.resumeStoredCheckout();assert.equal(eventsOf(f,'confirm').length,1);assert.equal(eventsOf(f,'loadDraft').length,0);assert.equal(f.requests.length,0);assert.equal(f.e.studioDraftRef.current.layers,current);assert.equal(f.e.currentOutputJobRef.current,'job_unsaved');assert.equal(eventsOf(f,'studio').length,0);
});
for(const where of ['studioData','studioDraft'])await test('same-job '+where+' recovery preserves the latest edit layers',async()=>{
 const f=fixture({job:'job_original',status:'succeeded'}),latest=[{...f.head,x:227,name:'latest edit'}];if(where==='studioData')f.e.studioData=latest;else f.e.studioDraftRef.current={layers:latest};f.e.firstUploadedPhotoRef.current=f.draft.originalFile;
 await f.e.resumeStoredCheckout();assert.equal(f.e.studioData,latest);assert.equal(f.e.currentOutputJobRef.current,'job_original');assert.equal(eventsOf(f,'confirm').length,0);assert.equal(eventsOf(f,'loadDraft').length,1,'must not restore the older saved snapshot');assert.equal(eventsOf(f,'unlock').length,1);
});
for(const waitAt of ['draft','status'])await test('switching account during '+waitAt+' wait rejects delayed recovery',async()=>{
 const f=fixture({status:'succeeded'}),gate=deferred();if(waitAt==='draft')f.e.loadPurchaseDraft=()=>gate.promise;else f.e.requestPromptpay=async(url)=>{f.requests.push({url,method:'GET'});return gate.promise};
 const pending=f.e.resumeStoredCheckout();await tick();f.switchAccount();gate.resolve(waitAt==='draft'?f.draft:{response:response(),data:{...f.payment,status:'succeeded',ok:true}});await pending;
 assert.equal(eventsOf(f,'studio').length,0);assert.equal(eventsOf(f,'unlock').length,0);assert.equal(eventsOf(f,'qr').filter(([,value])=>value).length,0);assert.equal(f.e.currentOutputJobRef.current,'');assert.equal(f.e.checkoutRecoveryBusyRef.current,false);assert.equal(f.e.checkoutBusyRef.current,false);
});
await test('changing work while status waits preserves replacement work',async()=>{
 const f=fixture(),gate=deferred();f.e.requestPromptpay=()=>gate.promise;const pending=f.e.resumeStoredCheckout();await tick();f.e.currentOutputJobRef.current='job_replacement';f.e.savedWorkOpenRequestRef.current++;gate.resolve({response:response(),data:{...f.payment,status:'requires_action'}});await pending;assert.equal(f.e.currentOutputJobRef.current,'job_replacement');assert.equal(eventsOf(f,'studio').length,0);assert.equal(eventsOf(f,'unlock').length,0);
});
await test('rapid recovery clicks share the busy lock and one status read',async()=>{
 const f=fixture(),gate=deferred();f.e.requestPromptpay=async(url)=>{f.requests.push({url,method:'GET'});return gate.promise};const first=f.e.resumeStoredCheckout();await tick();const second=f.e.resumeStoredCheckout();await tick();assert.equal(f.requests.length,1);gate.resolve({response:response(),data:{...f.payment,status:'requires_action'}});await Promise.all([first,second]);assert.equal(eventsOf(f,'studio').length,1);assert.equal(f.e.checkoutBusyRef.current,false);
});
function pendingLegacy(f,url='https://checkout.stripe.com/c/pay/cs_fixture'){
 f.e.currentOutputJobRef.current='job_original';f.e.pendingLegacyCheckout={url,walletId:'wallet_original',jobId:'job_original',workScope:f.e.savedWorkOpenRequestRef.current,accountScope:walletScope(f.e.authToken(),f.e.currentWalletId())};
}
await test('legacy Checkout requires an explicit action and a matching persisted full draft',async()=>{
 const f=fixture();pendingLegacy(f);assert.equal(eventsOf(f,'navigate').length,0);await f.e.continueLegacyCheckout();assert.deepEqual(eventsOf(f,'navigate'),[['navigate','https://checkout.stripe.com/c/pay/cs_fixture']]);assert.equal(eventsOf(f,'loadDraft').length,1);assert.equal(f.requests.length,0);
});
for(const url of ['http://checkout.stripe.com/c/pay/x','https://checkout.stripe.com.evil.invalid/pay','https://user:password@checkout.stripe.com/c/pay/x','https://evil.invalid/pay','javascript:alert(1)','/relative'])await test('legacy navigation rejects unsafe URL '+url,async()=>{
 const f=fixture();pendingLegacy(f,url);await f.e.continueLegacyCheckout();assert.equal(eventsOf(f,'navigate').length,0);assert.equal(eventsOf(f,'loadDraft').length,0);assert(f.e.payMsg);
});
for(const bad of ['missing','wallet','job','workScope','accountScope','draft-wallet','draft-job','empty-draft'])await test('legacy navigation rejects mismatched '+bad,async()=>{
 const f=fixture();pendingLegacy(f);if(bad==='missing')f.e.pendingLegacyCheckout=null;else if(bad==='wallet')f.e.pendingLegacyCheckout.walletId='other';else if(bad==='job')f.e.pendingLegacyCheckout.jobId='other';else if(bad==='workScope')f.e.pendingLegacyCheckout.workScope++;else if(bad==='accountScope')f.e.pendingLegacyCheckout.accountScope='other';else if(bad==='draft-wallet')f.draft={...f.draft,walletId:'other'};else if(bad==='draft-job')f.draft={...f.draft,jobId:'other'};else f.draft={...f.draft,studio:{layers:[]}};
 await f.e.continueLegacyCheckout();assert.equal(eventsOf(f,'navigate').length,0);assert.equal(f.e.checkoutBusyRef.current,false);assert.equal(f.requests.length,0);
});
await test('switching account while loading a legacy draft prevents navigation',async()=>{
 const f=fixture(),gate=deferred();pendingLegacy(f);f.e.loadPurchaseDraft=()=>gate.promise;const pending=f.e.continueLegacyCheckout();await tick();f.switchAccount();gate.resolve(f.draft);await pending;assert.equal(eventsOf(f,'navigate').length,0);assert.equal(f.e.checkoutBusyRef.current,false);
});
await test('duplicate legacy continuation clicks navigate once',async()=>{
 const f=fixture(),gate=deferred();pendingLegacy(f);f.e.loadPurchaseDraft=()=>gate.promise;const first=f.e.continueLegacyCheckout();await tick();const second=f.e.continueLegacyCheckout();gate.resolve(f.draft);await Promise.all([first,second]);assert.equal(eventsOf(f,'navigate').length,1);
});
await test('legacy payment conflict preserves an explicit continuation without automatic redirect',async()=>{
 const f=fixture({job:'job_original'});f.storage.delete('idprom_pending_qr_v1');f.e.paymentStudioRef.current=()=>f.draft.studio;
 f.e.requestPromptpay=async(url,options)=>{f.requests.push({url,method:options.method});return{response:response(409),data:{error:'payment_pending_checkout',checkoutUrl:'https://checkout.stripe.com/c/pay/cs_fixture',message:'continue previous checkout'}}};
 await f.e.startCheckout('119');assert.equal(eventsOf(f,'persistDraft').length,1);assert.equal(eventsOf(f,'navigate').length,0);assert.equal(f.e.pendingLegacyCheckout.jobId,'job_original');assert.equal(f.e.pendingLegacyCheckout.accountScope,walletScope(f.e.authToken(),f.e.currentWalletId()));assert.equal(f.requests.length,1);assert.equal(f.e.checkoutBusyRef.current,false);
 await f.e.continueLegacyCheckout();assert.equal(eventsOf(f,'navigate').length,1);
});
for(const status of ['requires_action','succeeded','work_unlocked'])await test('reused '+status+' intent preserves the requested sibling snapshot job',async()=>{
 const f=fixture({job:'job_original',status});
 f.e.requestPromptpay=async()=>({response:response(),data:{...f.payment,jobId:'job_intent_origin',status,ok:completeStates.includes(status)}});
 await f.e.startCheckout('119');
 if(completeStates.includes(status))assert.equal(eventsOf(f,'unlock')[0]?.[1].jobId,'job_original');
 else{assert.equal(f.e.qrPaymentRef.current.jobId,'job_original');assert.equal(f.e.qrPaymentRef.current.paymentJobId,'job_intent_origin')}
});
await test('a sibling checkout leaves another output receipt to the server coordinator and preserves the actual offer',async()=>{
 const f=fixture({job:'job_sibling'});f.e.paymentStudioRef.current=()=>({layers:[{...f.head,jobId:'job_sibling'}]});let body;
 f.e.requestPromptpay=async(url,options)=>{body=JSON.parse(options.body);return{response:response(),data:{...f.payment,packageId:'119',jobId:'job_original',status:'requires_action'}}};
 await f.e.startCheckout('159');assert.equal(body.pendingPaymentIntentId,undefined);assert.equal(body.jobId,'job_sibling');assert.equal(f.e.qrPaymentRef.current.jobId,'job_sibling');assert.equal(f.e.qrPaymentRef.current.paymentJobId,'job_original');assert.equal(f.e.qrPaymentRef.current.packageId,'119');
});
await test('covered sibling creation settles only the requested output without a QR image',async()=>{
 const f=fixture({job:'job_sibling'});f.e.paymentStudioRef.current=()=>({layers:[{...f.head,jobId:'job_sibling'}]});let reads=0;
 f.e.verifyOutputRights=async()=>({checked:true,unlocked:++reads>1,premiumHair:false});
 f.e.requestPromptpay=async()=>({response:response(),data:{...f.payment,jobId:'job_original',status:'work_unlocked',ok:true,qrImage:null}});
 await f.e.startCheckout('119');assert.equal(eventsOf(f,'unlock')[0]?.[1].jobId,'job_sibling');assert.equal(f.e.qrPaymentRef.current,null);
});
if(output){await mkdir(output,{recursive:true});await writeFile(output+'/explicit-checkout-recovery-results.json',JSON.stringify({time:new Date().toISOString(),scope:'Actual current App recovery/restore/settlement/legacy continuation functions; all storage, HTTP and navigation mocked. No live charges or customer writes.',passed:results.length-failures,failed:failures,results},null,2));}
console.log(`${results.length-failures} explicit checkout recovery scenarios passed; ${failures} failed. Mock boundaries only.`);
if(failures)process.exitCode=1;
