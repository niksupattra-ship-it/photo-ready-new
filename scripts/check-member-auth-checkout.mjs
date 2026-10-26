import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withDeadline} from '../src/async-deadline.js';
const main=await readFile(process.env.IDPROM_AUDIT_MAIN||new URL('../src/main.jsx',import.meta.url),'utf8');
function compile(env){const start=main.indexOf(' const submitAuth=async'),end=main.indexOf('\n };',start);return new Function('env',`with(env){return ${main.slice(start,end+4).trim().replace(/^const submitAuth=/,'').replace(/;$/,'')}}`)(env)}
function fixture(mode='register'){
 const storage=new Map([['wallet','guest']]),events=[];
 const e={authMode:mode,authEmail:'member@example.com',authPassword:'password123',pendingPackage:'119',authSubmitBusyRef:{current:false},currentOutputTrialRef:{current:true},currentOutputJobRef:{current:'job1'},authClaimRef:{current:null},walletRefreshRef:{current:{invalidate(){}}},AUTH_TOKEN_KEY:'token',WALLET_KEY:'wallet',appStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},currentWalletId:()=>storage.get('wallet'),authToken:()=>storage.get('token'),walletHeaders:()=>({'X-Wallet-Id':storage.get('wallet')}),walletScope:(...x)=>JSON.stringify(x),hasWalletBalance:()=>false,normalizedRights:x=>x,refreshWallet:async()=>({walletId:'guest'}),activatePrivateTrial(){},withDeadline,
 setAuthBusy:x=>events.push(['busy',x]),setAuthMsg:x=>events.push(['error',x]),setAccountEmail:x=>events.push(['email',x]),setWalletBalance(){},setRights(){},setQrPayment(){},setPurchaseEditing(){},setPrivateTrialActive(){},setFeatureSession(){},setFreeFeatureSession(){},setAuthOpen:x=>events.push(['auth',x]),setScreen(){},setPayBusy:x=>events.push(['payBusy',x]),setPendingPackage(){},setBuyOpen(){},setPayMsg(){},setAccountSaveNotice(){},claimAccountOutput:async()=>events.push(['claim']),startCheckout:async(...x)=>events.push(['checkout',...x]),redeemFreeLink(){},activeSavedDownloadWork:'',portraitFetch:async()=>{events.push(['request']);return{ok:true,json:async()=>({token:'member-token',walletId:'member-wallet'})}}};
 return {e,events,storage,submit:compile(e)};
}
for(const mode of ['register','login']){const f=fixture(mode);await f.submit();assert.equal(f.storage.get('token'),'member-token');assert.equal(f.storage.get('wallet'),'member-wallet');assert.deepEqual(f.events.filter(x=>x[0]==='checkout'),[['checkout','119',true]]);assert(f.events.findIndex(x=>x[0]==='claim')<f.events.findIndex(x=>x[0]==='checkout'));assert.equal(f.e.authSubmitBusyRef.current,false);console.log('PASS '+mode+' persists member session, claims output, opens selected QR once');}
{
 const f=fixture();let release;f.e.portraitFetch=async()=>{f.events.push(['request']);await new Promise(r=>release=r);return{ok:true,json:async()=>({token:'member-token',walletId:'member-wallet'})}};
 const first=f.submit();await new Promise(r=>setImmediate(r));const second=f.submit();release();await Promise.all([first,second]);assert.equal(f.events.filter(x=>x[0]==='request').length,1);assert.equal(f.events.filter(x=>x[0]==='checkout').length,1);console.log('PASS rapid duplicate auth submits create one request and one checkout');
}
{
 const f=fixture('login');f.e.portraitFetch=async()=>({ok:false,json:async()=>({message:'invalid login'})});await f.submit();assert.equal(f.storage.get('token'),undefined);assert.equal(f.events.filter(x=>x[0]==='checkout').length,0);assert(f.events.some(x=>x[0]==='error'&&x[1]==='invalid login'));assert.equal(f.e.authSubmitBusyRef.current,false);console.log('PASS invalid login remains retryable without checkout or session mutation');
}
{
 const f=fixture('login');let release;f.e.withDeadline=(operation,options)=>withDeadline(operation,{...options,timeoutMs:20});f.e.portraitFetch=async()=>({ok:true,json:()=>new Promise(r=>release=r)});await f.submit();assert.equal(f.e.authSubmitBusyRef.current,false);assert.equal(f.storage.get('token'),undefined);assert(f.events.some(x=>x[0]==='error'&&x[1].includes('ยืนยันบัญชีใช้เวลานาน')));release({token:'late-token',walletId:'late-wallet'});await new Promise(r=>setImmediate(r));assert.equal(f.storage.get('token'),undefined);console.log('PASS stalled auth response body times out, releases busy lock, ignores late session');
}
{
 const f=fixture();f.e.withDeadline=(operation,options)=>withDeadline(operation,{...options,timeoutMs:20});f.e.refreshWallet=()=>new Promise(()=>{});await f.submit();assert.equal(f.events.filter(x=>x[0]==='request').length,0);assert.equal(f.e.authSubmitBusyRef.current,false);console.log('PASS stalled pre-registration wallet read exits without creating an account');
}
console.log('6 member auth/checkout scenarios passed; mock account requests only.');
