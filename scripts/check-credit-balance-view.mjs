import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWalletRefresh,hasWalletBalance,walletScope} from '../src/wallet-refresh.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),dialog=await readFile(new URL('../src/studio-rights-dialog.jsx',import.meta.url),'utf8');
const props=main.slice(main.indexOf('<StudioRightsDialog '),main.indexOf('/>',main.indexOf('<StudioRightsDialog ')));
assert(!/\brefresh=/.test(props),'production dialog must not join the rich wallet refresh');
const effectStart=dialog.indexOf(' useEffect(()=>{let cancelled=false;')+' useEffect('.length,effectEnd=dialog.indexOf(',[revision,accountScope]);',effectStart),effectCode=dialog.slice(effectStart,effectEnd);
assert(effectStart>=0&&effectEnd>effectStart);
const compileEffect=env=>new Function('env',`with(env){return ${effectCode}}`)(env);
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let count=0;
const test=async(name,run)=>{await run();count++;console.log('PASS: '+name)};
function fixture(initialData=null){
 const calls=[],updates=[];let data=null,loading=false,error='';
 const env={hasWalletBalance,initialData,callbacks:{current:{initialData,headers:()=>({Authorization:'Bearer fixture','X-Wallet-Id':'member-wallet'}),refresh:null,request:(url,options,timeout)=>{const result=deferred();calls.push({url,options,timeout,...result});return result.promise},onRights:next=>updates.push(next)}},setData:next=>{data=next},setLoading:next=>{loading=next},setError:next=>{error=next}};
 return {env,calls,updates,state:()=>({data,loading,error}),start:()=>compileEffect(env)()};
}
const fresh={walletId:'member-wallet',processRemaining:5,generationRemaining:5,hairRemaining:5,trialAvailable:true,trialRemaining:1};
await test('a blocked rich refresh does not hold the credit-view read',async()=>{
 const rich=createWalletRefresh({session:()=>({token:'fixture',walletId:'member-wallet'}),headers:()=>({}),request:()=>new Promise(()=>{})});
 // This promise intentionally never resolves; the view uses its own request.
 void rich.load().catch(()=>{});await tick();
 const f=fixture(),cleanup=f.start();assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'/api/wallet/balance');assert.equal(f.calls[0].timeout,8000);assert.equal(f.state().loading,true);
 f.calls[0].resolve(response(fresh));await tick();assert.equal(f.state().data.processRemaining,5);assert.equal(f.state().loading,false);assert.deepEqual(f.updates,[fresh]);cleanup();
});
await test('known balance remains visible and retryable if the light read fails',async()=>{
 const f=fixture(fresh),cleanup=f.start();assert.equal(f.state().data.processRemaining,5);f.calls[0].reject(Error('temporary balance timeout'));await tick();assert.equal(f.state().data.processRemaining,5);assert.equal(f.state().loading,false);assert(f.state().error.includes('timeout'));assert.equal(f.updates.length,0);cleanup();
});
await test('unknown, malformed, or failed balance never grants a fabricated zero or rights',async()=>{
 for(const data of [{walletId:'member-wallet',processRemaining:false},{walletId:'member-wallet',processRemaining:''},{message:'storage unavailable'}]){
  const f=fixture(),cleanup=f.start();f.calls[0].resolve(response(data));await tick();assert.equal(f.state().data,null);assert.equal(f.updates.length,0);assert(f.state().error);cleanup();
 }
});
await test('closing or switching account discards a delayed view response',async()=>{
 const f=fixture(),cleanup=f.start();cleanup();f.calls[0].resolve(response(fresh));await tick();assert.equal(f.updates.length,0);assert.equal(f.state().data,null);
});
await test('a late direct read cannot overwrite a newer payment or usage balance',async()=>{
 for(const currentBalance of [10,1]){
  const original={...fresh,processRemaining:3,generationRemaining:3},f=fixture(original),cleanup=f.start();
  const authoritative={...fresh,processRemaining:currentBalance,generationRemaining:currentBalance};
  // This is the callback ref updated by the component on a parent rerender;
  // its existing initialData-sync effect adopts the authoritative snapshot.
  f.env.callbacks.current.initialData=authoritative;f.env.setData(authoritative);
  f.calls[0].resolve(response(original));await tick();assert.equal(f.state().data.processRemaining,currentBalance);assert.equal(f.updates.length,0);assert.equal(f.state().error,'');assert.equal(f.calls.length,1);cleanup();
 }
});
await test('a stale read error cannot obscure a newer authoritative balance',async()=>{
 const f=fixture({...fresh,processRemaining:3}),cleanup=f.start();f.env.callbacks.current.initialData=fresh;f.env.setData(fresh);f.calls[0].reject(Error('old read timeout'));await tick();assert.equal(f.state().data.processRemaining,5);assert.equal(f.state().error,'');assert.equal(f.updates.length,0);cleanup();
});
await test('count-only view updates preserve existing paid-image permissions',async()=>{
 const normalizeStart=main.indexOf('function normalizedRights('),normalizeEnd=main.indexOf('\n',normalizeStart),normalizedRights=new Function(main.slice(normalizeStart,normalizeEnd)+';return normalizedRights')();
 const acceptStart=main.indexOf(' const acceptWalletRights=data=>{'),acceptEnd=main.indexOf('\n };',acceptStart)+4,acceptCode=main.slice(acceptStart,acceptEnd).trim().replace(/^const acceptWalletRights=/,'').replace(/;$/,'');
 let rights={generationRemaining:2,hairRemaining:2,unlockedJobIds:['paid-image'],editableJobIds:['editable-image']},snapshot={scope:walletScope('fixture','member-wallet'),data:null},invalidations=0;
 const env={walletScope,hasWalletBalance,authToken:()=> 'fixture',currentWalletId:()=> 'member-wallet',walletRefreshRef:{current:{invalidate:()=>invalidations++}},normalizedRights,setWalletBalance:change=>{snapshot=change(snapshot)},setRights:change=>{rights=change(rights)}};
 const accept=new Function('env',`with(env){return ${acceptCode}}`)(env);accept(fresh);
 assert.equal(rights.generationRemaining,5);assert.deepEqual(rights.unlockedJobIds,['paid-image']);assert.deepEqual(rights.editableJobIds,['editable-image']);assert.equal(rights.trialRemaining,1);assert.equal(invalidations,1);
 accept({...fresh,walletId:'other-wallet',processRemaining:100});assert.equal(rights.generationRemaining,5);assert.equal(invalidations,1);
});
console.log(`PASS: ${count} independent balance-view scenarios; all transports mocked.`);
