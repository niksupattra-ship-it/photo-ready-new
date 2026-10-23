import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAiResultCache,resultSourceDigest} from '../src/ai-result-cache.js';
import {inspectSelectedPortraitHair} from '../src/selected-hair-check.js';
import {replaceStudioSourceLayers} from '../src/replace-studio-source.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';

// Run the real browser request/cache/completion functions with mocked network,
// landmarks and decoded pixels. No provider request, payment or customer data.
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
function extract(start,end,name,env){
 const a=main.indexOf(start),b=main.indexOf(end,a);
 assert(a>=0&&b>a,`missing ${name}`);
 return new Function('env',`with(env){${main.slice(a,b)};return ${name}}`)(env);
}
const noop=()=>{};
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS: '+name)}
function photo(value,replacement=false){
 const file=new File([value],'portrait.jpg',{type:'image/jpeg'});
 if(replacement)file.idpromStudioSourceReplacement=true;
 return file;
}
const ovalIds=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
function face(box){const out=[];ovalIds.forEach((id,i)=>{out[id]={x:box[i%2?2:0],y:box[i%3?3:1]}});return out}
function requestFixture({missingFace=false,smallFace=false}={}){
 const A=photo('source-A'),B=photo('source-B',true);
 const inputA=new File(['level-A'],'upright.png',{type:'image/png'}),inputB=new File(['level-B'],'upright.png',{type:'image/png'});
 const boxes=new Map([[inputA,[.12,.2,.55,.9]],[inputB,smallFace?[.31,.17,.312,.172]:[.31,.17,.75,.78]]]);
 const requests=[],saved=[],jobs=[],polls=[],settlements=[];
 const env={
  PRODUCTION_HAIR_CATALOG,activeProcessOperation:{jobId:null,cancelled:false},acceptedPaidTrial:false,
  assertProcessActive:o=>{if(o?.cancelled)throw Error('cancelled')},cancelledProcessError:()=>Error('cancelled'),
  levelPortraitCutout:async source=>source===A?inputA:inputB,
  decodedPortraitImage:async blob=>({blob,naturalWidth:1000,naturalHeight:1200}),
  getLandmarker:async()=>({detect:image=>({faceLandmarks:missingFace?[]:[face(boxes.get(image.blob))]})}),
  saveAiJobFile:async source=>saved.push(source),walletHeaders:()=>({'X-Wallet-Id':'fixture-wallet'}),
  portraitFetch:async(url,options)=>{
   requests.push({url,options});assert.equal(url,'/api/ai-jobs');
   const id=options.body.get('hairId');
   if(id!=='original'&&!PRODUCTION_HAIR_CATALOG.some(h=>h.id===id))return {ok:false,status:400,text:async()=> 'invalid selected hairstyle'};
   return {ok:true,json:async()=>({jobId:'fixture-job-'+requests.length,trialPreview:false})};
  },
  waitForAiJob:async(job,status,operation)=>{polls.push({job,operation});return Object.assign(new Blob([job]),{idpromJobId:job,idpromTrial:false,idpromFullEdit:true})},
  writeActiveAiJob:job=>jobs.push(job),settleProcessOperation:async(...args)=>settlements.push(args),warmPortraitResources:noop,
  analyticsTagError:(error,tags)=>Object.assign(error,{tags}),window:{dispatchEvent:noop},Event:class{}
 };
 env.replacementFaceIdentityBox=extract('async function replacementFaceIdentityBox(','\nasync function aiFinishPortraitUncached(','replacementFaceIdentityBox',env);
 const run=extract('async function aiFinishPortraitUncached(','\n// V206:','aiFinishPortraitUncached',env);
 return {A,B,inputA,inputB,boxes,env,requests,saved,jobs,polls,settlements,run};
}

