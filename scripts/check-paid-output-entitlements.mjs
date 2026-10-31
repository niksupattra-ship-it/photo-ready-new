import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeSavedProject,prepareSavedProject} from '../src/saved-project.js';
import {outputAccessResult,unavailableOutputRights,mergeOutputRights} from '../src/output-rights.js';
import {replaceHairstyleLayer} from '../src/replace-hairstyle-layer.js';
import {replaceStudioSourceLayers} from '../src/replace-studio-source.js';

// Execute the actual handlers with deterministic browser/storage doubles.
// No provider calls, real accounts, payment requests or database writes.
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
function extract(start,end,name,env){
 const a=editor.indexOf(start),b=editor.indexOf(end,a);
 assert(a>=0&&b>a,`missing ${name}`);
 return new Function('env',`with(env){${editor.slice(a,b)};return ${name}}`)(env);
}
let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const no=()=>{},tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
const png='data:image/png;base64,QUFBQQ==';
const head={id:'head-A',kind:'head',name:'หัว · คอ · ผม',jobId:'job-A',source:png,processedOriginalSource:png,x:7,y:8,scale:1.1,rotation:0,opacity:1,visible:true};
const granted={checked:true,unlocked:true,fullEdit:true},denied={checked:true,unlocked:false,fullEdit:false};
function accessFixture(reply=granted){
 const events=[],e={accountScope:'account-A',outputScopeRef:{current:'account-A'},state:{current:[{...head}]},outputHeads:ls=>ls.filter(l=>l.kind==='head'||l.kind==='source-photo'),warningProofForJob:()=>'fixture',layerKind:l=>l.kind,
  onVerifyOutput:async id=>{events.push(['verify',id]);return typeof reply==='function'?reply(id):reply},outputAccessResult,unavailableOutputRights,mergeOutputRights,
  setVerifiedJobs:fn=>{e.verified=fn(e.verified||{})},sessionUnlockedJobs:{current:new Set()},onSelectSuit:async()=>({limited:false,choices:[]}),setSuitPolicy:no,
  setStatus:message=>events.push(['message',message]),setSavePopup:popup=>events.push(['popup',popup]),setDownloadCrop:no,onRequestUnlock:()=>events.push(['purchase'])};
 return{e,events,allow:extract(' const allowOutput=async','\n const [suitPolicy','allowOutput',e)};
}

