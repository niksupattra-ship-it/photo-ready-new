import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAiResultCache,resultSourceDigest} from '../src/ai-result-cache.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';

// Actual client functions; decoded pixels, codecs and network are mocked.
// These cases verify guide provenance and request/transaction boundaries,
// not the quality of a generated portrait or real-provider colour matching.
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
function extract(start,end,name,env){
 const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a,`missing ${name}`);
 return new Function('env',`with(env){${main.slice(a,b)};return ${name}}`)(env);
}
const noop=()=>{};
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS: '+name)}
const jpeg=value=>'data:image/jpeg;base64,'+Buffer.from(value).toString('base64');
const guideA=jpeg('accepted initial rose makeup A'),guideB=jpeg('accepted initial rose makeup B');
const photo=(value,style='makeup')=>Object.assign(new File([value],'portrait.jpg',{type:'image/jpeg'}),{idpromFemaleEyeStyle:style,idpromPortraitMode:'female'});
const validator=extract('function validateFemaleMakeupReference(','\nasync function aiFinishPortrait(','validateFemaleMakeupReference',{});

function guideFixture({missingMask=false,missingFace=false}={}){
 const masters={A:Object.assign(new Blob(['accepted-A']),{fixtureName:'A',fixtureColor:[183,91,111]}),B:Object.assign(new Blob(['accepted-B']),{fixtureName:'B',fixtureColor:[202,112,131]})};
 const decoded=[],segmented=[],encoded=[];let failMask=missingMask;
 const face=[];for(const [id,x,y] of [[33,.35,.4],[263,.65,.4],[152,.5,.8],[70,.35,.32],[300,.65,.32],[105,.4,.33],[334,.6,.33]])face[id]={x,y};
 const env={
  femaleMakeupGuideCache:new WeakMap(),femaleMakeupMasterKeys:new WeakMap(),femaleMakeupMasterSequence:0,
  decodedPortraitImage:async master=>{decoded.push(master);return {master,naturalWidth:1200,naturalHeight:1600}},
  getLandmarker:async()=>({detect:()=>({faceLandmarks:missingFace?[]:[face]})}),
  getV192MasterMasks:async master=>{segmented.push(master);return {hairMask:failMask?null:{fixtureHair:true,master}}},
  canvasFor:(width,height)=>{
   const canvas={width,height,image:null,frame:null};
   canvas.getContext=()=>({fillRect:noop,drawImage:source=>{canvas.image=source},getImageData:()=>{
    const data=new Uint8ClampedArray(width*height*4);
    if(canvas.image.fixtureHair)data[3]=255;
    else for(let i=0;i<data.length;i+=4){data.set(canvas.image.master.fixtureColor,i);data[i+3]=255}
    return {data};
   },putImageData:frame=>{canvas.frame=frame}});
   canvas.toDataURL=(mime,quality)=>{
    assert.equal(mime,'image/jpeg');assert.equal(quality,.9);encoded.push(canvas);
    return jpeg(JSON.stringify({master:canvas.image.master.fixtureName,colour:[...canvas.frame.data.subarray(4,7)]}));
   };
   return canvas;
  }
 };
 const crop=extract('async function femaleMakeupReference(','\nfunction validateFemaleMakeupReference(','femaleMakeupReference',env);
 const key=extract('function femaleMakeupReferenceKey(','\nasync function femaleMakeupReference(','femaleMakeupReferenceKey',env);
 return {masters,decoded,segmented,encoded,crop,key,recoverMask:()=>{failMask=false}};
}
await test('the makeup guide comes from the accepted master, is bounded, masks hair and caches per immutable master',async()=>{
 const f=guideFixture(),one=await f.crop(f.masters.A),again=await f.crop(f.masters.A),other=await f.crop(f.masters.B);
 assert.equal(one,again);assert.notEqual(one,other);assert.deepEqual(f.decoded,[f.masters.A,f.masters.B]);assert.deepEqual(f.segmented,[f.masters.A,f.masters.B]);
 assert.equal(f.encoded.length,2);
 for(const canvas of f.encoded){assert(Math.max(canvas.width,canvas.height)<=512);assert.deepEqual([...canvas.frame.data.subarray(0,4)],[213,213,213,255]);assert.deepEqual([...canvas.frame.data.subarray(4,7)],canvas.image.master.fixtureColor)}
 assert(one.length<512*1024);assert.equal(validator(one),one);
 assert.equal(f.key(f.masters.A),f.key(f.masters.A));assert.notEqual(f.key(f.masters.A),f.key(f.masters.B));
});
await test('missing guide masks or face never falls back to the raw photo and a mask failure can retry',async()=>{
 const masked=guideFixture({missingMask:true});await assert.rejects(masked.crop(masked.masters.A));assert.equal(masked.encoded.length,0);
 masked.recoverMask();await masked.crop(masked.masters.A);assert.equal(masked.decoded.length,2);assert.equal(masked.encoded.length,1);
 const faceless=guideFixture({missingFace:true});await assert.rejects(faceless.crop(faceless.masters.A));assert.equal(faceless.encoded.length,0);
});

