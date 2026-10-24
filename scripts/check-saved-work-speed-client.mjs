import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {packSavedProjectTransfer,unpackSavedProjectTransfer,getSavedWorkRequestSize} from '../src/saved-work-transfer.js';
import {encodeSavedWorkRequest} from '../src/saved-work-request.js';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const saveCode=main.slice(main.indexOf(' const saveAccountWork='),main.indexOf(' const savedWorkOpenRequestRef='));
const openCode=main.slice(main.indexOf(' const openAccountWork=async'),main.indexOf(' const paidSaveInFlightRef='));
assert(saveCode.startsWith(' const saveAccountWork='));assert(openCode.startsWith(' const openAccountWork=async'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const cases=[];
const check=async(name,run)=>{await run();cases.push(name);console.log('PASS '+name)};
const image='data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:4,background:'#7c9db2'}}).png().toBuffer()).toString('base64');
const mask='data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:4,background:'#ffffff'}}).png().toBuffer()).toString('base64');
const largeImage='data:image/png;base64,'+'ABCD'.repeat(1600);
const head={id:'head_A',kind:'head',name:'หัว · คอ · ผม',jobId:'job_A',source:image,processedOriginalSource:image,mask,x:5,y:-7,scale:1.2,rotation:4,opacity:.9,visible:true,sourceFrame:{x:0,y:0,w:900,h:1200},portraitMode:'female',femaleEyeStyle:'makeup'};
const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[head],compareSource:image,placement:{W:2256,H:3072,uX:0,uY:900,uW:2256,uH:2172},custom:{text:'งานภาษาไทย 🌷',number:45}};
const wireProject={...project,layers:[{...head,source:largeImage,processedOriginalSource:largeImage,makeupBaseSource:largeImage,makeupFullSource:largeImage,eraseRestoreSource:largeImage}],compareSource:largeImage};
const success=id=>({ok:true,status:200,json:async()=>({id})});
async function readRequest(options){
 let bytes=typeof options.body==='string'?Buffer.from(options.body):Buffer.from(await options.body.arrayBuffer());
 if(options.headers['Content-Encoding']==='gzip')bytes=gunzipSync(bytes);
 return JSON.parse(bytes.toString('utf8'));
}
function makeSave({encoder=encodeSavedWorkRequest,response=()=>success('work_A')}={}){
 const state={wallet:'wallet_A',scope:1},requests=[],events=[];
 const env={packSavedProjectTransfer,getSavedWorkRequestSize,encodeSavedWorkRequest:encoder,Blob,
  workSaveQueueRef:{current:Promise.resolve()},savedWorkIdRef:{current:''},savedWorkOpenRequestRef:{current:1},
  currentWalletId:()=>state.wallet,walletHeaders:()=>({Authorization:'Bearer '+state.wallet,'X-Wallet-Id':state.wallet}),setSavedWorksOpen:value=>events.push(['showWorks',value]),
  portraitFetch:async(url,options)=>{assert.equal(url,'/api/saved-work');const request=await readRequest(options);requests.push({request,headers:options.headers});return response(requests.length,request)}
 };
 const save=new Function('env','with(env){'+saveCode+';return saveAccountWork}')(env);
 return {state,env,save,requests,events};
}
function makeOpen(){
 const state={wallet:'wallet_A',token:'token_A'},refresh=deferred(),prepare=deferred(),calls=[],sets=[];
 const env={savedWorkLoadRequestRef:{current:0},savedWorkOpenRequestRef:{current:1},authToken:()=>state.token,
  walletHeaders:()=>({Authorization:'Bearer '+state.token,'X-Wallet-Id':state.wallet}),currentWalletId:()=>state.wallet,
  decodedStudioImage:()=>{},refreshWallet:()=>{calls.push('refresh');return refresh.promise},
  prepareSavedProject:(value,options)=>{calls.push('prepare');assert.equal(value,project);assert.equal(options.decode,env.decodedStudioImage);env.preparationSignal=options.signal;return prepare.promise},
  portraitFinishChoice:(a,b)=>a||b,
  firstUploadedPhotoRef:{current:'previous-person'},editCache:{current:'previous-cache'},initialFemaleMakeupRef:{current:'previous-makeup'},
  initialProcessedMasterRef:{current:'previous-master'},hairResultCacheRef:{current:new Map([['previous-hair',true]])}
 };
 for(const key of ['preparedHairBaseRef','lastHairDonorRef','cleanHairBaseRef','initialStyledHairRef','liveAdjustRef','liveCollarWarpRef','liveCollarHeightRef','liveNeckAdjustRef','currentOutputJobRef','currentOutputTrialRef','studioTrialRef','studioOriginRef','savedWorkIdRef'])env[key]={current:'previous'};
 for(const name of ['setOutputJobId','setTrialPreview','setHairId','setF','setRestoredSourcePhoto','setAccountSaveNotice','setSavedWorkUnlocked','setPurchaseEditing','setSessionEditJob','setStudioData','setSavedWorkRevision','setScreen'])env[name]=value=>sets.push([name,value]);
 const restored={source:{name:'restored-original'},editCache:{master:'lossless-native-master'},head};
 const work={id:'work_A',unlocked:true,project};
 const open=new Function('env','with(env){'+openCode+';return openAccountWork}')(env);
 return {state,env,open,work,restored,refresh,prepare,calls,sets};
}
function unchanged(t){assert.equal(t.env.firstUploadedPhotoRef.current,'previous-person');assert.equal(t.env.editCache.current,'previous-cache');assert.equal(t.env.hairResultCacheRef.current.size,1);assert.equal(t.env.savedWorkIdRef.current,'previous');assert.equal(t.sets.length,0)}
function committed(t){assert.equal(t.env.firstUploadedPhotoRef.current,t.restored.source);assert.equal(t.env.editCache.current,t.restored.editCache);assert.equal(t.env.hairResultCacheRef.current.size,0);assert.equal(t.env.savedWorkIdRef.current,'work_A');assert(t.sets.some(([name,value])=>name==='setStudioData'&&value===project.layers));assert(t.sets.some(([name,value])=>name==='setScreen'&&value==='studio'))}

await check('save sends lossless shared image resources and exact project metadata',async()=>{
 const t=makeSave();await t.save(wireProject);assert.equal(t.requests.length,1);
 assert.equal(t.requests[0].request.project.format,'idprom-project-transfer');
 assert.deepEqual(unpackSavedProjectTransfer(t.requests[0].request.project),wireProject);assert.equal(t.env.savedWorkIdRef.current,'work_A');
});
await check('small unique-image projects keep the compatible original JSON shape',async()=>{
 const unique={...project,compareSource:null,layers:[{...head,processedOriginalSource:undefined}]};const t=makeSave();await t.save(unique);
 assert.equal(t.requests[0].request.project.format,'idprom-studio');assert.deepEqual(t.requests[0].request.project,JSON.parse(JSON.stringify(unique)));
});
await check('actual gzip request bytes decode to unchanged native image strings and metadata',async()=>{
 const t=makeSave(),large={...wireProject,notes:'ภาษาไทย 🌷 '.repeat(30000)};await t.save(large);
 assert.equal(t.requests[0].headers['Content-Encoding'],'gzip');assert.deepEqual(unpackSavedProjectTransfer(t.requests[0].request.project),large);
});
for(const change of ['wallet','work scope'])await check('no request starts before encoding, and changed '+change+' prevents a save',async()=>{
 const gate=deferred();let entered=false;const t=makeSave({encoder:async body=>{entered=true;await gate.promise;return{body,headers:{}}}});
 const pending=t.save(wireProject);await tick();assert(entered);assert.equal(t.requests.length,0);
 if(change==='wallet')t.state.wallet='wallet_B';else t.env.savedWorkOpenRequestRef.current++;
 gate.resolve();await assert.rejects(pending,/บัญชีหรืองานเปลี่ยน/);assert.equal(t.requests.length,0);assert.equal(t.env.savedWorkIdRef.current,'');
});
await check('an encoder failure does not start or retry a write',async()=>{
 const t=makeSave({encoder:async()=>{throw Error('encoder failure')}});await assert.rejects(t.save(project),/encoder failure/);assert.equal(t.requests.length,0);
});
await check('concurrent queued saves share the first confirmed work id instead of creating duplicates',async()=>{
 const gate=deferred();let first=true;const t=makeSave({encoder:async body=>{if(first){first=false;await gate.promise}return{body,headers:{}}}});
 const a=t.save(project),b=t.save(project);await tick();assert.equal(t.requests.length,0);gate.resolve();await Promise.all([a,b]);
 assert.deepEqual(t.requests.map(x=>x.request.id),['','work_A']);
});
await check('a confirmed missing work keeps the original create-replacement recovery',async()=>{
 const t=makeSave({response:n=>n===1?{ok:false,status:404,json:async()=>({message:'missing'})}:success('work_replacement')});t.env.savedWorkIdRef.current='work_deleted';
 await t.save(wireProject);assert.deepEqual(t.requests.map(x=>x.request.id),['work_deleted','']);for(const x of t.requests)assert.deepEqual(unpackSavedProjectTransfer(x.request.project),wireProject);assert.equal(t.env.savedWorkIdRef.current,'work_replacement');
});
await check('expired work never retries as a new project or resets the active id',async()=>{
 const t=makeSave({response:()=>({ok:false,status:410,json:async()=>({error:'saved_work_expired',message:'expired'})})});t.env.savedWorkIdRef.current='work_expired';
 await assert.rejects(t.save(project),e=>e.code==='saved_work_expired');assert.equal(t.requests.length,1);assert.equal(t.env.savedWorkIdRef.current,'work_expired');
});
await check('unknown network/write outcomes are never retried',async()=>{
 const t=makeSave({response:()=>{throw Error('unknown network outcome')}});await assert.rejects(t.save(project),/unknown network/);assert.equal(t.requests.length,1);assert.equal(t.env.savedWorkIdRef.current,'');
});
await check('an unconfirmed success response cannot assign a saved work id',async()=>{
 const t=makeSave({response:()=>({ok:true,status:200,json:async()=>({})})});await assert.rejects(t.save(project),/ยังไม่ยืนยัน/);assert.equal(t.requests.length,1);assert.equal(t.env.savedWorkIdRef.current,'');
});
await check('a late save response after changing account does not replace the current work id',async()=>{
 const gate=deferred();const t=makeSave({response:()=>gate.promise});const pending=t.save(project);await tick();assert.equal(t.requests.length,1);t.state.wallet='wallet_B';t.env.savedWorkIdRef.current='work_B';gate.resolve(success('work_A'));await pending;assert.equal(t.env.savedWorkIdRef.current,'work_B');
});
await check('the expanded 64-MiB limit applies before any compact write',async()=>{
 const huge='data:image/png;base64,'+'A'.repeat(400000),fields=['source','processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'];
 const dense={...project,layers:Array.from({length:20},(_,i)=>({...head,id:'head_'+i,...Object.fromEntries(fields.map(k=>[k,huge]))}))};
 const t=makeSave();await assert.rejects(t.save(dense),e=>e.code==='saved_work_too_large');assert.equal(t.requests.length,0);
});

await check('open starts wallet refresh and shared-cache decode together, then waits for both',async()=>{
 const t=makeOpen(),pending=t.open(t.work);assert.deepEqual(t.calls,['refresh','prepare']);unchanged(t);
 t.prepare.resolve(t.restored);await tick();unchanged(t);t.refresh.resolve();await pending;committed(t);
});
await check('wallet-first open waits for decoding before committing editable native layers',async()=>{
 const t=makeOpen(),pending=t.open(t.work);t.refresh.resolve();await tick();unchanged(t);t.prepare.resolve(t.restored);await pending;committed(t);
});
await check('wallet refresh failure cancels preparation and leaves the current work untouched',async()=>{
 const t=makeOpen(),pending=t.open(t.work);t.refresh.reject(Error('wallet failure'));await assert.rejects(pending,/wallet failure/);assert(t.env.preparationSignal.aborted);t.prepare.resolve(t.restored);await tick();unchanged(t);
});
await check('corrupt/decode failure cancels preparation and never commits a partial project',async()=>{
 const t=makeOpen(),pending=t.open(t.work);t.prepare.reject(Error('corrupt image'));await assert.rejects(pending,/corrupt image/);assert(t.env.preparationSignal.aborted);t.refresh.resolve();await tick();unchanged(t);
});
await check('an already-aborted open starts neither refresh nor preparation',async()=>{
 const t=makeOpen(),controller=new AbortController();controller.abort();await assert.rejects(t.open(t.work,{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(t.calls.length,0);unchanged(t);
});
await check('cancelling an in-flight open aborts preparation without applying old pixels',async()=>{
 const t=makeOpen(),controller=new AbortController(),pending=t.open(t.work,{signal:controller.signal});controller.abort();assert(t.env.preparationSignal.aborted);t.refresh.resolve();t.prepare.resolve(t.restored);await assert.rejects(pending,e=>e.name==='AbortError');unchanged(t);
});
for(const field of ['wallet','token','work scope'])await check('changing '+field+' after wallet refresh invalidates a pending open',async()=>{
 const t=makeOpen(),pending=t.open(t.work);t.refresh.resolve();await tick();
 if(field==='wallet')t.state.wallet='wallet_B';else if(field==='token')t.state.token='token_B';else t.env.savedWorkOpenRequestRef.current++;
 t.prepare.resolve(t.restored);await assert.rejects(pending,/บัญชีหรืองานเปลี่ยน/);unchanged(t);
});
await check('the caller account scope is rechecked before committing a restored work',async()=>{
 const t=makeOpen(),accountScope=JSON.stringify(['Bearer token_A','wallet_A']),pending=t.open(t.work,{accountScope});t.state.wallet='wallet_B';t.refresh.resolve();t.prepare.resolve(t.restored);await assert.rejects(pending,/บัญชีหรืองานเปลี่ยน/);unchanged(t);
});
await check('a newer open request prevents an older decoded project from replacing it',async()=>{
 const t=makeOpen(),pending=t.open(t.work);t.env.savedWorkLoadRequestRef.current++;t.refresh.resolve();t.prepare.resolve(t.restored);await assert.rejects(pending,/บัญชีหรืองานเปลี่ยน/);unchanged(t);
});

await check('native request compression is lossless and never performs a request itself',async()=>{
 const json=JSON.stringify({text:'ภาษาไทย 🌷 '.repeat(30000)}),before=globalThis.fetch;let fetches=0;
 globalThis.fetch=()=>{fetches++;throw Error('encoder must not fetch')};
 try{const result=await encodeSavedWorkRequest(json);assert.equal(result.headers['Content-Encoding'],'gzip');assert.equal(gunzipSync(Buffer.from(await result.body.arrayBuffer())).toString('utf8'),json);assert.equal(fetches,0)}finally{globalThis.fetch=before}
});
for(const mode of ['missing','throwing','passthrough','timeout'])await check('request compression '+mode+' safely falls back to identical JSON',async()=>{
 const json=JSON.stringify({text:'fallback '.repeat(30000)}),original=globalThis.CompressionStream;
 try{
  if(mode==='missing')globalThis.CompressionStream=undefined;
  if(mode==='throwing')globalThis.CompressionStream=class{constructor(){throw Error('unsupported')}};
  if(mode==='passthrough')globalThis.CompressionStream=class{constructor(){return new TransformStream()}};
  if(mode==='timeout')globalThis.CompressionStream=class{constructor(){return new TransformStream({transform(){return new Promise(()=>{})}})}};
  const result=await encodeSavedWorkRequest(json,{timeoutMs:20});assert.equal(result.body,json);assert.deepEqual(result.headers,{});
 }finally{globalThis.CompressionStream=original}
});
await check('small request bodies keep the original JSON without compression overhead',async()=>{
 const json=JSON.stringify({small:true}),result=await encodeSavedWorkRequest(json);assert.equal(result.body,json);assert.deepEqual(result.headers,{});
});

const report={passed:cases.length,cases,scope:'Actual main save/open handlers plus actual lossless codec and request encoder; local fixtures only; no database, customer, payment or AI calls'};
if(process.env.SAVED_WORK_SPEED_CLIENT_REPORT)await writeFile(process.env.SAVED_WORK_SPEED_CLIENT_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
