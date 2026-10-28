import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walletScope,hasWalletBalance} from '../src/wallet-refresh.js';
import {fetchOutputRights,outputAccessResult} from '../src/output-rights.js';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const dialog=await readFile(new URL('../src/studio-rights-dialog.jsx',import.meta.url),'utf8');
const normalizedRights=new Function(main.slice(main.indexOf('function normalizedRights('),main.indexOf('\nconst GOVERNMENT_FINANCE_TEMPLATE'))+';return normalizedRights')();
const rightsSummary=new Function(dialog.slice(dialog.indexOf('export function rightsSummary('),dialog.indexOf('export function StudioRightsDialog')).replace('export ','')+';return rightsSummary')();
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const noop=()=>{};
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};

function activation(){
 const storage=new Map([['token','owner-token'],['wallet','owner-wallet']]),requests=[];
 const state={active:false,checking:false,alerts:[]};
 const env={PRIVATE_TRIAL_KEY:'private',walletScope,privateTrialActivationRef:{current:0},authToken:()=>storage.get('token')||'',currentWalletId:()=>storage.get('wallet')||'',
  appStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  location:{hash:'',pathname:'/',search:''},history:{replaceState:noop},privateTrialRequested:()=>storage.get('private')==='1',
  walletHeaders:()=>({Authorization:storage.get('token'),'X-Wallet-Id':storage.get('wallet')}),
  fetch:(url,options)=>{const r=deferred();requests.push({url,options,...r});return r.promise},
  setPrivateTrialActive:value=>{state.active=value},setPrivateTrialChecking:value=>{state.checking=value},window:{alert:value=>state.alerts.push(value)}};
 const a=main.indexOf(' const activatePrivateTrial=async()=>{'),b=main.indexOf('\n useEffect(()=>{const onPrivateTrialLink=',a);
 assert(a>=0&&b>a);
 const run=new Function('env',`with(env){${main.slice(a,b)};return activatePrivateTrial}`)(env);
 return {storage,requests,state,env,run};
}

