import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walletScope} from '../src/wallet-refresh.js';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
function compile(name,env){const start=main.indexOf(' const '+name+'=async'),end=main.indexOf('\n };',start);assert(start>=0&&end>start);return new Function('env',`with(env){return ${main.slice(start,end+4).trim().replace(new RegExp('^const '+name+'='),'').replace(/;$/,'')}}`)(env)}
const start=main.indexOf(' useEffect(()=>{\n  refreshWallet().then(activatePrivateTrial);'),end=main.indexOf('\n useEffect(()=>{if(outputJobId',start);
assert(start>=0&&end>start,'actual App card-return effect exists');
const runEffect=new Function('env',`with(env){${main.slice(start,end)}}`);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let n=0;n<8;n++)await tick()}
function fixture(packageId){
 const events=[],calls=[],listeners=new Map();let token='expired-local-token',wallet='local-paid-wallet',dependencies,cleanup;
 const e={walletScope,authToken:()=>token,currentWalletId:()=>wallet,checkoutReturnRef:{current:null},currentOutputJobRef:{current:''},savedWorkOpenRequestRef:{current:0},
  location:{search:'?payment=success&session_id=cs_local_fixture',pathname:'/'},URLSearchParams,AbortController,
  document:{visibilityState:'visible',addEventListener:(name,handler)=>listeners.set('document:'+name,handler),removeEventListener:(name,handler)=>{if(listeners.get('document:'+name)===handler)listeners.delete('document:'+name)}},
  window:{addEventListener:(name,handler)=>listeners.set('window:'+name,handler),removeEventListener:(name,handler)=>{if(listeners.get('window:'+name)===handler)listeners.delete('window:'+name)}},
  history:{replaceState:()=>{e.location.search='';events.push(['history'])}},setTimeout:()=>{throw Error('terminal authentication error must wait for sign-in, not poll')},clearTimeout:()=>{},
  refreshWallet:async()=>({walletId:wallet}),activatePrivateTrial:()=>{},acceptWalletRights:data=>events.push(['rights',data]),walletHeaders:()=>({Authorization:'Bearer '+token,'X-Wallet-Id':wallet}),
  requestPromptpay:async(url,options)=>{calls.push({url,headers:options.headers});if(token==='expired-local-token')return {response:{ok:false,status:401},data:{message:'Sign in again'}};if(wallet!=='local-paid-wallet')return {response:{ok:false,status:403},data:{message:'Original account required'}};return {response:{ok:true,status:200},data:{ok:true,walletId:wallet,jobId:'local-paid-job',packageId}}},
  restorePurchaseDraft:async({jobId})=>{assert.equal(wallet,'local-paid-wallet');e.currentOutputJobRef.current=jobId;events.push(['restore',jobId]);return{jobId}},
  verifyOutputRights:async()=>({checked:true,unlocked:true,premiumHair:packageId==='159'}),analyticsPurchase:()=>events.push(['purchase']),analyticsEvent:()=>{},
  useEffect:(callback,deps)=>{if(dependencies&&deps.length===dependencies.length&&deps.every((value,index)=>value===dependencies[index]))return;cleanup?.();dependencies=deps;cleanup=callback()},
 };
 for(const name of ['setPayMsg','setBuyOpen','setPurchaseEditing','setTrialPreview','setAccountSaveNotice','setDownloadUnlockSignal'])e[name]=value=>events.push([name,value]);
 e.savePaidCheckout=compile('savePaidCheckout',e);e.recoverCheckoutReturn=compile('recoverCheckoutReturn',e);
 return {e,events,calls,listeners,render:()=>runEffect(e),login:({sameAccount=true}={})=>{token='renewed-local-token';wallet=sameAccount?'local-paid-wallet':'another-local-wallet'},cleanup:()=>cleanup?.()};
}
let passed=0;
for(const packageId of ['89','159']){
 for(const sameAccount of [true,false]){
  const f=fixture(packageId);f.render();await settle();assert.equal(f.calls.length,1);assert(f.e.location.search.includes('session_id'));assert(!f.events.some(([kind])=>kind==='setDownloadUnlockSignal'));
  f.render();await settle();assert.equal(f.calls.length,1,'ordinary state renders must not restart failed card confirmation');
  f.login({sameAccount});f.render();await settle();assert.equal(f.calls.length,2,'sign-in must resume the pending card return without a focus event');
  if(sameAccount){assert.equal(f.events.filter(([kind])=>kind==='setDownloadUnlockSignal').length,1);assert.equal(f.e.location.search,'');assert.equal(f.e.currentOutputJobRef.current,'local-paid-job');assert.equal(f.e.checkoutReturnRef.current,null)}
  else{assert.equal(f.events.filter(([kind])=>kind==='setDownloadUnlockSignal').length,0);assert(f.e.location.search.includes('session_id'));assert.equal(f.e.currentOutputJobRef.current,'')}
  assert.equal(f.listeners.size,4,'account changes replace the return listeners instead of accumulating handlers');f.cleanup();assert.equal(f.listeners.size,0);
  passed++;console.log('PASS '+packageId+' card return '+(sameAccount?'resumes after login to the paid account':'keeps recovery pending after login to another account'));
 }
}
console.log(`${passed} card-return authentication scenarios passed; actual App effect/confirmation functions, inert local fixtures, no focus events or provider requests.`);
