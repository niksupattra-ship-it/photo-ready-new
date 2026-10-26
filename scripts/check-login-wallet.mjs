import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWalletRefresh,hasWalletBalance,walletScope} from '../src/wallet-refresh.js';
import {withDeadline} from '../src/async-deadline.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
let checked=0;
const test=async(name,run)=>{await run();checked++;console.log('PASS: '+name)};
function walletEnv(initial={token:'member',walletId:'walletA'}){
 let identity={...initial};const calls=[],applied=[],errors=[];let unauthorized=0;
 const loader=createWalletRefresh({session:()=>({...identity}),headers:()=>({Authorization:identity.token,'X-Wallet-Id':identity.walletId}),request:(url,options,deadline)=>{const job=deferred();calls.push({url,options,deadline,...job});return job.promise},writeWallet:walletId=>{identity.walletId=walletId},onData:(data,scope)=>applied.push({data,scope}),onError:(error,scope)=>errors.push({error,scope}),onUnauthorized:()=>{unauthorized++;identity={token:'',walletId:''}}});
 return {loader,calls,applied,errors,setIdentity:value=>{identity={...value}},identity:()=>identity,unauthorized:()=>unauthorized};
}
await test('only a finite nonnegative number or nonempty numeric string is a balance',async()=>{
 for(const value of [0,2,'0','2.5'])assert.equal(hasWalletBalance({processRemaining:value}),true);
 for(const value of [undefined,null,'',' ',false,true,[],{},-1,Infinity,NaN,'invalid'])assert.equal(hasWalletBalance({processRemaining:value}),false);
});
await test('concurrent balance users share one request and skip auth/me and history',async()=>{
 const e=walletEnv(),a=e.loader.load(),b=e.loader.load();assert.equal(a,b);await tick();assert.equal(e.calls.length,1);assert.equal(e.calls[0].url,'/api/wallet?summary=1');assert.equal(e.calls[0].options.method,undefined);e.calls[0].resolve(response({walletId:'walletA',processRemaining:4}));await Promise.all([a,b]);assert.equal(e.applied.length,1);
});
await test('authoritative member wallet updates the stored id without another round trip',async()=>{
 const e=walletEnv();const pending=e.loader.load();await tick();e.calls[0].resolve(response({walletId:'authoritative',processRemaining:0}));await pending;assert.equal(e.identity().walletId,'authoritative');assert.equal(e.applied[0].scope,walletScope('member','authoritative'));assert.equal(e.calls.length,1);
});
await test('anonymous wallet creation is shared and does not commit after sign-in',async()=>{
 const e=walletEnv({token:'',walletId:''}),a=e.loader.load(),b=e.loader.load();const rejected=Promise.allSettled([a,b]);await tick();assert.equal(e.calls.length,1);assert.equal(e.calls[0].options.method,'POST');e.setIdentity({token:'new-member',walletId:'member-wallet'});e.loader.invalidate();e.calls[0].resolve(response({walletId:'guest-wallet',processRemaining:0}));const result=await rejected;assert(result.every(r=>r.status==='rejected'&&r.reason.code==='WALLET_SCOPE_CHANGED'));assert.equal(e.applied.length,0);assert.equal(e.identity().walletId,'member-wallet');
});
await test('a scheduled stale refresh never sends new identity headers',async()=>{
 const e=walletEnv(),pending=e.loader.load();const failure=assert.rejects(pending,{code:'WALLET_SCOPE_CHANGED'});e.setIdentity({token:'other',walletId:'other-wallet'});await failure;assert.equal(e.calls.length,0);assert.equal(e.applied.length,0);
});
await test('a stale body cannot overwrite a new account or clear its session',async()=>{
 const e=walletEnv(),body=deferred(),pending=e.loader.load();const failure=assert.rejects(pending,{code:'WALLET_SCOPE_CHANGED'});await tick();e.calls[0].resolve({ok:true,status:200,json:()=>body.promise});await tick();e.setIdentity({token:'other',walletId:'other-wallet'});body.resolve({walletId:'walletA',processRemaining:20});await failure;assert.equal(e.applied.length,0);assert.equal(e.unauthorized(),0);
});
await test('missing guest wallet recovers once while missing member wallet never creates another',async()=>{
 const guest=walletEnv({token:'',walletId:'missing'}),a=guest.loader.load();await tick();guest.calls[0].resolve(response({},404));await tick();assert.equal(guest.calls.length,2);assert.equal(guest.calls[1].options.method,'POST');guest.calls[1].resolve(response({walletId:'new-guest',processRemaining:0}));await a;assert.equal(guest.applied[0].scope,walletScope('','new-guest'));
 const member=walletEnv(),b=member.loader.load();const failure=assert.rejects(b);await tick();member.calls[0].resolve(response({},404));await failure;assert.equal(member.calls.length,1);assert.equal(member.identity().walletId,'walletA');
});
await test('invalid balance or server error preserves previously applied data and permits retry',async()=>{
 const e=walletEnv(),a=e.loader.load();const failure=assert.rejects(a);await tick();e.calls[0].resolve(response({walletId:'walletA',processRemaining:false}));await failure;assert.equal(e.applied.length,0);assert.equal(e.errors.length,1);const b=e.loader.load();await tick();e.calls[1].resolve(response({walletId:'walletA',processRemaining:2}));await b;assert.equal(e.applied.length,1);
});
await test('expired current token is cleared while an old 401 cannot sign out a new user',async()=>{
 const e=walletEnv(),a=e.loader.load();const failure=assert.rejects(a,{code:'WALLET_AUTH_REQUIRED'});await tick();e.calls[0].resolve(response({},401));await failure;assert.equal(e.unauthorized(),1);
 const other=walletEnv(),b=other.loader.load();const stale=assert.rejects(b,{code:'WALLET_SCOPE_CHANGED'});await tick();other.setIdentity({token:'new',walletId:'new'});other.calls[0].resolve(response({},401));await stale;assert.equal(other.unauthorized(),0);assert.equal(other.identity().token,'new');
});
await test('invalidation blocks anonymous ABA responses after login then logout',async()=>{
 const e=walletEnv({token:'',walletId:''}),pending=e.loader.load();const failure=assert.rejects(pending,{code:'WALLET_REFRESH_SUPERSEDED'});await tick();e.setIdentity({token:'member',walletId:'member'});e.loader.invalidate();e.setIdentity({token:'',walletId:''});e.loader.invalidate();e.calls[0].resolve(response({walletId:'obsolete-guest',processRemaining:0}));await failure;assert.equal(e.applied.length,0);assert.equal(e.identity().walletId,'');
});
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
await test('payment grants and usage debits supersede earlier shared balance reads',async()=>{
 const start=main.indexOf(' const acceptWalletRights=data=>{'),end=main.indexOf('\n };',start);
 const expression=main.slice(start,end+4).trim().replace(/^const acceptWalletRights=/,'').replace(/;$/,'');
 for(const confirmed of [10,2]){
  const e=walletEnv();let rights={generationRemaining:5},snapshot={scope:walletScope('member','walletA'),data:{walletId:'walletA',processRemaining:5}};
  const env={walletScope,hasWalletBalance,authToken:()=>e.identity().token,currentWalletId:()=>e.identity().walletId,walletRefreshRef:{current:e.loader},normalizedRights:data=>({generationRemaining:Number(data.processRemaining)}),setRights:change=>{rights=typeof change==='function'?change(rights):change},setWalletBalance:change=>{snapshot=typeof change==='function'?change(snapshot):change}};
  const accept=new Function('env',`with(env){return ${expression}}`)(env),old=e.loader.load();const stale=assert.rejects(old,{code:'WALLET_REFRESH_SUPERSEDED'});await tick();
  accept({walletId:'walletA',processRemaining:confirmed});assert.equal(rights.generationRemaining,confirmed);assert.equal(snapshot.data.processRemaining,confirmed);
  const fresh=e.loader.load();assert.notEqual(fresh,old);await tick();assert.equal(e.calls.length,2);
  e.calls[0].resolve(response({walletId:'walletA',processRemaining:5}));await stale;assert.equal(e.applied.length,0);assert.equal(rights.generationRemaining,confirmed);
  e.calls[1].resolve(response({walletId:'walletA',processRemaining:confirmed}));await fresh;assert.equal(e.applied.length,1);assert.equal(e.errors.length,0);
 }
});