function requestFixture(){
 const source=photo('untouched source A'),requests=[],saved=[],polls=[];
 const env={
  PRODUCTION_HAIR_CATALOG,validateFemaleMakeupReference:validator,activeProcessOperation:{cancelled:false},acceptedPaidTrial:false,
  assertProcessActive:operation=>{if(operation?.cancelled)throw Error('cancelled')},
  levelPortraitCutout:async file=>file,saveAiJobFile:async file=>saved.push(file),walletHeaders:()=>({'X-Wallet-Id':'fixture-wallet'}),
  portraitFetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({jobId:'fixture-job-'+requests.length,trialPreview:false})}},
  waitForAiJob:async job=>{polls.push(job);return Object.assign(new Blob([job]),{idpromJobId:job,idpromTrial:false,idpromFullEdit:true})},
  writeActiveAiJob:noop,warmPortraitResources:noop,analyticsTagError:error=>error,settleProcessOperation:async()=>{throw Error('request must not settle a second time')},window:{dispatchEvent:noop},Event:class{}
 };
 const run=extract('async function aiFinishPortraitUncached(','\n// V206:','aiFinishPortraitUncached',env);
 return {source,requests,saved,polls,env,run};
}
await test('female makeup hairstyle requests send raw source pixels plus the accepted makeup guide in one job',async()=>{
 const f=requestFixture();await f.run(f.source,'seedream-21',{portraitMode:'female',femaleEyeStyle:'makeup',creditKind:'hairstyle',femaleMakeupReference:guideA});
 assert.equal(f.requests.length,1);const fd=f.requests[0].options.body;
 assert.deepEqual(new Uint8Array(await fd.get('image').arrayBuffer()),new Uint8Array(await f.source.arrayBuffer()));
 assert.equal(fd.get('hairId'),'seedream-21');assert.equal(fd.get('femaleEyeStyle'),'makeup');assert.equal(fd.get('creditKind'),'hairstyle');assert.equal(fd.get('femaleMakeupReference'),guideA);
 assert.equal(f.saved[0],f.source);assert.equal(f.polls.length,1);
});
await test('natural, male and first processing requests do not attach the makeup guide',async()=>{
 for(const options of [
  {hair:'seedream-21',portraitMode:'female',femaleEyeStyle:'natural',creditKind:'hairstyle'},
  {hair:'seedream-35',portraitMode:'male',femaleEyeStyle:'makeup',creditKind:'hairstyle'},
  {hair:'seedream-19',portraitMode:'female',femaleEyeStyle:'makeup'}
 ]){
  const f=requestFixture();await f.run(f.source,options.hair,{...options,femaleMakeupReference:guideA});
  assert.equal(f.requests[0].options.body.has('femaleMakeupReference'),false);
 }
});
await test('malformed or oversized eligible guides fail before a paid job is submitted',async()=>{
 for(const femaleMakeupReference of ['bad-reference','data:image/png;base64,AAAA','data:image/jpeg;base64,'+'A'.repeat(512*1024)]){
  const f=requestFixture();await assert.rejects(f.run(f.source,'seedream-21',{portraitMode:'female',femaleEyeStyle:'makeup',creditKind:'hairstyle',femaleMakeupReference}));
  assert.equal(f.requests.length,0);assert.equal(f.polls.length,0);assert.equal(f.saved.length,0);
 }
});