await test('second upload submits exact upright B pixels and the selected catalog ID in one new job',async()=>{
 const f=requestFixture();assert.equal(f.A.name,f.B.name);assert.equal(f.A.size,f.B.size);
 await f.run(f.A,'seedream-07',{portraitMode:'female'});
 const result=await f.run(f.B,'seedream-19',{portraitMode:'female',femaleEyeStyle:'makeup'});
 assert.equal(f.requests.length,2);
 const fd=f.requests[1].options.body;
 assert.deepEqual(new Uint8Array(await fd.get('image').arrayBuffer()),new Uint8Array(await f.inputB.arrayBuffer()));
 assert.equal(fd.get('hairId'),'seedream-19');assert.equal(fd.get('femaleEyeStyle'),'makeup');
 assert.deepEqual(JSON.parse(fd.get('faceIdentityBox')),f.boxes.get(f.inputB));
 assert.notDeepEqual(JSON.parse(fd.get('faceIdentityBox')),f.boxes.get(f.inputA));
 assert.equal(f.saved.at(-1),f.B);assert.equal(f.polls.at(-1).job,result.idpromJobId);assert.equal(f.jobs.at(-1).jobId,result.idpromJobId);
 assert.equal(f.settlements.length,0,'request never confirms or debits a second time');
});
await test('initial uploads and original-hair requests retain their existing request shape',async()=>{
 for(const replacement of [false,true])for(const hair of ['', 'original','seedream-19']){
  const f=requestFixture(),source=replacement?f.B:f.A;await f.run(source,hair,{portraitMode:'female'});
  assert.equal(f.requests[0].options.body.has('faceIdentityBox'),replacement&&hair==='seedream-19');
 }
});
await test('missing or too-small B face stops before submission or source persistence',async()=>{
 for(const options of [{missingFace:true},{smallFace:true}]){
  const f=requestFixture(options);await assert.rejects(f.run(f.B,'seedream-19',{portraitMode:'female'}));
  assert.equal(f.requests.length,0);assert.equal(f.polls.length,0);assert.equal(f.saved.length,0);
 }
});
await test('an invalid requested hairstyle is not silently replaced with an old or default style',async()=>{
 const f=requestFixture();await assert.rejects(f.run(f.B,'not-in-catalog',{portraitMode:'female'}),/invalid selected hairstyle/);
 assert.equal(f.requests[0].options.body.get('hairId'),'not-in-catalog');assert.equal(f.polls.length,0);
});

