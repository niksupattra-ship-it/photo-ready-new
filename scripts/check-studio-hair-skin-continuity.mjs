import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {replaceHairstyleLayer} from '../src/replace-hairstyle-layer.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {mixMakeupLookSources} from '../src/makeup-look-tools.js';
import {makeupLook} from '../makeup-presets.js';
import {HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';

// Run the production editor handlers and intensity mixer. Image codecs, native
// analysis, the local skin renderer and AI jobs are deterministic doubles.
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
function extract(code,start,end,name,env){
 const a=code.indexOf(start),b=code.indexOf(end,a);assert(a>=0&&b>a,`missing ${name}`);
 return new Function('env',`with(env){${code.slice(a,b)};return ${name}}`)(env);
}
let sequence=0,passed=0;
const encoded=new Map(),noop=()=>{};
class Surface{
 constructor(pixels=[180,120,100,255,22,19,18,255,0,0,0,0]){this.width=3;this.height=1;this.pixels=new Uint8ClampedArray(pixels)}
 getContext(){return {
  drawImage:source=>{this.pixels=new Uint8ClampedArray(source.pixels)},
  getImageData:()=>({data:new Uint8ClampedArray(this.pixels)}),
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  putImageData:value=>{this.pixels=new Uint8ClampedArray(value.data)}
 }}
 toDataURL(){const url='data:image/png;base64,'+Buffer.from('surface-'+(++sequence)).toString('base64');encoded.set(url,this);return url}
}
globalThis.HTMLCanvasElement=Surface;
globalThis.document={createElement:()=>new Surface()};
globalThis.Image=class{
 set src(value){const surface=encoded.get(value);if(!surface){queueMicrotask(()=>this.onerror?.());return}this.width=this.naturalWidth=surface.width;this.height=this.naturalHeight=surface.height;this.pixels=surface.pixels;queueMicrotask(()=>this.onload?.())}
};
const imageOf=source=>typeof source==='string'?encoded.get(source):source;
const pixelsOf=source=>[...imageOf(source).pixels];
const source=value=>new Surface([value,120,100,255,22,19,18,255,0,0,0,0]).toDataURL();
const profile=Object.freeze({version:1,fixture:'immutable first finish'});
const reference='data:image/jpeg;base64,'+Buffer.from('immutable first finish guide').toString('base64');
const recipe='skin-smooth-v1';
async function test(name,run){await run();passed++;console.log('PASS: '+name)}
function fixture(options={}){
 const events=[],jobs=[],local=[],analyses=[],blends=[],settled=[],stages=[],cache=new Map(),errors=[];
 const oldBase=source(170),oldVisible=source(177);
 const head={id:'head',kind:'head',name:'หัว · คอ · ผม',source:oldVisible,processedOriginalSource:oldBase,hairId:'seedream-19',hairPolicyVersion:HAIR_DESIGN_VERSION,portraitMode:'female',initialFemaleEyeStyle:'makeup',femaleEyeStyle:'makeup',femaleFinishProfile:profile,femaleFinishReference:reference,makeupBaseSource:oldBase,makeupStyles:{look:recipe},makeupIntensity:37,makeupRenderVersion:'skin-current-layer-v2',mask:'old erased face mask',warpSource:'old warped face',warpBaseMask:'old warp mask',eraseRestoreSource:'old erase pixels',warpRestoreBase:'old warp pixels',x:18,y:-12,scale:1.2,squeezeX:1.2,squeezeY:.9,rotation:4,visible:true,locked:false,opacity:.85,jobId:'old-paid',restrictedTrial:false,outputUnlocked:true,...options.head};
 const unrelated=[{id:'suit',kind:'suit',source:'protected outfit',locked:true,mask:'suit mask'},{id:'background',kind:'background',source:'protected background'},{id:'collar',kind:'collar',source:'protected collar'},{id:'other-head',kind:'head',source:'protected other portrait'},{id:'other-hair',kind:'hair-preview',hairHeadId:'other-head',source:'protected other hair'}];
 const previous=[unrelated[1],{id:'old-rear',kind:'hair-back',hairHeadId:'head',source:'old long rear hair'},head,{id:'old-front',kind:'hair-preview',hairHeadId:'head',source:'old fringe'},{id:'old-descendant',kind:'hair-preview',hairHeadId:'old-rear',source:'old linked edge'},unrelated[0],...unrelated.slice(2)];
 const env={processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,state:{current:previous},mounted:{current:true},hairGender:options.hairGender||'female',portraitMode:head.portraitMode,sourcePhoto:{idpromFemaleEyeStyle:options.sourceFinish||'makeup'},HAIR_DESIGN_VERSION,portraitFinishChoice,replaceHairstyleLayer,makeupLook,layerKind:l=>l.kind,
  surfaceURL:src=>src instanceof Surface?src.toDataURL():src,
  headPose:l=>({x:l.x,y:l.y,scale:l.scale,rotation:l.rotation}),flushTransforms:noop,historySnapshot:()=>env.state.current,
  canRestoreHair:id=>cache.has(id),onBeforeProcess:noop,checkProcessCredits:async()=>{events.push('credits');return options.creditAllowed!==false},
  isProcessCancelled:()=>Boolean(env.cancelled),
  onChangeHair:async(id,gender,finish)=>{
   events.push('hair');if(!cache.has(id)){jobs.push({id,gender,finish});cache.set(id,Object.freeze({source:source(190+jobs.length),sourceFrame:{x:10,y:20,w:780,h:1120},hairId:id,portraitMode:gender,initialFemaleEyeStyle:finish,femaleEyeStyle:finish,jobId:'job-'+id,restrictedTrial:options.trial===true,outputUnlocked:options.trial!==true,...options.resultMetadata}))}
   const layer=cache.get(id),reused=stages.some(stage=>stage.layer===layer&&stage.committed);
   const stage={layer,reused,commit:()=>{events.push('commit');if(options.commitFails)throw Error('stale source or anchor');stage.committed=true},rollback:()=>{events.push('rollback');stage.rolledBack=true}};stages.push(stage);return stage;
  },
  hydrate:async(next,unchanged)=>{events.push('hydrate');if(options.hydrateFails&&!env.hydrateFailed){env.hydrateFailed=true;return false}env.state.current=next;if(next!==previous&&options.cancelAfterHydrate)env.cancelled=true;env.unchanged=unchanged;return true},
  onFinishProcess:async success=>{events.push(success?'settle true':'settle false');settled.push(success);if(success&&options.confirmFails)throw Error('confirmation failed')},
  appearanceFailure:(kind,message)=>errors.push({kind,message}),
  mixMakeupLookSources:async(base,full,intensity)=>{blends.push({base,full,intensity});return mixMakeupLookSources(base,full,intensity)},
  undo:{current:[]},redo:{current:[]},touch:false,reportProcessedResult:noop,
  makeupRequestRef:{current:false},makeupOperationRef:{current:null},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},cancelMakeupPreview:noop,startMakeupProgress:noop,stopMakeupProgress:noop,finishMakeupProgress:async()=>{},assets:{current:new Map()},image:async src=>imageOf(src),drawNow:noop
 };
 for(const key of ['setAppearanceError','setAssetBusy','setStatus','resetBrushSession','setSelected','setSelectedHair','setHairConfirmed','setHairNotice','setRevision','setTool','setComparing','trackHairSelection','setMakeupCancelled','setMakeupBusy','setMakeupIntensity'])env[key]=noop;
 const requestEnv={makeupLook,
  prepareStudioMakeup:async base=>{analyses.push(base);return {original:imageOf(base),face:{newSource:base},hairMask:{newSource:base},skinMask:{newSource:base}}},
  renderLocalSkin:async({original,face,hairMask,skinMask,lookId})=>{
   assert.equal(face.newSource,hairMask.newSource);assert.equal(face.newSource,skinMask.newSource);assert.equal(original,imageOf(face.newSource));
   local.push({base:face.newSource,lookId});events.push('local');
   if(options.localFails)throw Error('native skin analysis failed');
   if(options.cancelDuringLocal)env.cancelled=true;
   const full=new Surface(original.pixels);for(let c=0;c<3;c++)full.pixels[c]+=10;return full;
  }
 };
 const localRequest=extract(main,'async function requestStudioMakeupUncached(','\nfunction opaqueBounds(','requestStudioMakeupUncached',requestEnv);
 env.onMakeup=(base,styles)=>localRequest(base,styles);
 env.commitMakeupSource=extract(editor,' const commitMakeupSource=','\n const applyMakeup=','commitMakeupSource',env);
 const apply=extract(editor,' const applyHair=async','\n const commitMakeupSource=','applyHair',env);
 const intensity=extract(editor,' const applyMakeupIntensity=','\n const restoreMakeup=','applyMakeupIntensity',env);
 const restore=extract(editor,' const restoreMakeup=','\n const scrollCatalog=','restoreMakeup',env);
 return {env,previous,head,unrelated,apply,intensity,restore,events,jobs,local,analyses,blends,settled,stages,errors,cache,current:()=>env.state.current.find(l=>l.id==='head')};
}