function finishFixture(){
 const source=photo('untouched source A'),calls=[],keys=[],events=[],cache=createAiResultCache();
 const env={
  PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION,validateFemaleMakeupReference:validator,activeProcessOperation:{cancelled:false},
  assertProcessActive:operation=>{if(operation?.cancelled)throw Object.assign(Error('cancelled'),{code:'USER_CANCELLED'})},cancelledProcessError:()=>Object.assign(Error('cancelled'),{code:'USER_CANCELLED'}),
  currentResultCacheScope:()=> 'fixture-wallet',resultSourceDigest,
  portraitResultCache:{...cache,get:(key,generate)=>{keys.push(key);return cache.get(key,generate)}},
  aiFinishPortraitUncached:async(file,hair,options)=>{calls.push({file,hair,options});return Object.assign(new Blob([hair]),{idpromJobId:'job-'+calls.length,idpromTrial:false,idpromFullEdit:true})},
  cleanPortraitClothing:async value=>value,checkPortraitProportions:async()=>{},checkPortraitCompletion:async()=>{},verifyOutputRights:async()=>({checked:true,unlocked:true,fullEdit:true}),saveAiJobFile:async()=>{},writeActiveAiJob:noop,
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},window:{dispatchEvent:event=>events.push(event)}
 };
 const run=extract('async function aiFinishPortrait(','\nlet acceptedPaidTrial=','aiFinishPortrait',env);
 return {source,calls,keys,events,env,run};
}
await test('guide colours participate in the actual result-cache key and reach the generation unchanged',async()=>{
 const f=finishFixture(),opts={portraitMode:'female',femaleEyeStyle:'makeup',creditKind:'hairstyle'};
 await f.run(f.source,'seedream-21',{...opts,femaleMakeupReference:guideA});
 await f.run(f.source,'seedream-21',{...opts,femaleMakeupReference:guideB});
 assert.notEqual(f.keys[0],f.keys[1]);assert.equal(f.calls[0].options.femaleMakeupReference,guideA);assert.equal(f.calls[1].options.femaleMakeupReference,guideB);
 assert(f.calls.every(call=>call.file===f.source));
});
await test('the top-level pipeline strips an irrelevant guide instead of applying it to natural or male portraits',async()=>{
 for(const [hair,options] of [['seedream-21',{portraitMode:'female',femaleEyeStyle:'natural',creditKind:'hairstyle'}],['seedream-35',{portraitMode:'male',femaleEyeStyle:'makeup',creditKind:'hairstyle'}],['seedream-19',{portraitMode:'female',femaleEyeStyle:'makeup'}]]){
  const f=finishFixture();await f.run(f.source,hair,{...options,femaleMakeupReference:'irrelevant invalid guide'});assert.equal(f.calls[0].options.femaleMakeupReference,null);
 }
});
await test('a cancelled guide-conditioned result never dispatches delivery',async()=>{
 const f=finishFixture();f.env.aiFinishPortraitUncached=async()=>{f.env.activeProcessOperation.cancelled=true;return Object.assign(new Blob(['cancelled']),{idpromJobId:'cancelled-job'})};
 await assert.rejects(f.run(f.source,'seedream-21',{portraitMode:'female',femaleEyeStyle:'makeup',creditKind:'hairstyle',femaleMakeupReference:guideA}),error=>error.code==='USER_CANCELLED');assert.equal(f.events.length,0);
});

