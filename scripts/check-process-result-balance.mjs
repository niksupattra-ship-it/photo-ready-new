import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Exercise the actual receipt read/update functions with mocked transport and saves.
// No customer data, wallet mutation, paid AI, or production network calls.
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const component=await readFile(new URL('../src/process-result-notice.jsx',import.meta.url),'utf8');
function extract(source,start,end,name,env){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return new Function('env',`with(env){${source.slice(a,b).replace(/^export /,'')};return ${name}}`)(env)}
const processResultKind=extract(component,'export function processResultKind(','export function ProcessResultNotice','processResultKind',{});
let count=0;const results=[];
const test=async(name,fn)=>{await fn();count++;results.push({name,passed:true});console.log('PASS: '+name)};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function readFixture({data={walletId:'w',processRemaining:4,trialRemaining:1},status=200,fetchGate,jsonGate}={}){
 const identity={token:'token',wallet:'w'},requests=[];
 const env={authToken:()=>identity.token,currentWalletId:()=>identity.wallet,walletScope:(token,wallet)=>JSON.stringify([token,wallet]),walletHeaders:()=>({'X-Wallet-Id':identity.wallet,Authorization:identity.token}),hasWalletBalance:data=>{const n=data?.processRemaining??data?.generationRemaining;return (typeof n==='number'||typeof n==='string'&&n.trim()!=='')&&Number.isFinite(Number(n))&&Number(n)>=0},portraitFetch:async(url,options,timeout)=>{requests.push({url,options,timeout});if(fetchGate)await fetchGate.promise;return {ok:status>=200&&status<300,json:async()=>{if(jsonGate)await jsonGate.promise;return data}}}};
 return {identity,requests,read:extract(main,' const readProcessResultBalance=async()=>{',' const beforeProcess=','readProcessResultBalance',env)};
}
function receiptFixture({kind='paid',balance,saveGate}={}){
 const state={receipt:null,saves:0,reads:0};const env={processResultKind,trialUnlocked:kind==='preview',receiptRequestRef:{current:0},mounted:{current:true},lastSaveErrorRef:{current:null},onSaveWork:()=>{},setProcessReceipt:value=>{state.receipt=typeof value==='function'?value(state.receipt):value},onReadProcessBalance:async()=>{state.reads++;return balance?await balance.promise:{processRemaining:4,trialRemaining:1}},save:async opts=>{state.saves++;assert.equal(opts.auto,true);assert.equal(opts.showPopup,false);assert.equal(opts.background,true);if(saveGate)await saveGate.promise;return true}};
 const report=extract(studio,' const reportProcessedResult=',' const retryReceiptSave=','reportProcessedResult',env);
 return {state,env,report:(jobId='job')=>report({jobId,restrictedTrial:kind==='trial'},{reused:kind==='reused'})};
}
await test('post-delivery read uses one bounded read-only request and returns validated zero/numeric string counts',async()=>{const f=readFixture({data:{walletId:'w',generationRemaining:'0',trialRemaining:'1'}});assert.deepEqual(await f.read(),{processRemaining:0,trialRemaining:1});assert.deepEqual(f.requests,[{url:'/api/wallet/balance',options:{headers:{'X-Wallet-Id':'w',Authorization:'token'},cache:'no-store'},timeout:8000}])});
await test('unknown identity cannot read or fabricate a balance',async()=>{const f=readFixture();f.identity.wallet='';await assert.rejects(f.read());assert.equal(f.requests.length,0)});
await test('failed, wrong-wallet and malformed balances never return usable numbers',async()=>{
 const cases=[{status:503},{data:{walletId:'other',processRemaining:4,trialRemaining:1}},...[-1,1.2,'',null,false,NaN,Infinity].flatMap(value=>[{data:{walletId:'w',processRemaining:value,trialRemaining:1}},{data:{walletId:'w',processRemaining:4,trialRemaining:value}}])];
 for(const c of cases)await assert.rejects(readFixture(c).read());
});
await test('account changes during transport or JSON parsing discard the old response',async()=>{
 for(const step of ['fetchGate','jsonGate']){const gate=deferred(),f=readFixture({[step]:gate}),task=f.read();await tick();f.identity.token='new-token';f.identity.wallet='new-wallet';gate.resolve();await assert.rejects(task,/บัญชีเปลี่ยนแล้ว/)}
});
await test('paid success shows balance loading immediately while existing autosave completes independently',async()=>{
 const balance=deferred(),f=receiptFixture({balance});f.report();assert.equal(f.state.receipt.balanceState,'loading');assert.equal(f.state.receipt.remaining,null);await tick();assert.equal(f.state.saves,1);assert.equal(f.state.reads,1);assert.equal(f.state.receipt.saveState,'saved');assert.equal(f.state.receipt.balanceState,'loading');balance.resolve({processRemaining:3,trialRemaining:1});await tick();assert.equal(f.state.receipt.balanceState,'ready');assert.equal(f.state.receipt.remaining,3);assert.equal(f.state.receipt.saveState,'saved');
});
await test('trial receipt uses the trial quota without auto-saving or mixing paid credits',async()=>{const f=receiptFixture({kind:'trial'});f.report();await tick();assert.equal(f.state.saves,0);assert.equal(f.state.reads,1);assert.equal(f.state.receipt.kind,'trial');assert.equal(f.state.receipt.remaining,1)});
await test('private preview and reused images do not read or consume paid credits',async()=>{for(const kind of ['preview','reused']){const f=receiptFixture({kind});f.report();await tick();assert.equal(f.state.saves,0);assert.equal(f.state.reads,0);if(kind==='reused')assert.equal(f.state.receipt,null);else assert.equal(f.state.receipt.remaining,null)}});
await test('a failed balance read leaves delivered image/save state intact and never fabricates zero',async()=>{const balance=deferred(),f=receiptFixture({balance});f.report();await tick();balance.reject(Error('network'));await tick();assert.equal(f.state.receipt.balanceState,'error');assert.equal(f.state.receipt.remaining,null);assert.equal(f.state.receipt.saveState,'saved');assert.equal(f.state.saves,1)});
await test('a stale or closed receipt cannot receive an old balance or re-open itself',async()=>{
 for(const scenario of ['new','closed','unmounted']){const balance=deferred(),f=receiptFixture({balance});f.report('old');await tick();if(scenario==='new'){f.env.receiptRequestRef.current++;f.state.receipt={request:2,jobId:'new',kind:'paid',balanceState:'loading',remaining:null}}else if(scenario==='closed')f.state.receipt=null;else f.env.mounted.current=false;const before=f.state.receipt;balance.resolve({processRemaining:2,trialRemaining:1});await tick();assert.equal(f.state.receipt,before)}
});
assert(studio.includes('remaining={processReceipt.remaining}'),'receipt must not fall back to pre-use prop');
assert(main.includes('onReadProcessBalance={readProcessResultBalance}'));
console.log(`PASS: ${count} success receipt balance scenarios`);