await test('a new female makeup hairstyle reapplies the current local recipe once at its saved intensity',async()=>{
 const f=fixture();await f.apply('seedream-20');const head=f.current(),stage=f.stages[0];
 assert.equal(f.errors.length,0);assert.equal(f.jobs.length,1);assert.equal(f.local.length,1);assert.equal(f.blends.length,1);
 assert.equal(f.local[0].base,stage.layer.source);assert.notEqual(f.local[0].base,f.head.source);assert.notEqual(f.local[0].base,f.head.makeupBaseSource);assert.deepEqual(f.analyses,[stage.layer.source]);
 assert.equal(head.makeupBaseSource,stage.layer.source);assert.equal(head.processedOriginalSource,stage.layer.source);assert.equal(head.makeupCleanBaseSource,stage.layer.source);assert.deepEqual(head.makeupStyles,{look:recipe});assert.equal(head.makeupIntensity,37);assert.equal(head.makeupRenderVersion,'skin-current-layer-v2');assert(head.makeupFullSource instanceof Surface);
 assert.deepEqual(pixelsOf(head.source),[195,124,104,255,22,19,18,255,0,0,0,0]);assert.deepEqual(pixelsOf(stage.layer.source),[191,120,100,255,22,19,18,255,0,0,0,0]);
 assert.equal(head.femaleFinishProfile,profile);assert.equal(head.femaleFinishReference,reference);assert.equal(head.x,18);assert.equal(head.y,-12);assert.equal(head.scale,1.2);assert.equal(head.rotation,4);assert.equal(head.opacity,.85);assert.equal(head.squeezeX,1);assert.equal(head.squeezeY,1);assert.deepEqual(head.sourceFrame,stage.layer.sourceFrame);
 for(const key of ['mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'])assert.equal(head[key],null);
 assert(!f.env.state.current.some(l=>['old-front','old-rear','old-descendant'].includes(l.id)));
 for(const layer of f.unrelated){assert.equal(f.env.state.current.find(l=>l.id===layer.id),layer);assert(f.env.unchanged.has(layer.id))}
 assert.deepEqual(f.settled,[true]);assert(f.events.indexOf('hydrate')<f.events.indexOf('settle true'));assert(f.events.indexOf('settle true')<f.events.indexOf('commit'));assert.equal(f.env.undo.current[0],f.previous);
});
await test('cached hairstyle masters stay clean and reuse reapplies the current recipe without AI or credits',async()=>{
 const f=fixture();await f.apply('seedream-20');await f.apply('seedream-22');
 const cached=f.cache.get('seedream-20'),pixels=pixelsOf(cached.source),creditChecks=f.events.filter(e=>e==='credits').length;
 f.env.state.current=f.env.state.current.map(l=>l.id==='head'?{...l,makeupIntensity:64}:l);
 await f.apply('seedream-20');const head=f.current();
 assert.equal(f.errors.length,0);assert.equal(f.jobs.length,2);assert.equal(f.local.length,3);assert.equal(f.blends.length,3);assert.equal(f.events.filter(e=>e==='credits').length,creditChecks);assert.deepEqual(f.settled,[true,true]);assert.equal(f.stages[2].reused,true);
 assert.equal(f.cache.get('seedream-20'),cached);assert.deepEqual(pixelsOf(cached.source),pixels);assert.equal(head.makeupBaseSource,cached.source);assert.equal(head.processedOriginalSource,cached.source);assert.equal(head.makeupIntensity,64);assert.deepEqual(pixelsOf(head.source),[197,126,106,255,22,19,18,255,0,0,0,0]);
});
await test('intensity changes and reset use the new clean base without rendering or accumulating another skin pass',async()=>{
 const f=fixture();await f.apply('seedream-20');const base=f.current().makeupBaseSource;
 for(const value of [0,100,45]){await f.intensity(value);assert.equal(f.current().makeupBaseSource,base);assert.equal(f.current().makeupIntensity,value);assert.deepEqual(pixelsOf(f.current().source),[Math.round(191+10*value/100),Math.round(120+10*value/100),Math.round(100+10*value/100),255,22,19,18,255,0,0,0,0]);assert.equal(f.current().femaleFinishProfile,profile)}
 assert.equal(f.local.length,1);await f.restore();assert.equal(f.current().source,base);assert.equal(f.current().makeupBaseSource,null);assert.deepEqual(f.current().makeupStyles,{});assert.equal(f.current().femaleFinishReference,reference);assert.equal(f.current().processedOriginalSource,base);
 await f.apply('seedream-22');assert.equal(f.local.length,1);assert.equal(f.current().makeupStyles,undefined);
});
await test('zero and full saved intensities keep a reversible recipe and one local render',async()=>{
 for(const value of [0,100]){const f=fixture({head:{makeupIntensity:value}});await f.apply('seedream-20');assert.equal(f.current().makeupIntensity,value);assert.equal(f.local.length,1);assert.equal(f.current().makeupBaseSource,f.stages[0].layer.source);assert.equal(f.current().makeupFullSource===null,value===100);assert.deepEqual(pixelsOf(f.current().source),value===0?pixelsOf(f.current().makeupBaseSource):pixelsOf(f.local.length&&f.blends[0].full))}
});
await test('new head profile metadata takes precedence while local adjustments never overwrite the first finish',async()=>{
 const replacementProfile=Object.freeze({version:1,fixture:'validated restored source finish'}),replacementReference=reference+'AA';
 const f=fixture({resultMetadata:{femaleFinishProfile:replacementProfile,femaleFinishReference:replacementReference}});await f.apply('seedream-20');assert.equal(f.current().femaleFinishProfile,replacementProfile);assert.equal(f.current().femaleFinishReference,replacementReference);
 await f.intensity(72);await f.restore();assert.equal(f.current().femaleFinishProfile,replacementProfile);assert.equal(f.current().femaleFinishReference,replacementReference);assert.equal(f.stages[0].layer.femaleFinishProfile,replacementProfile);
});
await test('natural, male and recipe-free portraits keep the previous hair replacement behavior',async()=>{
 for(const options of [{head:{initialFemaleEyeStyle:'natural'},sourceFinish:'makeup'},{head:{portraitMode:'male'},hairGender:'female'},{hairGender:'male'},{head:{makeupStyles:{}}}]){
  const f=fixture(options);await f.apply('seedream-20');assert.equal(f.errors.length,0);assert.equal(f.local.length,0);assert.equal(f.blends.length,0);assert.equal(f.current().source,f.stages[0].layer.source);assert.equal(f.current().makeupBaseSource,undefined);assert.deepEqual(f.settled,[true]);
 }
});
await test('locked heads and credit rejection never request new hair or render skin',async()=>{
 for(const options of [{head:{locked:true}},{creditAllowed:false}]){const f=fixture(options);await f.apply('seedream-20');assert.equal(f.env.state.current,f.previous);assert.equal(f.jobs.length,0);assert.equal(f.local.length,0);assert.equal(f.env.processRequestRef.current,false);assert.deepEqual(f.settled,[])}
});
await test('local failure, cancellation, failed hydrate, failed credit confirmation and stale commit restore the complete prior work',async()=>{
 for(const options of [{localFails:true},{cancelDuringLocal:true},{cancelAfterHydrate:true},{hydrateFails:true},{confirmFails:true},{commitFails:true}]){
  const f=fixture(options);await f.apply('seedream-20');assert.equal(f.env.state.current,f.previous);assert.equal(f.env.undo.current.length,0);assert.equal(f.stages[0].rolledBack,true);assert.equal(f.stages[0].committed,undefined);assert.equal(f.env.processRequestRef.current,false);assert.equal(f.errors.length,1);assert.equal(f.settled.at(-1),false);
 }
});
await test('newly selected jobs retain their paid or trial rights after recipe continuity',async()=>{
 for(const trial of [false,true]){const f=fixture({trial});await f.apply('seedream-20');assert.equal(f.current().jobId,'job-seedream-20');assert.equal(f.current().restrictedTrial,trial);assert.equal(f.current().outputUnlocked,!trial);for(const layer of f.unrelated)assert.equal(f.env.state.current.find(l=>l.id===layer.id),layer)}
});
await test('free female PNG choices still route only to the existing free hair path',async()=>{
 const f=fixture(),free=[];
 Object.assign(f.env,{isFreeFemaleHair,hasFreeHair:()=>false,applyFreeHair:id=>free.push(id),paidHairAccess:false,trialHairRemaining:0,isTrialHairAllowed:()=>false,onRequestUnlock:()=>{throw Error('free hair must not unlock')},sourceLayerRef:{current:null},processHairPending:false,applyHair:()=>{throw Error('free hair must not generate')}});
 const choose=extract(editor,' const chooseHair=id=>','\n\n useEffect(', 'chooseHair',f.env);choose('hair-21');assert.deepEqual(free,['hair-21']);assert.equal(f.jobs.length,0);assert.equal(f.local.length,0);assert.equal(f.env.state.current,f.previous);
});
console.log(`PASS: ${passed} Studio hairstyle/skin continuity scenarios; actual editor handlers and native intensity mixer; no live AI jobs, network calls or financial writes.`);