function appFixture(){
 const A=photo('untouched-source-A'),B=photo('untouched-source-B'),masterA=new Blob(['accepted first makeup A']),masterB=new Blob(['accepted first makeup B']);
 const calls=[],guideSources=[],settled=[],events=[],messages=[];
 const cancel=()=>Object.assign(Error('cancelled'),{code:'USER_CANCELLED'});
 const env={
  PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION,portraitFinishChoice,
  activeProcessOperation:{cancelled:false},busy:false,hairBusy:false,privateTrialActive:false,rights:{generationRemaining:10},isTrialHairAllowed:()=>true,
  firstUploadedPhotoRef:{current:A},initialFemaleMakeupRef:{current:null},initialProcessedMasterRef:{current:null},editCache:{current:{master:null,lock:{templatePath:'female.png'}}},
  studioPhotoTransactionRef:{current:false},hairRequestRef:{current:false},hairResultCacheRef:{current:new Map()},
  currentOutputJobRef:{current:'prior-job'},currentOutputTrialRef:{current:false},studioTrialRef:{current:false},
  liveAdjustRef:{current:{x:0,y:0,scale:1}},liveCollarWarpRef:{current:0},liveCollarHeightRef:{current:0},liveNeckAdjustRef:{current:{width:0,length:0}},backgroundRef:{current:'blue'},
  lockedPlacementRef:{current:null},lockedMasterRef:{current:null},preparedHairBaseRef:{current:null},lastHairDonorRef:{current:null},cleanHairBaseRef:{current:null},initialStyledHairRef:{current:null},studioHairOriginRef:{current:''},
  setBusy:busy=>{env.busy=busy},setHairBusy:busy=>{env.hairBusy=busy},setHairGenerating:noop,setMsg:message=>messages.push(message),setBuyOpen:()=>{throw Error('unexpected purchase')},
  beginProgress:()=>{env.activeProcessOperation={cancelled:false,jobId:null}},assertProcessActive:(operation=env.activeProcessOperation)=>{if(operation?.cancelled)throw cancel()},cancelledProcessError:cancel,
  aiFinishPortrait:async(source,id,options)=>{
   calls.push({source,id,options});const master=options.creditKind==='hairstyle'?new Blob(['changed hair '+id+' '+calls.length]):source===A?masterA:masterB;
   return Object.assign(master,{idpromJobId:'job-'+calls.length,idpromTrial:false,idpromFullEdit:true});
  },
  femaleMakeupReference:async master=>{guideSources.push(master);assert(master===masterA||master===masterB,'guide must use an initial accepted master');return master===masterA?guideA:guideB},
  femaleMakeupReferenceKey:master=>master===masterA?'master-A':master===masterB?'master-B':'other-master',
  currentResultCacheScope:()=> 'fixture-wallet',privateTrialRequested:()=>false,verifyOutputRights:async()=>({checked:true,unlocked:true,fullEdit:true}),
  finishFirstPortraitMaster:async master=>master,composePortrait:async()=>({lock:{templatePath:'female.png'}}),
  renderAdjustedFinal:async(...args)=>args.at(-1).push({name:'หัว · คอ · ผม',source:args[0]}),fitChangedHairMaster:async()=>({templatePath:'female.png'}),finishProgress:async success=>settled.push(success),
  setProgressStage:noop,beginOptionRender:noop,activeUniformTemplate:'female.png',setF:noop,setOutputJobId:noop,setTrialPreview:noop,setLiveCanvasVisible:noop,setHeadAdjust:noop,setCollarWarp:noop,setCollarHeight:noop,setNeckAdjust:noop,setPlacementLocked:noop,setHairId:noop,
  window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}}
 };
 const a=main.indexOf(' const hairResultMode='),b=main.indexOf(' const changeHair=async',a);assert(a>=0&&b>a);
 const memory=new Function('env',`with(env){${main.slice(a,b)};return {rememberHairResult,cachedHairResult,canReuseHair,hairResultMode,hairResultKey}}`)(env);Object.assign(env,memory);
 env.changeHairForStudio=extract(' const changeHairForStudio=async (','\n const downloadHairDonor=','changeHairForStudio',env);
 const process=extract(" const processStudioPhoto=async(file,template,selectedHair='',portraitMode)=>{",'\n const applyStudioMakeup=','processStudioPhoto',env);
 const change=extract(' const changeStudioHair=async(id,portraitMode,femaleEyeStyle)=>{',"\n if(screen==='home')",'changeStudioHair',env);
 const commit=async staged=>{assert(staged);if(!staged.reused)await env.finishProgress(true);staged.commit();return staged};
 return {A,B,masterA,masterB,env,calls,guideSources,settled,events,messages,memory,process,change,commit};
}
await test('initial makeup19 then hair21 and hair03 use the same accepted guide while source input stays raw',async()=>{
 const f=appFixture();await f.commit(await f.process(f.A,'female.png','seedream-19','female'));
 assert.equal(f.calls[0].options.femaleMakeupReference,undefined);assert.equal(f.env.initialFemaleMakeupRef.current.source,f.A);assert.equal(f.env.initialFemaleMakeupRef.current.master,f.masterA);
 await f.commit(await f.change('seedream-21','female','makeup'));await f.commit(await f.change('seedream-03','female','makeup'));
 assert.equal(f.calls.length,3);assert(f.calls.every(call=>call.source===f.A));
 assert.deepEqual(f.guideSources,[f.masterA,f.masterA]);
 for(const call of f.calls.slice(1)){assert.equal(call.options.femaleEyeStyle,'makeup');assert.equal(call.options.femaleMakeupReference,guideA);assert.equal(call.options.creditKind,'hairstyle')}
 assert.equal(f.env.initialFemaleMakeupRef.current.master,f.masterA);assert.notEqual(f.env.editCache.current.master,f.masterA);
 assert.equal(await f.A.text(),'untouched-source-A');
});
await test('B first processing receives no A guide and only B commit binds B makeup for its later hairstyles',async()=>{
 const f=appFixture();await f.commit(await f.process(f.A,'female.png','seedream-19','female'));await f.commit(await f.change('seedream-21','female','makeup'));
 const old=f.env.initialFemaleMakeupRef.current,staged=await f.process(f.B,'female.png','seedream-19','female');
 assert.equal(f.env.initialFemaleMakeupRef.current,old);assert.equal(f.calls.at(-1).source,f.B);assert.equal(f.calls.at(-1).options.femaleMakeupReference,undefined);
 await f.commit(staged);assert.equal(f.env.initialFemaleMakeupRef.current.source,f.B);assert.equal(f.env.initialFemaleMakeupRef.current.master,f.masterB);
 await f.commit(await f.change('seedream-03','female','makeup'));assert.equal(f.calls.at(-1).source,f.B);assert.equal(f.calls.at(-1).options.femaleMakeupReference,guideB);assert.equal(f.guideSources.at(-1),f.masterB);
});
await test('natural or male initial commits clear the makeup anchor and later changes attach no guide',async()=>{
 for(const [mode,style,firstHair,nextHair] of [['female','natural','seedream-19','seedream-21'],['male','natural','seedream-35','seedream-28']]){
  const f=appFixture();f.B.idpromFemaleEyeStyle=style;await f.commit(await f.process(f.B,mode+'.png',firstHair,mode));assert.equal(f.env.initialFemaleMakeupRef.current,null);
  await f.commit(await f.change(nextHair,mode,style));assert.equal(f.calls.at(-1).options.femaleMakeupReference,undefined);assert.equal(f.guideSources.length,0);
 }
});
await test('confirmed hair reuse keeps rights checks and avoids a new guide or AI job',async()=>{
 const f=appFixture();await f.commit(await f.process(f.A,'female.png','seedream-19','female'));await f.commit(await f.change('seedream-21','female','makeup'));
 const count=f.calls.length,guides=f.guideSources.length,settled=f.settled.length,job=f.env.currentOutputJobRef.current;
 const reused=await f.change('seedream-21','female','makeup');assert.equal(reused.reused,true);await f.commit(reused);
 assert.equal(f.calls.length,count);assert.equal(f.guideSources.length,guides);assert.equal(f.settled.length,settled);assert.equal(f.env.currentOutputJobRef.current,job);
});
await test('changing the accepted guide invalidates only previously cached results for that makeup appearance',async()=>{
 const f=appFixture();await f.commit(await f.process(f.A,'female.png','seedream-19','female'));await f.commit(await f.change('seedream-21','female','makeup'));
 assert(f.memory.cachedHairResult('seedream-21','female'));const oldKey=f.memory.hairResultKey('seedream-21','female');
 f.env.initialFemaleMakeupRef.current={source:f.A,master:f.masterB};
 assert.notEqual(f.memory.hairResultKey('seedream-21','female'),oldKey);assert.equal(f.memory.cachedHairResult('seedream-21','female'),null);
 f.env.initialFemaleMakeupRef.current={source:f.B,master:f.masterB};assert.equal(f.memory.cachedHairResult('seedream-21','female'),null);
});
await test('guide failure or cancellation before generation preserves current image, anchor and job rights',async()=>{
 for(const kind of ['failure','cancel']){
  const f=appFixture();await f.commit(await f.process(f.A,'female.png','seedream-19','female'));const previous={master:f.env.editCache.current.master,anchor:f.env.initialFemaleMakeupRef.current,job:f.env.currentOutputJobRef.current};
  f.env.femaleMakeupReference=async()=>{if(kind==='cancel'){f.env.activeProcessOperation.cancelled=true;return guideA}throw Error('guide unavailable')};
  await assert.rejects(f.change('seedream-21','female','makeup'));
  assert.equal(f.calls.length,1);assert.equal(f.env.editCache.current.master,previous.master);assert.equal(f.env.initialFemaleMakeupRef.current,previous.anchor);assert.equal(f.env.currentOutputJobRef.current,previous.job);assert.equal(f.settled.at(-1),false);
 }
});
await test('a stale guide cannot reach generation after source or anchor replacement',async()=>{
 for(const mutation of ['source','anchor']){
  const f=appFixture();await f.commit(await f.process(f.A,'female.png','seedream-19','female'));let release,started;
  const entered=new Promise(resolve=>{started=resolve});f.env.femaleMakeupReference=()=>{started();return new Promise(resolve=>{release=resolve})};
  const pending=f.change('seedream-21','female','makeup');await entered;
  if(mutation==='source')f.env.firstUploadedPhotoRef.current=f.B;else f.env.initialFemaleMakeupRef.current={source:f.A,master:f.masterB};
  release(guideA);await assert.rejects(pending);assert.equal(f.calls.length,1);assert.equal(f.settled.at(-1),false);
 }
});

console.log(`PASS: ${passed} makeup/hair retention scenarios; request, Canvas and AI mocked; no paid generation or financial writes.`);