function evidence(fringe=false){
 const pixels=new Uint8ClampedArray(256*320*4),hair=new Uint8ClampedArray(pixels.length);
 for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
 for(let y=42;y<100;y++)for(let x=64;x<192;x++)hair[(y*256+x)*4+3]=255;
 if(fringe)for(let y=104;y<140;y++)for(let x=100;x<156;x++)hair[(y*256+x)*4+3]=255;
 return {pixels,hair,chinY:210,faceTopY:90,sourceBounds:[{x:0,y:0},{x:256,y:0},{x:256,y:320},{x:0,y:320}],garments:{measurable:true,retained:false}};
}
function finishFixture({wrongHair=false,missingReference=false,sourceReplacement=true}={}){
 const A=photo('source-A',sourceReplacement),B=photo('source-B',sourceReplacement),calls=[],events=[],references=[],sourceChecks=[];
 const expected=evidence(false),actual=evidence(wrongHair);
 const env={
  PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION:'fixture-policy',activeProcessOperation:{cancelled:false},
  assertProcessActive:o=>{if(o?.cancelled)throw Error('cancelled')},cancelledProcessError:()=>Error('cancelled'),
  currentResultCacheScope:()=> 'fixture-wallet',resultSourceDigest,portraitResultCache:createAiResultCache(),
  aiFinishPortraitUncached:async(source,hair)=>{
   calls.push({source,hair});return Object.assign(new Blob([await source.arrayBuffer(),hair]),{evidence:actual,idpromJobId:'job-'+calls.length,idpromTrial:false,idpromFullEdit:true});
  },
  cleanPortraitClothing:async blob=>blob,checkPortraitProportions:async()=>{},
  portraitCompletionEvidence:async blob=>blob.evidence||evidence(false),
  selectedHairEvidence:async id=>{references.push(id);return missingReference?null:expected},
  inspectSelectedPortraitHair,
  inspectUnchangedPortraitHair:(source,output)=>{sourceChecks.push({source,output});return {unchanged:false}},
  verifyOutputRights:async()=>({checked:true,unlocked:true,fullEdit:true}),saveAiJobFile:async()=>{},writeActiveAiJob:noop,
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},window:{dispatchEvent:event=>events.push(event)}
 };
 env.checkPortraitCompletion=extract('async function checkPortraitCompletion(','\nasync function aiFinishPortrait(','checkPortraitCompletion',env);
 const run=extract('async function aiFinishPortrait(','\nlet acceptedPaidTrial=','aiFinishPortrait',env);
 return {A,B,calls,events,references,sourceChecks,env,run};
}
await test('the actual reference loader fetches the chosen catalog preview and shares only that preview evidence',async()=>{
 const requests=[],open=evidence(false),bangs=evidence(true),openBlob=Object.assign(new Blob(['reference-19']),{evidence:open}),bangsBlob=Object.assign(new Blob(['reference-21']),{evidence:bangs});
 const env={PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION:'fixture-policy',selectedHairEvidenceCache:new Map(),
  portraitFetch:async(url,options,timeout)=>{requests.push({url,options,timeout});return {ok:true,blob:async()=>url.endsWith('/19.webp')?openBlob:bangsBlob}},
  portraitCompletionEvidence:async blob=>blob.evidence};
 const load=extract('async function selectedHairEvidence(','\nasync function checkPortraitCompletion(','selectedHairEvidence',env);
 assert.equal(await load('seedream-19'),open);assert.equal(await load('seedream-19'),open);
 assert.equal(requests.length,1);assert.equal(requests[0].url,PRODUCTION_HAIR_CATALOG.find(h=>h.id==='seedream-19').src);
 assert.equal(requests[0].options.cache,'force-cache');assert.equal(requests[0].timeout,8000);
 assert.equal(await load('seedream-21'),bangs);assert.equal(requests.length,2);
 assert.equal(await load('not-in-catalog'),null);assert.equal(requests.length,2);
});
await test('a strong wrong-fringe result is checked against the selected preview before dispatch and evicted',async()=>{
 const f=finishFixture({wrongHair:true});
 for(let i=0;i<2;i++)await assert.rejects(f.run(f.B,'seedream-19',{portraitMode:'female'}),error=>error.code==='selected_hairstyle_mismatch');
 assert.deepEqual(f.references,['seedream-19','seedream-19']);assert.equal(f.calls.length,2);assert.equal(f.events.length,0);
});
await test('a correct selected style still reaches delivery and retains job metadata',async()=>{
 const f=finishFixture();const result=await f.run(f.B,'seedream-19',{portraitMode:'female'});
 assert.equal(f.calls.length,1);assert.equal(result.idpromJobId,'job-1');assert.equal(result.idpromTrial,false);assert.equal(result.idpromFullEdit,true);
 assert.deepEqual(f.references,['seedream-19']);assert.equal(f.sourceChecks.length,1);assert.equal(f.events.length,1);
});
await test('the new preview guard is limited to replacement sources and does not alter initial/original paths',async()=>{
 const initial=finishFixture({wrongHair:true,sourceReplacement:false});await initial.run(initial.A,'seedream-19',{portraitMode:'female'});assert.equal(initial.references.length,0);
 const original=finishFixture({wrongHair:true});await original.run(original.B,'original',{portraitMode:'female'});assert.equal(original.references.length,0);
});
await test('unavailable optional reference preserves the existing source-hair checks',async()=>{
 const f=finishFixture({missingReference:true});await f.run(f.B,'seedream-19',{portraitMode:'female'});
 assert.equal(f.sourceChecks.length,1);assert.equal(f.events.length,1);
});
await test('A and B with identical metadata remain separate cache entries and explicit IDs remain isolated',async()=>{
 const f=finishFixture();const a=await f.run(f.A,'seedream-19',{portraitMode:'female'}),b=await f.run(f.B,'seedream-19',{portraitMode:'female'});
 assert.equal(f.calls.length,2);assert.notEqual(a.idpromJobId,b.idpromJobId);assert.equal(f.calls[1].source,f.B);
 await f.run(f.B,'seedream-07',{portraitMode:'female'});assert.equal(f.calls.length,3);
 const again=await f.run(f.A,'seedream-19',{portraitMode:'female'});assert.equal(f.calls.length,3);assert.equal(again.idpromJobId,a.idpromJobId);
});
await test('an unanchored initial result cannot be reused as an anchored replacement result',async()=>{
 const f=finishFixture({sourceReplacement:false});const first=await f.run(f.B,'seedream-19',{portraitMode:'female'});
 f.B.idpromStudioSourceReplacement=true;const second=await f.run(f.B,'seedream-19',{portraitMode:'female'});
 assert.equal(f.calls.length,2);assert.notEqual(first.idpromJobId,second.idpromJobId);
});
await test('the actual Studio upload-to-selection path commits B and preserves suit, background and accessories',async()=>{
 let uid=0,pending;
 const A=photo('source-A'),B=photo('source-B'),calls=[];
 const oldHead={id:'head-A',kind:'head',name:'หัว · คอ · ผม',jobId:'job-A',source:'pixels-A'};
 const suit={id:'suit',kind:'suit',name:'ชุด',templatePath:'female-uniform.png',x:0,y:0,scale:1,rotation:0};
 const background={id:'background',kind:'background',source:'blue'},pin={id:'pin',kind:'chest',source:'pin'};
 const env={
  ready:true,assetBusy:false,processActive:false,busy:false,hairBusy:false,W:2256,H:3072,sourcePhoto:A,firstUploadedPhotoRef:{current:A},initialFemaleMakeupRef:{current:null},
  state:{current:[background,oldHead,{id:'old-hair',kind:'hair-preview',hairHeadId:'head-A'},suit,pin]},
  preparePhotoInput:async file=>file,URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL:noop},image:async()=>({width:500,height:700}),nativeSource:()=> 'native-B',
  historySnapshot:()=>env.state.current.map(l=>({...l})),fresh:layer=>({id:'new-'+(++uid),...layer}),replaceStudioSourceLayers,
  hydrate:async layers=>{env.state.current=layers;return true},document:{createElement:()=>({getContext:()=>({drawImage:noop}),toDataURL:()=> 'compare-B'})},
  compareSourceRef:{current:'compare-A'},before:{current:null},sourceLayerRef:{current:null},receiptRequestRef:{current:0},undo:{current:[]},redo:{current:[]},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},
  hairStyleMemory:{current:{clear:noop}},youcamHairMemory:{current:{clear:noop}},pendingHairProcessRef:{current:null},touch:false,
  setSourcePhoto:value=>{env.sourcePhoto=value},setPortraitMode:value=>{env.portraitMode=value},setAssetBusy:value=>{env.assetBusy=value},setProcessHairPending:value=>{env.processHairPending=value},
  setCompareReady:noop,setComparing:noop,resetBrushSession:noop,setSelected:noop,setTool:noop,setProcessReceipt:noop,setSelectedHair:noop,setFemaleFinishChoiceOpen:noop,setPortraitChoiceOpen:noop,setHairConfirmed:noop,setRevision:noop,setStatus:noop,
  canRestoreHair:()=>false,paidHairAccess:true,trialHairRemaining:2,isTrialHairAllowed:()=>true,onRequestUnlock:noop,appearanceFailure:()=>{throw Error('unexpected appearance failure')},trackHairSelection:noop,hairGender:'female',portraitMode:'female',processRequestRef:{current:false},processHairPending:false,canReuseHair:()=>false,
  applyHair:()=>{throw Error('new source cannot use old-head hairstyle path')},layerKind:l=>l.kind,
  mounted:{current:true},setPortraitProcessError:message=>{if(message)throw Error(message)},checkProcessCredits:async()=>true,setPicker:noop,setHairNotice:noop,placementRef:{current:{}},setProcessingPhoto:noop,
  isProcessCancelled:()=>false,portraitFinishChoice:()=> 'makeup',onFinishProcess:async success=>calls.push({finished:success}),sessionUnlockedJobs:{current:new Set()},trackPhotoType:noop,reportProcessedResult:noop,
  studioPhotoTransactionRef:{current:false},setBusy:value=>{env.busy=value},beginProgress:noop,
  aiFinishPortrait:async(file,id,options)=>{calls.push({file,id,mode:options.portraitMode});return Object.assign(new Blob(['B output']),{idpromJobId:'job-B',idpromTrial:false,idpromFullEdit:true})},
  finishFirstPortraitMaster:async value=>value,composePortrait:async()=>({lock:{templatePath:'female-uniform.png'}}),renderAdjustedFinal:async(...args)=>args.at(-1).push({name:'หัว · คอ · ผม',source:'generated-B'}),assertProcessActive:noop,backgroundRef:{current:'blue'},HAIR_DESIGN_VERSION:'fixture-policy',
  setF:noop,editCache:{current:{master:'A-master'}},initialProcessedMasterRef:{current:'A-master'},currentOutputJobRef:{current:'job-A'},currentOutputTrialRef:{current:false},studioTrialRef:{current:false},setOutputJobId:noop,setTrialPreview:noop,setLiveCanvasVisible:noop,
  liveAdjustRef:{current:{}},setHeadAdjust:noop,liveCollarWarpRef:{current:0},setCollarWarp:noop,liveCollarHeightRef:{current:0},setCollarHeight:noop,liveNeckAdjustRef:{current:{}},setNeckAdjust:noop,setPlacementLocked:noop,lockedPlacementRef:{current:null},lockedMasterRef:{current:null},
  hairResultCacheRef:{current:new Map([['old','old-A']])},preparedHairBaseRef:{current:null},lastHairDonorRef:{current:null},cleanHairBaseRef:{current:null},initialStyledHairRef:{current:null},studioHairOriginRef:{current:'old'},setHairId:noop,rememberHairResult:()=>({}),window:{dispatchEvent:noop},CustomEvent:class{}
 };
 Object.assign(env,{isFreeFemaleHair,hasFreeHair:()=>false,applyFreeHair:()=>{throw Error('paid second-upload fixture must not use local hair')},showFreeHairNotice:()=>{throw Error('paid second-upload fixture must not use the free-hair guard')}});
 const from=(source,start,end,name)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,name);return new Function('env',`with(env){${source.slice(a,b)};return ${name}}`)(env)};
 env.onProcessPhoto=from(main," const processStudioPhoto=async(file,template,selectedHair='',portraitMode)=>{",'\n const applyStudioMakeup=','processStudioPhoto');
 const process=from(editor,' const processPhoto=async(options={})=>{','\n useEffect','processPhoto');
 env.processPhoto=options=>(pending=process(options));
 const add=from(editor,' const addSourcePhoto=async file=>{','\n useEffect','addSourcePhoto');
 const choose=from(editor,' const chooseHair=id=>{','\n\n useEffect','chooseHair');
 await add(B);assert.equal(env.sourcePhoto,B);assert.equal(env.firstUploadedPhotoRef.current,A);
 assert(!env.state.current.some(l=>l.id==='head-A'||l.id==='old-hair'));
 env.portraitMode='female';B.idpromFemaleEyeStyle='makeup';choose('seedream-19');await pending;
 const request=calls.find(c=>c.file);assert.equal(request.file,B);assert.equal(request.id,'seedream-19');
 assert.equal(env.firstUploadedPhotoRef.current,B);assert.equal(env.currentOutputJobRef.current,'job-B');assert(!env.hairResultCacheRef.current.has('old'));
 assert.deepEqual(env.state.current.filter(l=>['suit','pin','background'].includes(l.id)),[background,suit,pin]);
 assert.equal(env.state.current.find(l=>l.kind==='head').hairId,'seedream-19');
 assert.equal(calls.filter(c=>c.finished===true).length,1);
});
console.log(`PASS: ${passed} second-upload request and completion contract scenarios; AI, landmarks and transport mocked; no live generation or financial writes.`);