await check('paid output keeps unlimited repeated access at zero remaining credits',async()=>{
 const f=accessFixture();for(let i=0;i<12;i++)assert.equal(await f.allow(),true);
 assert.equal(f.events.filter(e=>e[0]==='verify').length,12);assert(!f.events.some(e=>e[0]==='purchase'));
 assert(f.e.sessionUnlockedJobs.current.has('job-A'));
});
await check('only authoritative unpaid results offer purchase; errors never ask for another payment',async()=>{
 for(const right of [denied,unavailableOutputRights(),unavailableOutputRights('login','auth_required'),unavailableOutputRights('missing','output_not_found')]){
  const f=accessFixture(right);assert.equal(await f.allow(),false);assert.equal(f.events.some(e=>e[0]==='purchase'),right===denied);
 }
});
await check('every generated head must be owned and unlocked',async()=>{
 const f=accessFixture(id=>id==='job-A'?granted:denied);f.e.state.current.push({...head,id:'head-B',jobId:'job-B'});
 assert.equal(await f.allow(),false);assert.deepEqual(f.events.filter(e=>e[0]==='verify').map(e=>e[1]),['job-A','job-B']);
});
await check('unprocessed sources are blocked even when restored beside a paid head',async()=>{
 for(const layers of [[],[{kind:'head',jobId:''}],[head,{id:'restored-source',kind:'source-photo',source:png}]]){
  const f=accessFixture();f.e.state.current=layers;assert.equal(await f.allow(),false);assert(!f.events.some(e=>e[0]==='verify'||e[0]==='purchase'));
 }
});
await check('registered raw sources use the same verified paid, unpaid and unavailable rights gates',async()=>{
 for(const reply of [granted,denied,unavailableOutputRights()]){
  const f=accessFixture(reply);f.e.state.current=[{id:'source-A',kind:'source-photo',jobId:'source-job',source:png}];
  assert.equal(await f.allow(),reply===granted);assert.deepEqual(f.events.filter(e=>e[0]==='verify'),[['verify','source-job']]);
  assert.equal(f.events.some(e=>e[0]==='purchase'),reply===denied);
 }
});
function sourceDownloadFixture(){
 const source={id:'raw-A',kind:'source-photo',source:png},calls=[];
 const e={state:{current:[source]},outputScopeRef:{current:'A'},sourcePhoto:new File(['fixture'],'portrait.png',{type:'image/png'}),setLayers:layers=>calls.push(layers),onPrepareSourceDownload:async()=>({jobId:'raw-job'})};
 return {e,calls,source,prepare:extract(' const prepareSourceDownload=async','\n const exportImage=','prepareSourceDownload',e)};
}
await check('source registration preserves its layer and retries reuse the registered work',async()=>{
 const f=sourceDownloadFixture();let requests=0;f.e.onPrepareSourceDownload=async(file,{isCurrent})=>{requests++;assert(isCurrent());return {jobId:'raw-job'}};
 await f.prepare();await f.prepare();assert.equal(requests,1);assert.equal(f.calls.length,1);
 assert.deepEqual(f.e.state.current,[{...f.source,jobId:'raw-job',downloadOnly:true}]);
});
await check('late source registration cannot attach a paid identity after a photo or account change',async()=>{
 for(const change of ['photo','account']){
  const f=sourceDownloadFixture(),gate=deferred();f.e.onPrepareSourceDownload=()=>gate.promise;
  const pending=f.prepare();if(change==='photo')f.e.state.current=[{...f.source,id:'raw-B'}];else f.e.outputScopeRef.current='B';
  gate.resolve({jobId:'raw-job'});await assert.rejects(pending,/เปลี่ยนแล้ว/);assert.equal(f.calls.length,0);assert(!f.e.state.current[0].jobId);
 }
});
await check('the pending crop cannot use the rights of a different image or account',async()=>{
 for(const options of [{expectedOutputKey:'job-B'},{expectedAccountScope:'account-B'}]){
  const f=accessFixture();assert.equal(await f.allow(options),false);assert(!f.events.some(e=>e[0]==='verify'||e[0]==='purchase'));
 }
});
await check('account and job changes during rights verification discard the result',async()=>{
 for(const change of ['account','job']){
  const gate=deferred(),f=accessFixture(()=>gate.promise),pending=f.allow();
  if(change==='account')f.e.outputScopeRef.current='account-B';else f.e.state.current=[{...head,jobId:'job-B'}];
  gate.resolve(granted);assert.equal(await pending,false);assert.equal(f.e.verified,undefined);assert.equal(f.e.sessionUnlockedJobs.current.size,0);
 }
});
await check('account changes while checking suit access cannot authorize a late export',async()=>{
 const gate=deferred(),f=accessFixture();f.e.onSelectSuit=()=>gate.promise;const pending=f.allow();await tick();f.e.outputScopeRef.current='account-B';gate.resolve({limited:false,choices:[]});assert.equal(await pending,false);assert.equal(f.e.sessionUnlockedJobs.current.size,0);
});

await check('verified previews survive transient failure only within the same account',async()=>{
 const a=editor.indexOf(' const [outputRights,'),b=editor.indexOf('\n const outputHeads=',a),slots=[];let hook=0;
 const hooks={useState(initial){const index=hook++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next}]},useRef(initial){const index=hook++;if(!(index in slots))slots[index]={current:initial};return slots[index]}};
 const factory=new Function('env',`with(env){${editor.slice(a,b)};return{verifiedJobs,setVerifiedJobs,sessionUnlockedJobs,outputScopeRef}}`);
 const render=scope=>{hook=0;return factory({...hooks,accountScope:scope})};
 let A=render('A');A.setVerifiedJobs(previous=>mergeOutputRights(previous,[['job-A',granted]]));A.sessionUnlockedJobs.current.add('job-A');A=render('A');assert.equal(A.verifiedJobs['job-A'],granted);
 A.setVerifiedJobs(previous=>mergeOutputRights(previous,[['job-A',unavailableOutputRights()]]));assert.equal(render('A').verifiedJobs['job-A'],granted);
 const oldSetter=A.setVerifiedJobs;let B=render('B');assert.deepEqual(B.verifiedJobs,{});assert.equal(B.sessionUnlockedJobs.current.size,0);
 oldSetter(()=>({'job-A':granted}));assert.deepEqual(render('B').verifiedJobs,{});
 B.setVerifiedJobs(()=>({'job-B':granted}));B=render('B');assert.equal(B.verifiedJobs['job-B'],granted);assert.equal(B.verifiedJobs['job-A'],undefined);
});

