// Run the actual App auth handler with inert local account/checkout boundaries.
// Authentication must not navigate or reconstruct an existing editing session.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {withDeadline} from '../src/async-deadline.js';
const main=await readFile(process.env.IDPROM_AUDIT_MAIN||new URL('../src/main.jsx',import.meta.url),'utf8');
const start=main.indexOf(' const submitAuth=async'),end=main.indexOf('\n };',start);
assert(start>=0&&end>start,'actual App submitAuth handler is available');
const handler=main.slice(start,end+4).trim().replace(/^const submitAuth=/,'').replace(/;$/,'');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const rows=[];
async function test(name,run){await run();rows.push({name,passed:true});console.log('PASS '+name)}
function fixture(surface,{mode='login',intent=null,trial=surface!=='home'}={}){
 const events=[],storage=new Map([['wallet','guest-wallet']]);
 const layers=surface==='home'?null:[{id:'head-fixture',jobId:'job-fixture',source:'data:image/png;base64,fixture',x:112,y:81,scale:1.17},{id:'suit-fixture',templatePath:'/assets/fixture.png',x:0,y:600}];
 const state={screen:surface==='home'?'home':'studio',easy:surface==='easy',project:layers?{name:'unsaved-work',layers}:null,layers,sourcePhoto:surface==='home'?null:{name:'original.jpg',bytes:'immutable fixture'},savedWorkId:'',revision:9,authOpen:true};
 const initial={...state};
 const route=(key,value)=>{events.push(['route',key,value]);state[key]=value};
 const e={
  authMode:mode,authEmail:'auth-location@example.invalid',authPassword:'fixture-password',pendingPackage:intent,
  AUTH_TOKEN_KEY:'token',WALLET_KEY:'wallet',authSubmitBusyRef:{current:false},authClaimRef:{current:null},currentOutputTrialRef:{current:trial},currentOutputJobRef:{current:surface==='home'?'':'job-fixture'},
  walletRefreshRef:{current:{invalidate:()=>events.push(['invalidate'])}},walletScope:(...args)=>JSON.stringify(args),hasWalletBalance:()=>false,normalizedRights:data=>data,withDeadline,
  appStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  authToken:()=>storage.get('token')||'',currentWalletId:()=>storage.get('wallet')||'',walletHeaders:()=>({'X-Wallet-Id':storage.get('wallet'),Authorization:'Bearer old-guest-header'}),activeSavedDownloadWork:'',
  portraitFetch:async(url,options)=>{events.push(['auth-request',url,options]);return {ok:true,json:async()=>({token:'member-token',walletId:'member-wallet'})}},
  refreshWallet:async()=>{events.push(['refresh']);return {walletId:storage.get('wallet'),processRemaining:0}},activatePrivateTrial:async()=>events.push(['private-trial']),
  claimAccountOutput:async()=>{events.push(['claim-start']);events.push(['claim-end'])},startCheckout:async(...args)=>events.push(['checkout',...args]),redeemFreeLink:async code=>events.push(['promo',code]),
  setScreen:value=>route('screen',value),setEasyMode:value=>route('easy',value),setStudioData:value=>route('layers',value),setSavedWorkRevision:value=>route('revision',value),setRestoredSourcePhoto:value=>route('sourcePhoto',value),
  setAuthOpen:value=>{events.push(['auth-open',value]);state.authOpen=value},setAuthBusy:value=>events.push(['auth-busy',value]),setAuthMsg:value=>events.push(['auth-error',value]),setAccountEmail:value=>events.push(['email',value]),setWalletBalance:value=>events.push(['wallet',value]),setRights:value=>events.push(['rights',value]),
  setQrPayment:value=>events.push(['qr',value]),setPurchaseEditing(){},setPrivateTrialActive(){},setFeatureSession(){},setFreeFeatureSession(){},setPayBusy:value=>events.push(['pay-busy',value]),setPendingPackage(){},setPayMsg:value=>events.push(['pay-error',value]),setBuyOpen:value=>events.push(['buy-open',value]),setAccountSaveNotice:value=>events.push(['notice',value])
 };
 const submit=new Function('env',`with(env){return ${handler}}`)(e);
 const unchanged=()=>{
  for(const key of ['screen','easy','project','layers','sourcePhoto','savedWorkId','revision'])assert.equal(state[key],initial[key],surface+' preserves '+key);
  assert.deepEqual(events.filter(event=>event[0]==='route'),[],surface+' does not navigate or reconstruct the editor');
 };
 return {e,events,state,initial,storage,submit,unchanged};
}
for(const surface of ['home','easy','studio'])for(const mode of ['login','register']){
 await test(mode+' from '+surface+' preserves its page, mode, source and current layer identity',async()=>{
  const f=fixture(surface,{mode});await f.submit();f.unchanged();assert.equal(f.storage.get('token'),'member-token');assert.equal(f.storage.get('wallet'),'member-wallet');assert.equal(f.state.authOpen,false);assert.equal(f.e.authSubmitBusyRef.current,false);assert.equal(f.events.filter(event=>event[0]==='auth-request').length,1);assert(!f.events.some(event=>['checkout','promo','buy-open'].includes(event[0])));
 });
}
for(const surface of ['home','easy','studio']){
 await test('failed login on '+surface+' retains the page and open form without creating a member session',async()=>{
  const f=fixture(surface);f.e.portraitFetch=async()=>({ok:false,json:async()=>({message:'invalid fixture credentials'})});await f.submit();f.unchanged();assert.equal(f.state.authOpen,true);assert.equal(f.storage.get('token'),undefined);assert.equal(f.storage.get('wallet'),'guest-wallet');assert(f.events.some(event=>event[0]==='auth-error'&&event[1]==='invalid fixture credentials'));assert(!f.events.some(event=>event[0]==='claim-start'||event[0]==='checkout'));
 });
}
for(const surface of ['easy','studio']){
 await test('pending trial claim after '+surface+' login closes authentication while keeping the unsaved editor mounted',async()=>{
  const f=fixture(surface),claim=deferred();f.e.claimAccountOutput=async()=>{f.events.push(['claim-start']);await claim.promise;f.events.push(['claim-end'])};const pending=f.submit();await tick();assert.equal(f.storage.get('token'),'member-token');assert.equal(f.state.authOpen,false);assert(f.e.authClaimRef.current?.jobId==='job-fixture');f.unchanged();claim.resolve();await pending;f.unchanged();assert.equal(f.e.authSubmitBusyRef.current,false);
 });
}
for(const surface of ['home','easy','studio'])for(const offer of ['89','159']){
 await test(offer+' checkout after '+surface+' authentication keeps its origin and waits for ownership transfer',async()=>{
  const f=fixture(surface,{intent:offer}),claim=deferred();f.e.claimAccountOutput=async()=>{f.events.push(['claim-start']);await claim.promise;f.events.push(['claim-end'])};const pending=f.submit();await tick();f.unchanged();assert.equal(f.state.authOpen,false);assert(!f.events.some(event=>event[0]==='checkout'));claim.resolve();await pending;f.unchanged();assert.deepEqual(f.events.filter(event=>event[0]==='checkout'),[['checkout',offer,true]]);assert(f.events.findIndex(event=>event[0]==='claim-end')<f.events.findIndex(event=>event[0]==='checkout'));
 });
}
await test('a stalled post-login balance read cannot navigate home or keep the login form open',async()=>{
 const f=fixture('home');f.e.refreshWallet=()=>new Promise(()=>{});await f.submit();f.unchanged();assert.equal(f.state.authOpen,false);assert.equal(f.storage.get('token'),'member-token');assert.equal(f.e.authSubmitBusyRef.current,false);
});
await test('duplicate login clicks preserve Studio and submit once',async()=>{
 const f=fixture('studio'),auth=deferred();f.e.portraitFetch=async()=>{f.events.push(['auth-request']);return auth.promise};const first=f.submit();await tick();const second=f.submit();auth.resolve({ok:true,json:async()=>({token:'member-token',walletId:'member-wallet'})});await Promise.all([first,second]);f.unchanged();assert.equal(f.events.filter(event=>event[0]==='auth-request').length,1);assert.equal(f.events.filter(event=>event[0]==='claim-start').length,1);assert.equal(f.e.authSubmitBusyRef.current,false);
});
await test('claim failure keeps the Easy workspace and reports recovery without starting a checkout',async()=>{
 const f=fixture('easy',{intent:'159'});f.e.claimAccountOutput=async()=>{throw Error('fixture transfer failed')};await f.submit();f.unchanged();assert.equal(f.state.authOpen,false);assert.equal(f.storage.get('token'),'member-token');assert(!f.events.some(event=>event[0]==='checkout'));assert(f.events.some(event=>event[0]==='pay-error'&&event[1]==='fixture transfer failed'));assert(f.events.some(event=>event[0]==='buy-open'&&event[1]===true));
});
const result={passed:rows.length,failed:0,scope:'Actual App submitAuth handler. Navigation, editor identity, local auth, wallet, trial-claim and checkout boundaries are inert fixtures; no customer account, production payment or provider request.',results:rows};
if(process.env.IDPROM_AUTH_LOCATION_OUTPUT){await mkdir(dirname(process.env.IDPROM_AUTH_LOCATION_OUTPUT),{recursive:true});await writeFile(process.env.IDPROM_AUTH_LOCATION_OUTPUT,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({passed:rows.length,failed:0}));
