import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FREE_FEMALE_HAIR_OPTIONS,isFreeFemaleHair,FREE_FEMALE_HAIR_MESSAGE} from '../src/free-female-hair.js';
import {PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {headPose,syncHairAttachments} from '../src/hair-preview-fit.js';
import {replaceHairstyleLayer} from '../src/replace-hairstyle-layer.js';
import {createHairStyleMemory} from '../src/studio-hair-style-memory.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';

// Execute the real Studio handlers with fixture layers and local image fitting.
// The fitter and account/provider callbacks are spies: no AI or financial writes.
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const noop=()=>{},clone=value=>structuredClone(value);
const BASE='data:image/png;base64,cHJvY2Vzc2VkLUE=',PERSISTED='data:image/png;base64,cGVyc2lzdGVkLWJhc2U=';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function extract(start,end,name,env){const a=editor.indexOf(start),b=editor.indexOf(end,a);assert(a>=0&&b>a,'missing actual handler '+name);return new Function('env','with(env){'+editor.slice(a,b)+';return '+name+'}')(env)}
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS: '+name)}

function fixture(options={}){
 const sourcePhoto={name:'person-A.png',idpromFemaleEyeStyle:'makeup'};
 const head={id:'head-A',kind:'head',name:'หัว · คอ · ผม',source:BASE,processedOriginalSource:BASE,jobId:'job-A',portraitMode:'female',hairId:'',hairPolicyVersion:HAIR_DESIGN_VERSION,restrictedTrial:true,outputUnlocked:false,femaleEyeStyle:'makeup',initialFemaleEyeStyle:'makeup',makeupStyles:{look:'rose'},x:41,y:-19,scale:.87,squeezeX:.96,squeezeY:1.03,rotation:3,opacity:.91,visible:true,locked:false,sourceFrame:{x:12,y:24,w:740,h:1000},...(options.head||{})};
 const background={id:'background',kind:'background',source:'background'},suit={id:'suit',kind:'suit',source:'suit'},pin={id:'pin',kind:'chest',source:'pin'};
 const layers=[background,...(options.withoutHead?[]:[head]),suit,pin,...(options.layers||[])];
 const calls={fit:[],ai:[],process:[],before:0,finish:[],receipt:[],unlock:0,popups:[],errors:[],status:[],tracking:[],hydrate:[],progress:[],commits:0,restore:[]};
 let serial=0,pending;
 const assetFor=layer=>({original:{source:layer.source,width:900,height:1200},buffer:{},mask:null,dirty:false});
 const env={
  state:{current:clone(layers)},assets:{current:new Map(layers.map(l=>[l.id,assetFor(l)]))},sourcePhoto,portraitMode:'female',hairGender:'female',ready:true,assetBusy:false,processActive:false,processHairPending:false,
  sourceLayerRef:{current:null},processRequestRef:{current:false},mounted:{current:true},loading:{current:0},selectedRef:{current:head.id},brushSession:{current:null},
  FREE_FEMALE_HAIR_MESSAGE,isFreeFemaleHair,HAIR_DESIGN_VERSION,headPose,replaceHairstyleLayer,portraitFinishChoice,
  layerKind:l=>l.kind,freeHairRequestRef:{current:0},
  paidHairAccess:false,trialHairRemaining:0,canRestoreHair:()=>false,canReuseHair:()=>false,isTrialHairAllowed:id=>!id||id==='original'||PRODUCTION_HAIR_CATALOG.some(h=>h.id===id),
  femaleHair:[...FREE_FEMALE_HAIR_OPTIONS,...PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female')],maleHair:PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='male'),
  surfaceURL:value=>typeof value==='string'?value:value?.source||'serialized-surface',copySurface:value=>({...value}),fresh:l=>({id:'new-layer-'+(++serial),x:0,y:0,scale:1,rotation:0,visible:true,opacity:1,locked:false,...l}),
  historyAssets:{current:new WeakMap()},hairStyleMemory:{current:createHairStyleMemory()},youcamHairMemory:{current:new Map()},undo:{current:[]},redo:{current:[]},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},
  restoreHistory:layers=>{calls.restore.push(clone(layers));env.state.current=syncHairAttachments(clone(layers));env.assets.current=new Map(env.historyAssets.current.get(layers)||layers.map(l=>[l.id,assetFor(l)]));return true},
  historySnapshot:()=>{const value=clone(env.state.current);env.historyAssets.current.set(value,new Map(env.assets.current));return value},
  hydrate:async next=>{calls.hydrate.push(clone(next));if(options.hydrateFailure&&calls.hydrate.length===1)return false;env.state.current=clone(next);env.assets.current=new Map(next.map(l=>[l.id,assetFor(l)]));return true},
  onPrepareHairOverlay:async(input,id,settings)=>{calls.fit.push({input,id,settings});if(options.fit)return options.fit(input,id,settings);return {source:'front-'+id,backSource:null,cleanedHeadSource:'cleaned-'+id}},
  onChangeHair:async(id,gender,style)=>{calls.ai.push({id,gender,style});return {layer:{...head,jobId:'paid-job',hairId:id,source:'paid-result'},commit:()=>calls.commits++}},
  processPhoto:options=>{calls.process.push(options)},onBeforeProcess:async()=>{calls.before++;return true},checkProcessCredits:async()=>{calls.before++;return true},
  onFinishProcess:async success=>calls.finish.push(success),reportProcessedResult:(...args)=>calls.receipt.push(args),onRequestUnlock:()=>calls.unlock++,
  isProcessCancelled:()=>Boolean(env.cancelled),hairUiFrame:async()=>{},flushTransforms:noop,drawNow:noop,resetBrushSession:noop,
  appearanceFailure:(kind,message)=>calls.errors.push({kind,message}),setSavePopup:value=>calls.popups.push(value),setStatus:value=>calls.status.push(value),trackHairSelection:(...args)=>calls.tracking.push(args),
  setAppearanceError:noop,setSelected:value=>{env.selected=value},setSelectedHair:value=>{env.selectedHair=value},setTool:noop,setHairConfirmed:noop,setHairNotice:noop,setRevision:noop,setComparing:noop,
  setHairPlacementProgress:value=>calls.progress.push(value),setAssetBusy:value=>{env.assetBusy=value},setPicker:noop,setTouchMore:noop,setTouchOpen:noop,setToolRailOpen:noop,
  setPortraitChoiceOpen:noop,pendingHairProcessRef:{current:null},touch:false,
 };
 Object.assign(env,options.env||{});
 env.showFreeHairNotice=extract(' const showFreeHairNotice=','\n const ','showFreeHairNotice',env);
 env.hasFreeHair=extract(' const hasFreeHair=','\n const ','hasFreeHair',env);
 env.freeHairAllowed=extract(' const freeHairAllowed=','\n const ','freeHairAllowed',env);
 const local=extract(' const applyFreeHair=async','\n const applyHair=','applyFreeHair',env);
 env.applyFreeHair=id=>(pending=local(id));
 env.applyHair=extract(' const applyHair=async','\n const commitMakeupSource=','applyHair',env);
 const choose=extract(' const chooseHair=id=>{','\n\n useEffect','chooseHair',env);
 return {head,background,suit,pin,layers,calls,env,local,choose,async chooseAndWait(id){pending=null;choose(id);if(pending)await pending;await tick()},getHead:()=>env.state.current.find(l=>l.kind==='head'),getHairs:()=>env.state.current.filter(l=>l.kind==='hair-preview')};
}

await test('only three legacy PNG IDs are free and paid Seedream IDs remain paid',async()=>{
 assert.deepEqual(FREE_FEMALE_HAIR_OPTIONS.map(h=>h.id),['hair-21','hair-25','hair-26']);
 for(const option of FREE_FEMALE_HAIR_OPTIONS){assert.equal(option.gender,'female');assert.equal(option.free,true);assert.match(option.src,new RegExp(option.id+'\\.png$'));assert(isFreeFemaleHair(option.id));assert(!PRODUCTION_HAIR_CATALOG.some(h=>h.id===option.id))}
 for(const id of ['seedream-21','seedream-25','seedream-26','hair-20','hair-27','manhair-21',''])assert.equal(isFreeFemaleHair(id),false);
});

const noBilling=calls=>{assert.equal(calls.before,0,'free fitting must not check or reserve generation credits');assert.deepEqual(calls.ai,[],'free IDs must never reach the AI hairstyle callback');assert.deepEqual(calls.process,[],'free selection must not start initial processing');assert.deepEqual(calls.finish,[],'free fitting must not confirm a paid generation');assert.deepEqual(calls.receipt,[],'free fitting must not report a newly billed result');assert.equal(calls.unlock,0,'free selection must not open purchase flow')};
const fitInput=value=>typeof value==='string'?value:value?.source;

await test('unprocessed, pending-source, male and paid-hair bases show original-hair guidance without credit calls',async()=>{
 const setups=[{withoutHead:true},{head:{jobId:''}},{env:{processHairPending:true}},{head:{portraitMode:'male'}},{head:{hairId:'seedream-21'}},{head:{hairId:'seedream-25'}},{head:{freeHairBaseOriginal:true,hairOriginalSource:BASE,freeHairSourceJobId:'another-job'}},{layers:[{id:'foreign-hair',kind:'hair-preview',hairHeadId:'head-A',hairId:'seedream-21'}]},{layers:[{id:'source-B',kind:'source-photo',source:'unprocessed-B'}],env:{sourceLayerRef:{current:'source-B'}}}];
 for(const setup of setups)for(const id of ['hair-21','hair-25','hair-26']){
  const f=fixture(setup),before=clone(f.env.state.current);await f.chooseAndWait(id);
  assert.equal(f.calls.fit.length,0,id);assert.equal(f.calls.hydrate.length,0,id);assert.deepEqual(f.env.state.current,before);
  assert.equal(f.calls.popups.length,1,id);assert.match(f.calls.popups[0].message,/ไม่เลือกผม/);assert.equal(f.calls.popups[0].message,FREE_FEMALE_HAIR_MESSAGE);noBilling(f.calls);
 }
});
await test('processed female original-hair output accepts free PNGs with zero remaining credits and retains rights and makeup',async()=>{
 for(const id of ['hair-21','hair-25','hair-26']){
  const f=fixture();await f.chooseAndWait(id);assert.equal(f.calls.fit.length,1);
  assert.equal(f.calls.fit[0].id,id);assert.equal(fitInput(f.calls.fit[0].input),BASE);
  const head=f.getHead();for(const key of ['id','jobId','restrictedTrial','outputUnlocked','femaleEyeStyle','initialFemaleEyeStyle','makeupStyles','x','y','scale','squeezeX','squeezeY','rotation','opacity','visible','locked','sourceFrame'])assert.deepEqual(head[key],f.head[key],key);
  assert.equal(head.processedOriginalSource,BASE);assert.equal(head.source,'cleaned-'+id);assert.equal(head.hairOriginalSource,BASE);
  assert.equal(head.freeHairBaseOriginal,true);assert.equal(head.freeHairSourceJobId,'job-A');
  assert.equal(f.getHairs().length,1);const front=f.getHairs()[0];assert.equal(front.hairId,id);assert.equal(front.hairHeadId,head.id);assert.equal(front.source,'front-'+id);
  for(const key of ['x','y','scale','squeezeX','squeezeY','rotation'])assert.equal(front[key],f.head[key],key);
  assert.deepEqual(f.env.state.current.filter(l=>['background','suit','pin'].includes(l.id)),[f.background,f.suit,f.pin]);
  assert.equal(f.calls.popups.length,0);assert.equal(f.env.undo.current.length,1);assert.equal(f.env.processRequestRef.current,false);assert.equal(f.env.assetBusy,false);noBilling(f.calls);
 }
});
await test('switching three free styles always fits the same original processed base without accumulating overlays',async()=>{
 const f=fixture();for(const id of ['hair-21','hair-25','hair-26'])await f.chooseAndWait(id);
 assert.deepEqual(f.calls.fit.map(c=>c.id),['hair-21','hair-25','hair-26']);assert.deepEqual(f.calls.fit.map(c=>fitInput(c.input)),Array(3).fill(BASE));
 assert.equal(f.getHairs().length,1);assert.equal(f.getHairs()[0].hairId,'hair-26');assert.equal(f.getHead().processedOriginalSource,BASE);assert.equal(f.getHead().jobId,'job-A');noBilling(f.calls);
});
await test('reselecting the active free hairstyle retains manual edits without fitting or adding history',async()=>{
 const f=fixture();await f.chooseAndWait('hair-21');const front=f.getHairs()[0];front.x+=13;front.rotation-=2;front.opacity=.72;front.mask='manual-mask';
 const before=clone(f.env.state.current),history=f.env.undo.current.length;await f.chooseAndWait('hair-21');
 assert.deepEqual(f.env.state.current,before);assert.equal(f.calls.fit.length,1);assert.equal(f.env.undo.current.length,history);assert.equal(f.env.selected,front.id);noBilling(f.calls);
});
await test('returning to a previously fitted free style restores native edits and keeps current rights and unrelated layers',async()=>{
 const f=fixture();await f.chooseAndWait('hair-21');const edited=f.getHairs()[0];edited.x+=17;edited.opacity=.66;edited.mask='painted-hair-mask';
 const editedPixels={...f.env.assets.current.get(edited.id),mask:{painted:true}};f.env.assets.current.set(edited.id,editedPixels);
 await f.chooseAndWait('hair-25');f.getHead().outputUnlocked=true;f.getHead().restrictedTrial=false;
 f.env.state.current.find(l=>l.id==='suit').source='new-current-outfit';
 await f.chooseAndWait('hair-21');assert.equal(f.calls.fit.length,2);assert.equal(f.calls.restore.length,1);
 const restored=f.getHairs()[0];assert.equal(restored.id,edited.id);assert.equal(restored.x,edited.x);assert.equal(restored.opacity,.66);assert.equal(restored.mask,'painted-hair-mask');assert.equal(f.env.assets.current.get(restored.id),editedPixels);
 assert.equal(f.getHead().outputUnlocked,true);assert.equal(f.getHead().restrictedTrial,false);assert.equal(f.getHead().jobId,'job-A');assert.equal(f.getHead().processedOriginalSource,BASE);
 assert.equal(f.env.state.current.find(l=>l.id==='suit').source,'new-current-outfit');noBilling(f.calls);
});
await test('cached free hair follows the current head position, scale and rotation while retaining its manual offset',async()=>{
 // Production restoreHistory uses this same attachment synchronizer after replacing
 // the cached head pose with the current one. A 90 degree turn maps (17,-9) to (9,17).
 const restoreBody=editor.slice(editor.indexOf(' const restoreHistory='),editor.indexOf('\n const remember='));
 assert.match(restoreBody,/state\.current=syncHairAttachments\(/);
 const f=fixture({head:{squeezeX:1,squeezeY:1}});await f.chooseAndWait('hair-21');
 const edited=f.getHairs()[0];edited.x+=17;edited.y-=9;edited.mask='manual-paint';
 const oldScale=edited.scale,oldRotation=edited.rotation;await f.chooseAndWait('hair-25');
 const current=f.getHead();current.x+=80;current.y-=35;current.scale*=2;current.rotation+=90;
 const currentPose=headPose(current);await f.chooseAndWait('hair-21');const restored=f.getHairs()[0];
 assert.equal(f.calls.fit.length,2);assert.equal(f.calls.restore.length,1);
 assert.deepEqual(headPose(f.getHead()),currentPose);assert.deepEqual(restored.hairHeadPose,currentPose);
 assert(Math.abs(restored.x-(currentPose.x+18))<1e-9);assert(Math.abs(restored.y-(currentPose.y+34))<1e-9);
 assert.equal(restored.scale,oldScale*2);assert.equal(restored.rotation,oldRotation+90);assert.equal(restored.mask,'manual-paint');noBilling(f.calls);
});
await test('choosing none clears the local overlay and restores its base without an AI cache or credits',async()=>{
 const f=fixture();await f.chooseAndWait('hair-25');assert.equal(f.getHairs().length,1);await f.chooseAndWait('');
 assert.equal(f.getHairs().length,0);assert.equal(f.getHead().source,BASE);assert.equal(f.getHead().jobId,'job-A');assert.equal(f.env.selectedHair,'');assert.equal(f.calls.fit.length,1);noBilling(f.calls);
});
await test('reopened free work clears locally using persisted source metadata without session hairstyle cache',async()=>{
 const f=fixture({head:{source:'cleaned-hair-26',hairOriginalSource:PERSISTED,processedOriginalSource:PERSISTED,freeHairBaseOriginal:true,freeHairSourceJobId:'job-A'},layers:[{id:'persisted-free',kind:'hair-preview',hairHeadId:'head-A',hairId:'hair-26',source:'persisted-front',hairRole:'front'}]});
 await f.chooseAndWait('');assert.equal(f.getHairs().length,0);assert.equal(f.getHead().source,PERSISTED);assert.equal(f.calls.fit.length,0);noBilling(f.calls);
});
await test('reselecting saved old free hair refits from its intact base without AI or credits',async()=>{
 for(const version of [undefined,'free-female-png-v1']){
  const oldFront={id:'old-free',kind:'hair-preview',hairHeadId:'head-A',hairId:'hair-21',hairRole:'front',hairPreviewVersion:version,source:'old-front',x:71,y:-42,scale:1.2,rotation:8,opacity:.73,mask:'manual-mask'};
  const f=fixture({head:{source:'old-cleaned-with-holes',hairOriginalSource:PERSISTED,freeHairBaseOriginal:true,freeHairSourceJobId:'job-A'},layers:[oldFront]});
  await f.chooseAndWait('hair-21');assert.equal(f.calls.fit.length,1);assert.equal(fitInput(f.calls.fit[0].input),PERSISTED);assert.equal(f.calls.restore.length,0);
  assert.notEqual(f.getHairs()[0].hairPreviewVersion,version);assert.notEqual(f.getHairs()[0].hairPreviewVersion,'free-female-png-v1');assert.equal(f.getHead().source,'cleaned-hair-21');assert.equal(f.getHead().hairOriginalSource,PERSISTED);
  const {hairPreviewVersion:correctedVersion,...correctedFront}=f.getHairs()[0],{hairPreviewVersion:oldVersion,...retainedFront}=oldFront;assert.deepEqual(correctedFront,retainedFront,'repair the head while preserving manual free-hair pixels, mask and placement');
  assert.deepEqual(headPose(f.getHead()),headPose(f.head));assert.equal(f.getHead().jobId,'job-A');assert.equal(f.getHead().restrictedTrial,true);noBilling(f.calls);
 }
});
await test('switching away from old free hair cannot cache its damaged pixels as the corrected version',async()=>{
 const f=fixture({head:{source:'old-cleaned-with-holes',hairOriginalSource:PERSISTED,freeHairBaseOriginal:true,freeHairSourceJobId:'job-A'},layers:[{id:'old-free',kind:'hair-preview',hairHeadId:'head-A',hairId:'hair-21',hairRole:'front',hairPreviewVersion:'free-female-png-v1',source:'old-front'}]});
 await f.chooseAndWait('hair-25');await f.chooseAndWait('hair-21');assert.deepEqual(f.calls.fit.map(c=>c.id),['hair-25','hair-21']);assert.equal(f.calls.restore.length,0);assert.equal(f.getHead().source,'cleaned-hair-21');assert.equal(f.getHairs()[0].source,'front-hair-21');
 await f.chooseAndWait('hair-25');assert.equal(f.calls.fit.length,2);assert.equal(f.calls.restore.length,1);assert.equal(f.getHead().source,'cleaned-hair-25');noBilling(f.calls);
});
await test('failed fitting keeps the original head, outfit and history without settlement or billing',async()=>{
 const f=fixture({fit:async()=>{throw Error('local fitting unavailable')}}),before=clone(f.env.state.current);await f.chooseAndWait('hair-21');
 assert.deepEqual(f.env.state.current,before);assert.equal(f.env.undo.current.length,0);assert.match(f.calls.errors.at(-1)?.message||'',/local fitting unavailable/);assert.equal(f.env.processRequestRef.current,false);assert.equal(f.env.assetBusy,false);noBilling(f.calls);
});
await test('a failed local hydration rolls back layers and retains the old paid/trial output metadata',async()=>{
 const f=fixture({hydrateFailure:true}),before=clone(f.env.state.current);await f.chooseAndWait('hair-25');
 assert.deepEqual(f.env.state.current,before);assert.equal(f.env.undo.current.length,0);assert.equal(f.getHead().jobId,'job-A');assert.equal(f.getHead().restrictedTrial,true);assert.equal(f.env.processRequestRef.current,false);noBilling(f.calls);
});
await test('a second source introduced during asynchronous fitting cannot receive the previous person hairstyle',async()=>{
 const wait=deferred(),f=fixture({fit:()=>wait.promise});const pending=f.local('hair-21');await tick();assert.equal(f.calls.fit.length,1);
 const B=[{id:'source-B',kind:'source-photo',source:'unprocessed-B'}];f.env.state.current=B;f.env.sourceLayerRef.current='source-B';f.env.sourcePhoto={name:'person-B.png'};
 wait.resolve({source:'old-A-front',cleanedHeadSource:'old-A-cleaned'});await pending;
 assert.deepEqual(f.env.state.current,B,'stale handler must neither commit A nor restore A on top of B');assert.equal(f.env.undo.current.length,0);noBilling(f.calls);
});
await test('unmount while local fitting is pending cannot commit a new local result or financial side effect',async()=>{
 const wait=deferred(),f=fixture({fit:()=>wait.promise});const pending=f.local('hair-26');await tick();f.env.mounted.current=false;
 wait.resolve({source:'cancelled-front',cleanedHeadSource:'cancelled-cleaned'});await pending;
 assert.equal(f.calls.hydrate.length,0);assert.equal(f.env.undo.current.length,0);noBilling(f.calls);
});
await test('initial processing rejects free IDs before credit checks or provider requests even when called directly',async()=>{
 for(const id of ['hair-21','hair-25','hair-26']){
  const f=fixture({env:{onProcessPhoto:async()=>{throw Error('initial provider must not be called')}}});
  const initial=extract(' const processPhoto=async','\n useEffect','processPhoto',f.env);await initial({hairId:id,portraitMode:'female'});
  assert.equal(f.calls.popups.length,1);assert.equal(f.calls.popups[0].message,FREE_FEMALE_HAIR_MESSAGE);assert.equal(f.env.processRequestRef.current,false);assert.equal(f.calls.fit.length,0);noBilling(f.calls);
 }
});
await test('unrelated paid hairstyles still use the existing unlock gate when no credits or trial remain',async()=>{
 const f=fixture();f.choose('seedream-21');await tick();assert.equal(f.calls.unlock,1);assert.equal(f.calls.fit.length,0);assert.equal(f.calls.popups.length,0);assert.equal(f.calls.ai.length,0);
});
await test('eligible paid hairstyle changes still preflight, generate, settle and report through the original path',async()=>{
 const f=fixture({env:{paidHairAccess:true}});await f.env.applyHair('seedream-25');
 assert.equal(f.calls.fit.length,0);assert.equal(f.calls.before,1);assert.equal(f.calls.ai.length,1);assert.equal(f.calls.ai[0].id,'seedream-25');assert.deepEqual(f.calls.finish,[true]);assert.equal(f.calls.receipt.length,1);assert.equal(f.calls.commits,1);
});

console.log(`PASS: ${passed} free female hairstyle contract scenarios; fixture fitting and provider callbacks only.`);