globalThis.FileReader=class{
 readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.()}).catch(()=>this.onerror?.())}
};
const sourceA=new File(['original-source-A'],'source-A.png',{type:'image/png'});sourceA.idpromDownloadWorkId='dwork_'+'a'.repeat(36);
const sourceB=new File(['original-source-B'],'source-B.png',{type:'image/png'});sourceB.idpromDownloadWorkId='dwork_'+'b'.repeat(36);
const placement={W:2256,H:3072,uX:0,uY:800,uW:2256,uH:2272};
const backgroundProject={format:'idprom-studio',version:1,width:900,height:1200,placement,compareSource:png,sourcePhoto:sourceA,layers:[head]};
function saveFixture(){
 const saved=[],e={onSaveWork:async(project,options)=>saved.push({project,options}),savingRef:{current:false},saveSequenceRef:{current:0},savingDoneRef:{current:null},lastSaveErrorRef:{current:null},state:{current:[head]},lastSavedLayersRef:{current:null},
  accountScope:'A',outputScopeRef:{current:'A'},setStatus:no,setSavePopup:no,setHistoryNotice:no,allowOutput:async()=>true,flushTransforms:no,makeSavedProject,surfaceURL:value=>value,
  placementRef:{current:placement},compareSourceRef:{current:png},sourcePhoto:sourceB,snapshot:()=>[head],trialUnlocked:false,download:()=>{throw Error('unexpected delivery')}};
 return{e,saved,save:extract(' const save=async','\n const reportProcessedResult','save',e)};
}
await check('post-download backups preserve the rendered source work, original bytes and entitlement metadata',async()=>{
 const f=saveFixture();assert.equal(await f.save({background:true,showPopup:false,outputVerified:true,project:backgroundProject}),true);assert.equal(f.saved.length,1);
 const project=f.saved[0].project;assert.equal(project.downloadWorkId,sourceA.idpromDownloadWorkId);assert.equal(project.downloadSource,'data:image/png;base64,'+Buffer.from('original-source-A').toString('base64'));
 assert.equal(project.sourcePhoto,undefined);assert.equal(project.layers[0].jobId,'job-A');assert.equal(f.e.lastSavedLayersRef.current,null,'a captured older backup must not mark current edits as saved');
 const restored=await prepareSavedProject(JSON.parse(JSON.stringify(project)),{decode:async()=>({width:64,height:64}),fetchImage:async src=>({blob:async()=>new Blob([Buffer.from(src.split(',')[1],'base64')],{type:'image/png'})}),makeFile:blob=>new File([blob],'original.png',{type:blob.type})});
 assert.equal(restored.source.idpromDownloadWorkId,sourceA.idpromDownloadWorkId);assert.equal(await restored.source.text(),'original-source-A');assert.equal(restored.head.jobId,'job-A');
 assert.equal((await makeSavedProject({...restored,sourcePhoto:restored.source,layers:project.layers,placement})).downloadWorkId,sourceA.idpromDownloadWorkId);
});
await check('normal saves and stale background saves do not write across account changes',async()=>{
 const f=saveFixture();assert.equal(await f.save({showPopup:false}),true);assert.equal(f.saved[0].project.downloadWorkId,sourceB.idpromDownloadWorkId);
 const gate=deferred(),g=saveFixture();g.e.makeSavedProject=async snapshot=>{await gate.promise;return makeSavedProject(snapshot)};const pending=g.save({showPopup:false});g.e.outputScopeRef.current='B';gate.resolve();assert.equal(await pending,false);assert.equal(g.saved.length,0);
 const h=saveFixture();h.e.saveSequenceRef.current=2;assert.equal(await h.save({background:true,saveSequence:1,project:backgroundProject}),false);assert.equal(h.saved.length,0);
});
function exportFixture(){
 const events=[],e={exportingRef:{current:false},saveSequenceRef:{current:0},accountScope:'A',outputScopeRef:{current:'A'},setStatus:message=>events.push(['message',message]),setSavePopup:popup=>events.push(['popup',popup]),allowOutput:async()=>true,flushTransforms:no,
  outputHeads:ls=>ls.filter(l=>l.kind==='head'||l.kind==='source-photo'),state:{current:[head]},nativeCanvas:()=>({width:2256,height:3072,getContext:()=>({}),toBlob:callback=>callback(new Blob(['rendered'],{type:'image/png'}))}),placementRef:{current:placement},paintScene:no,assets:{current:new Map()},onSaveWork:()=>{},trialUnlocked:false,W:900,H:1200,
  compareSourceRef:{current:png},sourcePhoto:sourceA,historySnapshot:()=>[head],withDeadline:operation=>operation(),download:()=>events.push(['download']),setDownloadCrop:crop=>{e.crop=crop}};
 e.prepareSourceDownload=extract(' const prepareSourceDownload=async','\n const exportImage=','prepareSourceDownload',e);
 return{e,events,run:extract(' const exportImage=async','\n const autoDownloadAttempted=','exportImage',e)};
}
await check('the actual export captures source identity together with its rendered image',async()=>{
 const f=exportFixture();await f.run('image/png');assert.equal(f.e.crop.project.sourcePhoto,sourceA);assert.equal(f.e.crop.renderedOutputKey,'job-A');assert.equal(f.e.crop.accountScope,'A');assert.equal(f.e.exportingRef.current,false);
});
await check('account changes during the image encoder suppress the pending crop and automatic download',async()=>{
 for(const automatic of [false,true]){
  const f=exportFixture(),gate=deferred();f.e.nativeCanvas=()=>({width:2256,height:3072,getContext:()=>({}),toBlob:callback=>gate.promise.then(()=>callback(new Blob(['pixels'])))});
  const pending=f.run('image/png',{automatic});await tick();f.e.outputScopeRef.current='B';gate.resolve();await pending;assert.equal(f.e.crop,undefined);assert(!f.events.some(e=>e[0]==='download'));assert(f.events.some(e=>e[0]==='popup'&&e[1]?.state==='error'));
 }
});
await check('a late crop encoder cannot deliver pixels after account or generated job changes',async()=>{
 for(const change of ['account','job']){
  const gate=deferred(),events=[],e={exportingRef:{current:false},downloadCrop:{blob:new Blob(['rendered']),type:'image/png',project:null,renderedOutputKey:'job-A',accountScope:'A'},setDownloadCropBusy:no,
   allowOutput:async options=>{assert.equal(options.expectedOutputKey,'job-A');assert.equal(options.expectedAccountScope,'A');return true},withDeadline:operation=>operation(),cropPhotoForDownload:()=>gate.promise,
   outputScopeRef:{current:'A'},state:{current:[head]},outputHeads:ls=>ls,download:()=>events.push('delivered'),setStatus:no,setSavePopup:popup=>events.push(popup),setDownloadCrop:no,STUDIO_DOWNLOAD_SIZES:[{id:'original'}]};
  const finish=extract(' const finishDownloadCrop=async','\n const duplicate=','finishDownloadCrop',e),pending=finish({sizeId:'original'});await tick();
  if(change==='account')e.outputScopeRef.current='B';else e.state.current=[{...head,jobId:'job-B'}];gate.resolve(new Blob(['encoded']));await pending;assert(!events.includes('delivered'));assert(events.some(e=>e?.state==='error'));
 }
});
await check('source-photo copying stops before history or pixel changes',async()=>{
 const e={current:{id:'source',name:'รูปที่เพิ่ม',kind:'source-photo'},layers:[head],setStatus:message=>{e.message=message},historySnapshot:()=>{throw Error('must not copy unprocessed pixels')}};
 const duplicate=extract(' const duplicate=async','\n const neckSuit=','duplicate',e);await duplicate();assert(e.message.includes('ประมวลผล'));
});
await check('processed head copies keep their job identity and are removed when replacing the source',async()=>{
 const e={current:head,layers:[head],selected:head.id,historySnapshot:()=>[head],remember:no,layerKind:l=>l.kind,uid:()=> 'head-copy',hydrate:async layers=>{e.result=layers;return true},setSelected:no};
 const duplicate=extract(' const duplicate=async','\n const neckSuit=','duplicate',e);await duplicate();const copy=e.result[1];assert.equal(copy.kind,'head');assert.equal(copy.jobId,head.jobId);
 const freshSource={id:'source-B',kind:'source-photo'};assert.deepEqual(replaceStudioSourceLayers(e.result,freshSource),[freshSource]);
 const f=accessFixture(id=>id==='job-A'?granted:denied);f.e.state.current=[head,{...copy,jobId:'unpaid-copy'}];assert.equal(await f.allow(),false);assert(f.events.some(e=>e[0]==='verify'&&e[1]==='unpaid-copy'));
});
await check('paid job identity survives fresh layers, history snapshots and hairstyle replacements',async()=>{
 const fresh=extract('function fresh(layer)','\nfunction paintLayers','freshLinkedLayers',{uid:(()=>{let id=0;return()=>String(++id)})(),layerKind:l=>l.kind});
 const layers=fresh([head]);assert.equal(layers[0].jobId,head.jobId);assert.notEqual(layers[0].id,head.id);
 const replacement=replaceHairstyleLayer([head,{id:'attachment',kind:'hair-preview',hairHeadId:head.id}],head.id,{...head,source:png,jobId:'job-B'});
 assert.equal(replacement.length,1);assert.equal(replacement[0].id,head.id);assert.equal(replacement[0].jobId,'job-B');
 const old=[{...head,outputUnlocked:true,fullEditUnlocked:true}],e={state:{current:old},assets:{current:new Map()},historyAssets:{current:new WeakMap()}};
 const snapshot=extract(' const historySnapshot=','\n const restoreHistory=','historySnapshot',e)();assert.equal(snapshot[0].jobId,'job-A');assert.equal(snapshot[0].fullEditUnlocked,true);assert.equal(old[0].jobId,'job-A');
});
console.log(JSON.stringify({passed,scope:'actual Studio rights/cache/save/copy/history handlers, saved-project codec; mocked local fixtures only'}));
