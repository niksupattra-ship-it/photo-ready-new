import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hasWalletBalance,walletScope} from '../src/wallet-refresh.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
function extract(source,start,end,name,env){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,name);return new Function('env','with(env){'+source.slice(a,b)+';return '+name+'}')(env)}
const tick=()=>new Promise(r=>setImmediate(r)),deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
let count=0;async function test(name,run){await run();count++;console.log('PASS: '+name)}
const eligible=(credits=2,trial=2,purchased=true)=>({walletId:'wallet',processRemaining:credits,generationRemaining:credits,hairRemaining:credits,hasPurchased:purchased,trialRemaining:trial,trialAvailable:trial>0});
function fixture(data=eligible(),{token='session',wallet='wallet',answer=false,request}={}){
 const identity={token,wallet},calls={refresh:0,read:[],accepted:[],prompts:[]};
 const env={privateTrialActive:false,trialChoiceResolve:{current:null},authToken:()=>identity.token,currentWalletId:()=>identity.wallet,walletScope,hasWalletBalance,walletHeaders:()=>({Authorization:identity.token,'X-Wallet-Id':identity.wallet}),refreshWallet:async options=>{calls.refresh++;assert.equal(options.throwOnError,true);identity.wallet='wallet'},portraitFetch:async(url,options,timeout)=>{calls.read.push({url,options,timeout});return request?request():response(data)},fetch:()=>{throw Error('unbounded fetch must not run')},acceptWalletRights:next=>calls.accepted.push(next),acceptedPaidTrial:true,setTrialChoice:value=>{calls.prompts.push(value);queueMicrotask(()=>{env.acceptedPaidTrial=answer;env.trialChoiceResolve.current?.(answer);env.trialChoiceResolve.current=null})}};
 return {identity,calls,env,run:extract(main,' const beforeProcess=async()=>{',' const TrialChoiceUI=','beforeProcess',env)};
}
// e25e029 already permits unlimited generation. Balances authorize downloads,
// so processing only requires a usable wallet and must not spend/read credits.
await test('existing paid, trial and exhausted wallets start free generation without balance reads or prompts',async()=>{
 for(const data of [eligible(),eligible(0,2,false),eligible(0,1,true),eligible(0,0,true)]){const f=fixture(data);f.env.refreshWallet=()=>{throw Error('existing wallet must not refresh')};assert.equal(await f.run(),true);assert.equal(f.calls.read.length,0);assert.equal(f.calls.prompts.length,0);assert.equal(f.calls.accepted.length,0);}
});
await test('missing guest and member wallet ids load the current wallet before generation',async()=>{
 for(const token of ['', 'session']){const f=fixture(eligible(),{token,wallet:''});assert.equal(await f.run(),true);assert.equal(f.calls.refresh,1);assert.equal(f.calls.read.length,0);assert.equal(f.calls.prompts.length,0);}
});
await test('a failed wallet bootstrap cannot authorize processing or open checkout',async()=>{
 const f=fixture(eligible(),{token:'',wallet:''});f.env.refreshWallet=async options=>{assert.equal(options.throwOnError,true);throw Error('wallet unavailable')};await assert.rejects(f.run(),/wallet unavailable/);assert.equal(f.calls.read.length,0);assert.equal(f.calls.accepted.length,0);assert.equal(f.calls.prompts.length,0);
});
await test('a bootstrap that still has no wallet returns false without fabricating identity',async()=>{
 const f=fixture(eligible(),{token:'',wallet:''});f.env.refreshWallet=async()=>{f.calls.refresh++};assert.equal(await f.run(),false);assert.equal(f.calls.refresh,1);assert.equal(f.identity.wallet,'');assert.equal(f.calls.prompts.length,0);
});
await test('free generation never reads malformed or unavailable download balances',async()=>{
 for(const data of [eligible(-1),{...eligible(),processRemaining:false},{...eligible(),walletId:'other-wallet'}]){const f=fixture(data,{request:async()=>{throw Error('download balance unavailable')}});assert.equal(await f.run(),true);assert.equal(f.calls.read.length,0);assert.equal(f.calls.accepted.length,0);}
});
await test('private preview also requires a usable wallet and has no credit or trial-choice gate',async()=>{
 const f=fixture();f.env.privateTrialActive=true;f.env.trialChoiceResolve.current=()=>{throw Error('obsolete trial choice must not be invoked')};assert.equal(await f.run(),true);assert.equal(f.calls.read.length,0);assert.equal(f.calls.prompts.length,0);
});
function editorFixture(onBeforeProcess){
 const freeHairFixture={isFreeFemaleHair,showFreeHairNotice:()=>{throw Error('paid fixture must not use the free-hair guard')}};
 const events=[],env={setCheckingCredits:v=>events.push(['checking',v]),setAssetBusy:v=>events.push(['assetBusy',v]),setStatus:v=>events.push(['status',v]),onBeforeProcess,processRequestRef:{current:false},sourcePhoto:{idpromFemaleEyeStyle:'makeup'},processActive:false,assetBusy:false,ready:true,onProcessPhoto:async()=>{events.push(['AI']);return {layer:{source:'output',jobId:'fixture',femaleEyeStyle:'makeup'},placement:{}}},state:{current:[{id:'source',kind:'source-photo'}]},sourceLayerRef:{current:'source'},pendingHairProcessRef:{current:{hairId:'hair-01',portraitMode:'female'}},portraitMode:'female',setPortraitProcessError:v=>events.push(['error',v]),mounted:{current:true},setProcessHairPending:()=>{},setPicker:()=>{},setHairNotice:()=>{},historySnapshot:()=>[{id:'source',kind:'source-photo'}],layerKind:l=>l.kind,touch:false,setHairConfirmed:()=>{},setProcessingPhoto:v=>events.push(['processing',v]),placementRef:{current:{}},isProcessCancelled:()=>false,fresh:v=>v,portraitFinishChoice:()=> 'makeup',hydrate:async()=>true,onFinishProcess:async()=>{},sessionUnlockedJobs:{current:new Set()},hairStyleMemory:{current:{clear(){}}},youcamHairMemory:{current:{clear(){}}},undo:{current:[]},redo:{current:[]},resetPhotoHistory:()=>{},resetBrushSession:()=>{},setTool:()=>{},setSelected:()=>{},setRevision:()=>{},setSelectedHair:()=>{},trackPhotoType:()=>{},reportProcessedResult:()=>{}};
 Object.assign(env,freeHairFixture);
 env.checkProcessCredits=extract(editor,' const checkProcessCredits=async()=>{','\n const processPhoto=','checkProcessCredits',env);
 const run=extract(editor,' const processPhoto=async(options={})=>{','\n useEffect','processPhoto',env);return {events,env,run};
}
await test('actual Studio handler waits for wallet readiness and starts AI once after it succeeds',async()=>{const gate=deferred(),f=editorFixture(()=>gate.promise),pending=f.run();await tick();assert.equal(f.env.processRequestRef.current,true);assert(f.events.some(e=>e[0]==='checking'&&e[1]===true));assert(f.events.some(e=>e[0]==='assetBusy'&&e[1]===true));assert(!f.events.some(e=>e[0]==='AI'));await f.run();gate.resolve(true);await pending;assert.equal(f.events.filter(e=>e[0]==='AI').length,1);assert.equal(f.env.processRequestRef.current,false);assert(f.events.some(e=>e[0]==='checking'&&e[1]===false));assert(f.events.some(e=>e[0]==='assetBusy'&&e[1]===false))});
await test('actual Studio handler releases pending state and displays a failed wallet-readiness check',async()=>{for(const outcome of ['deny','offline']){const f=editorFixture(async()=>{if(outcome==='offline')throw Error('credit fixture offline');return false});await f.run();assert.equal(f.env.processRequestRef.current,false);assert(!f.events.some(e=>e[0]==='AI'));assert(f.events.some(e=>e[0]==='checking'&&e[1]===false));assert(f.events.some(e=>e[0]==='assetBusy'&&e[1]===false));if(outcome==='offline')assert(f.events.some(e=>e[0]==='error'&&e[1]==='credit fixture offline'))}});
await test('wallet-readiness status stays inline while portrait and hairstyle handlers share the gate',async()=>{assert(editor.includes("{checkingCredits?'กำลังเตรียมประมวลผล…':status}"));assert(!editor.includes('{checkingCredits&&<div className="studio-processing-overlay'));const hairStart=editor.indexOf(' const applyHair=async'),hairEnd=editor.indexOf('\n const ',hairStart+8),hair=editor.slice(hairStart,hairEnd);assert(hair.includes('await checkProcessCredits()'));assert(hair.includes('if(!mounted.current)'))});
console.log(`PASS: ${count} free-generation wallet-readiness scenarios; all requests and AI mocked.`);