await test('only explicit server owner flags display unlimited access, without changing stored credit quantities',async()=>{
 const actual=normalizedRights({processRemaining:0,canSave:true,ownerAccess:true,unlimitedDownloads:true,allFeatures:true});
 assert.equal(actual.ownerAccess,true);assert.equal(actual.unlimitedDownloads,true);assert.equal(actual.allFeatures,true);assert.equal(actual.canSave,true);assert.equal(actual.generationRemaining,0);assert.equal(actual.hairRemaining,0);
 assert.equal(rightsSummary({...actual,processRemaining:0}).credits,'∞');
 for(const data of [{email:'treeradech009@gmail.com',processRemaining:0},{ownerAccess:'true',unlimitedDownloads:true,allFeatures:true,processRemaining:0},{ownerAccess:false,unlimitedDownloads:true,allFeatures:true,processRemaining:0}]){
  const normal=normalizedRights(data);assert.equal(normal.ownerAccess,false);assert.equal(normal.unlimitedDownloads,false);assert.equal(normal.allFeatures,false);assert.equal(rightsSummary(normal).credits,0);
 }
 assert.equal(rightsSummary({processRemaining:3,ownerAccess:false,unlimitedDownloads:false}).credits,3);
});
await test('normal activation reads server verification and carries the current authentication scope',async()=>{
 const f=activation(),pending=f.run();assert.equal(f.requests[0].url,'/api/private-trial');assert.equal(f.requests[0].options.headers.Authorization,'owner-token');
 f.requests[0].resolve(response({active:true,ownerAccess:true}));await pending;assert.equal(f.state.active,true);assert.equal(f.storage.get('private'),'1');assert.equal(f.state.checking,false);
});
await test('a successful owner reply after another account signs in cannot enable private UI or headers',async()=>{
 const f=activation(),pending=f.run();f.storage.set('token','customer-token');f.storage.set('wallet','customer-wallet');f.requests[0].resolve(response({active:true,ownerAccess:true}));await pending;
 assert.equal(f.state.active,false);assert.equal(f.storage.get('private'),undefined);assert.equal(f.state.alerts.length,0);assert.equal(f.state.checking,false);
});
await test('a stale failure cannot disable a newer verified activation or show an obsolete warning',async()=>{
 const f=activation();f.storage.set('private','1');const older=f.run();f.storage.set('token','next-token');f.storage.set('wallet','next-wallet');const newer=f.run();
 f.requests[1].resolve(response({active:true}));await newer;f.requests[0].reject(Error('old network failure'));await older;
 assert.equal(f.state.active,true);assert.equal(f.storage.get('private'),'1');assert.equal(f.state.alerts.length,0);
});
await test('latest verification wins even if two reads share the same account',async()=>{
 const f=activation(),older=f.run(),newer=f.run();f.requests[1].resolve(response({active:false}));await newer;f.requests[0].resolve(response({active:true}));await older;
 assert.equal(f.state.active,false);assert.equal(f.storage.get('private'),undefined);
});
await test('logout clears the private request flag and owner rights before a guest wallet refresh',async()=>{
 const storage=new Map([['token','member'],['wallet','owner-wallet'],['private','1']]);let active=true,rights={ownerAccess:true,unlimitedDownloads:true};const events=[];
 const env={PRIVATE_TRIAL_KEY:'private',AUTH_TOKEN_KEY:'token',WALLET_KEY:'wallet',activeSavedDownloadWork:'old-work',walletRefreshRef:{current:{invalidate:()=>events.push('invalidate')}},authClaimRef:{current:{}},
  appStorage:{removeItem:k=>storage.delete(k)},setPrivateTrialActive:v=>{active=v},setRights:v=>{rights=v},refreshWallet:()=>{assert.equal(active,false);assert.equal(storage.get('private'),undefined);events.push('refresh')},
  setPackageCodeRecovery:noop,setPackageCodeRecoveryMessage:noop,setPackageCodeInput:noop,setPackageCodeResult:noop,setPackageCodeMessage:noop,setPackageCodeOpen:noop,
  setQrPayment:noop,setCheckoutRecovery:noop,setCheckoutRecoveryMessage:noop,setPendingLegacyCheckout:noop,setPurchaseEditing:noop,setWalletBalance:noop,setFeatureSession:noop,setFreeFeatureSession:noop,setAccountEmail:noop,setAccountMenuOpen:noop};
 const a=main.indexOf(' const logout=()=>{'),b=main.indexOf('\n',a+1);const logout=new Function('env',`with(env){${main.slice(a,b)};return logout}`)(env);logout();
 assert.equal(active,false);assert.equal(storage.get('token'),undefined);assert.equal(storage.get('wallet'),undefined);assert.equal(rights.ownerAccess,undefined);assert.equal(rights.unlimitedDownloads,undefined);assert.deepEqual(events,['invalidate','refresh']);
});
await test('owner UI does not replace owned-image verification or turn another account image into a download',async()=>{
 const unauthorized=await fetchOutputRights('other-account-job',async()=>response({},403),{Authorization:'owner-token'});
 assert.equal(unauthorized.checked,false);assert.equal(outputAccessResult([unauthorized]).allowed,false);
 const verified=await fetchOutputRights('owned-job',async()=>response({unlocked:true,fullEdit:true,premiumHair:true,ownerAccess:true}),{Authorization:'owner-token'});
 assert.equal(outputAccessResult([verified]).allowed,true);assert.equal(verified.premiumHair,true);
});
await test('scoped partial credit updates preserve owner privileges while an explicit customer summary revokes them',async()=>{
 let rights=normalizedRights({ownerAccess:true,unlimitedDownloads:true,allFeatures:true,canSave:true,processRemaining:0});
 const env={walletScope,hasWalletBalance,authToken:()=> 'owner-token',currentWalletId:()=> 'owner-wallet',walletRefreshRef:{current:{invalidate:noop}},normalizedRights,setWalletBalance:noop,setRights:change=>{rights=change(rights)}};
 const a=main.indexOf(' const acceptWalletRights=data=>{'),b=main.indexOf('\n };',a);
 const accept=new Function('env',`with(env){${main.slice(a,b+4)};return acceptWalletRights}`)(env);
 accept({walletId:'owner-wallet',processRemaining:0});assert.equal(rights.ownerAccess,true);assert.equal(rights.canSave,true);
 accept({walletId:'different-wallet',processRemaining:20,ownerAccess:false,unlimitedDownloads:false,canSave:false});assert.equal(rights.ownerAccess,true);
 accept({walletId:'owner-wallet',processRemaining:0,ownerAccess:false,unlimitedDownloads:false,allFeatures:false,canSave:false});assert.equal(rights.ownerAccess,false);assert.equal(rights.canSave,false);
});
for(const permitted of [true,false])await test('confirmed owner checkout bypasses an old QR and '+(permitted?'grants only the verified image':'holds a denied image without payment'),async()=>{
 const storage=new Map([['idprom_pending_qr_v1',JSON.stringify({walletId:'owner-wallet',jobId:'owner-job',paymentIntentId:'pi_old'})]]),events=[];
 const env={walletScope,authToken:()=> 'owner-token',currentWalletId:()=> 'owner-wallet',checkoutReturnRef:{current:null},checkoutBusyRef:{current:false},currentOutputJobRef:{current:'owner-job'},currentOutputTrialRef:{current:true},savedWorkOpenRequestRef:{current:0},
  analyticsEvent:noop,setPendingLegacyCheckout:noop,setPayBusy:noop,setPayMsg:v=>events.push(['message',v]),claimAccountOutput:async()=>{},refreshWallet:async()=>({walletId:'owner-wallet',ownerAccess:true,unlimitedDownloads:true,processRemaining:0}),
  setQrPayment:v=>events.push(['qr',v]),setBuyOpen:v=>events.push(['buy',v]),setAccountSaveNotice:v=>events.push(['notice',v]),setTrialPreview:v=>events.push(['trial',v]),setDownloadUnlockSignal:v=>events.push(['unlock',v]),
  verifyOutputRights:async()=>({checked:true,unlocked:permitted,fullEdit:permitted}),appStorage:{getItem:k=>storage.get(k)},requestPromptpay:async()=>{throw Error('owner must not call payment provider')},fetch:async()=>response({})};
 for(const name of ['savePaidCheckout','startCheckout']){const a=main.indexOf(' const '+name+'=async'),b=main.indexOf('\n };',a);env[name]=new Function('env',`with(env){${main.slice(a,b+4)};return ${name}}`)(env)}
 await env.startCheckout('159');assert(!events.some(([kind,value])=>kind==='qr'&&value));assert(!events.some(([kind,value])=>kind==='buy'&&value));assert.equal(events.filter(([kind])=>kind==='unlock').length,permitted?1:0);assert.equal(events.filter(([kind,value])=>kind==='notice'&&value).length,permitted?0:1);
});
console.log(JSON.stringify({passed,scope:'Actual client rights normalization, private activation, logout, and output verification. Local request fixtures only; no account or provider mutations.'}));