await test('a delayed credit mutation from another wallet cannot alter or invalidate the current account',async()=>{
 const e=walletEnv();let rights={generationRemaining:3},snapshot={scope:walletScope('member','walletA'),data:{walletId:'walletA',processRemaining:3}};
 const env={walletScope,hasWalletBalance,authToken:()=>e.identity().token,currentWalletId:()=>e.identity().walletId,walletRefreshRef:{current:e.loader},normalizedRights:data=>({generationRemaining:Number(data.processRemaining)}),setRights:change=>{rights=typeof change==='function'?change(rights):change},setWalletBalance:change=>{snapshot=typeof change==='function'?change(snapshot):change}};
 const start=main.indexOf(' const acceptWalletRights=data=>{'),end=main.indexOf('\n };',start),expression=main.slice(start,end+4).trim().replace(/^const acceptWalletRights=/,'').replace(/;$/,'');
 const accept=new Function('env',`with(env){return ${expression}}`)(env),pending=e.loader.load();await tick();
 accept({walletId:'old-account-wallet',processRemaining:99});assert.equal(rights.generationRemaining,3);assert.equal(snapshot.data.processRemaining,3);
 assert.equal(e.loader.load(),pending);e.calls[0].resolve(response({walletId:'walletA',processRemaining:3}));await pending;assert.equal(e.applied.length,1);
 accept({processRemaining:2});assert.equal(rights.generationRemaining,2);
});
function compile(name,env){const start=main.indexOf(' const '+name+'=async');assert(start>=0);const end=main.indexOf('\n };',start);assert(end>=0);const expression=main.slice(start,end+4).trim().replace(new RegExp('^const '+name+'='),'').replace(/;$/,'');return new Function('env',`with(env){return ${expression}}`)(env)}
function authEnv({trial=false,pkg=null}={}){
 const storage=new Map([['wallet','guest-source']]),calls=[],events=[];let walletRefreshes=0;
 const e={AUTH_TOKEN_KEY:'token',WALLET_KEY:'wallet',authMode:'login',authEmail:'fixture@example.invalid',authPassword:'fixture-password',pendingPackage:pkg,appStorage:{setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key),getItem:key=>storage.get(key)},authToken:()=>storage.get('token')||'',currentWalletId:()=>storage.get('wallet')||'',walletHeaders:()=>({Authorization:'Bearer '+(storage.get('token')||''),'X-Wallet-Id':storage.get('wallet')||''}),walletScope,hasWalletBalance,normalizedRights:data=>data,walletRefreshRef:{current:{invalidate:()=>events.push('invalidate')}},authClaimRef:{current:null},currentOutputTrialRef:{current:trial},currentOutputJobRef:{current:trial?'trial-job':''},portraitFetch:(url,options,deadline)=>{const job=deferred();calls.push({url,options,deadline,...job});return job.promise},refreshWallet:()=>{walletRefreshes++;return Promise.resolve(null)},activatePrivateTrial:async()=>events.push('private-trial'),startCheckout:async id=>events.push('checkout:'+id),redeemFreeLink:async code=>events.push('promo:'+code),setAuthBusy:value=>events.push('busy:'+value),setAuthMsg:value=>{e.authError=value;events.push('auth-message:'+value)},setAccountEmail:()=>{},setWalletBalance:value=>{e.walletBalance=value},setRights:value=>{e.rights=value},setQrPayment:()=>{},setPurchaseEditing:()=>{},setPrivateTrialActive:()=>{},setFeatureSession:()=>{},setFreeFeatureSession:()=>{},setAuthOpen:value=>events.push('open:'+value),setScreen:value=>events.push('screen:'+value),setPendingPackage:()=>{},setPayMsg:value=>{e.payError=value},setBuyOpen:value=>events.push('buy:'+value),setAccountSaveNotice:value=>{e.notice=value}};
 e.withDeadline=withDeadline;e.authSubmitBusyRef={current:false};e.setPayBusy=value=>events.push('pay-busy:'+value);
 e.claimAccountOutput=compile('claimAccountOutput',e);e.submitAuth=compile('submitAuth',e);
 return {e,storage,calls,events,walletRefreshes:()=>walletRefreshes};
}
await test('valid sign-in without a bundled balance closes immediately and loads credits separately',async()=>{
 const a=authEnv();a.e.refreshWallet=()=>new Promise(()=>{});const pending=a.e.submitAuth();await tick();assert.equal(a.calls[0].deadline,15000);assert.equal(JSON.parse(a.calls[0].options.body).sessionOnly,true);assert.equal(a.calls[0].options.headers.Authorization,undefined);a.calls[0].resolve(response({token:'member-token',walletId:'member-wallet'}));await pending;assert.equal(a.storage.get('token'),'member-token');assert(a.events.includes('open:false'));assert.equal(a.e.authError,'');assert.equal(a.e.walletBalance.data,null);
});
await test('invalid credentials or malformed success do not create a client session',async()=>{
 for(const [data,status] of [[{message:'invalid password'},401],[{token:'',walletId:'member'},200],[{token:'token'},200]]){const a=authEnv(),pending=a.e.submitAuth();await tick();a.calls[0].resolve(response(data,status));await pending;assert.equal(a.storage.get('token'),undefined);assert(!a.events.includes('open:false'));assert(a.e.authError)}
});
await test('slow or failed trial transfer cannot hold login open or launch checkout',async()=>{
 const a=authEnv({trial:true,pkg:'package89'}),pending=a.e.submitAuth();await tick();a.calls[0].resolve(response({token:'member-token',walletId:'member-wallet'}));await tick();assert(a.events.includes('open:false'));assert.equal(a.calls.length,2);assert.equal(a.calls[1].url,'/api/images/trial-job/claim');assert.equal(JSON.parse(a.calls[1].options.body).sourceWalletId,'guest-source');assert.equal(a.calls[1].options.headers['X-Wallet-Id'],'member-wallet');assert(!a.events.includes('checkout:package89'));a.calls[1].resolve(response({},500));await pending;assert.equal(a.storage.get('token'),'member-token');assert.equal(a.e.authError,'');assert(a.e.payError.includes('ย้ายรูปทดลอง'));assert(a.events.includes('buy:true'));assert(!a.events.includes('checkout:package89'));
});
await test('trial transfer is shared on retry and must finish before pending purchase',async()=>{
 const a=authEnv({trial:true,pkg:'package89'}),pending=a.e.submitAuth();await tick();a.calls[0].resolve(response({token:'member-token',walletId:'member-wallet'}));await tick();const retry=a.e.claimAccountOutput();assert.equal(a.calls.length,2);a.calls[1].resolve(response({ok:true}));await Promise.all([pending,retry]);assert(a.events.includes('checkout:package89'));assert.equal(a.e.authClaimRef.current,null);
});
await test('transfer response for a replaced photo cannot start a pending checkout',async()=>{
 const a=authEnv({trial:true,pkg:'package89'}),pending=a.e.submitAuth();await tick();a.calls[0].resolve(response({token:'member-token',walletId:'member-wallet'}));await tick();a.e.currentOutputJobRef.current='new-job';a.calls[1].resolve(response({ok:true}));await pending;assert(!a.events.includes('checkout:package89'));assert(a.e.payError.includes('รูปเปลี่ยน'));
});
await test('trial transfer failure without purchase intent displays a Studio notice',async()=>{
 const a=authEnv({trial:true}),pending=a.e.submitAuth();await tick();a.calls[0].resolve(response({token:'member-token',walletId:'member-wallet'}));await tick();a.calls[1].reject(Error('offline'));await pending;assert(a.e.notice.title.includes('เข้าสู่ระบบแล้ว'));assert.equal(a.e.authError,'');assert(!a.events.includes('buy:true'));
});
assert(main.includes('await claimAccountOutput();await refreshWallet();'));
console.log(`PASS: ${checked} login and wallet regression scenarios; requests mocked, no customer or payment writes.`);
