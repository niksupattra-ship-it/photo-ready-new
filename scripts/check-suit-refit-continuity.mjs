import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
import {replaceHairstyleLayer} from '../src/replace-hairstyle-layer.js';
import {headPose,syncHairAttachments} from '../src/hair-preview-fit.js';
import {HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';

// Run the actual utility and both production head-replacement callers. The
// image/geometry/provider boundaries are deterministic local fixtures.
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const noop=()=>{};
function extract(start,end,name,env){
 const a=editor.indexOf(start),b=editor.indexOf(end,a);assert(a>=0&&b>a,'missing '+name);
 return new Function('env',`with(env){${editor.slice(a,b)};return ${name}}`)(env);
}
function fixture({auto=true,process=false,reused=false,freeHair=false,failFit=false,failNative=false}={}){
 const events=[],calls={native:[],fit:[],prepare:[],change:[],commits:0,rollbacks:0,errors:[],finish:[]};
 const headSource={tag:'old processed source'},freshSource={tag:'new processed source'},rawNative={tag:'original catalogue garment pixels'},baked={tag:'original catalogue garment pixels'};
 const head={id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'old-job',source:headSource,sourceFrame:{x:190,y:20,w:520,h:850},x:-18,y:31,scale:.97,rotation:0,squeezeX:1,squeezeY:1,opacity:1,visible:true,locked:false,hairId:freeHair?'':'seedream-old',hairPolicyVersion:HAIR_DESIGN_VERSION,portraitMode:'female',femaleEyeStyle:'makeup',initialFemaleEyeStyle:'makeup'};
 const suit={id:'suit',kind:'suit',name:'ชุด',templatePath:'/assets/job-uniforms/female-suit-03.png',source:baked,sourceFrame:{x:-4,y:320,w:908,h:1190},collarFrame:{x:-4,y:320,w:908,h:1190},x:4,y:6,scale:1,rotation:0,neckWidth:0,neckHeight:0,mask:{tag:'retained suit mask'},...(auto?{autoSuitFitVersion:'suit-switch-fit-v1',autoCollarFitApplied:true}:{})};
 const raw={id:'raw',kind:'source-photo',source:{tag:'new person upload'}};
 const hair={id:'free-front',kind:'hair-preview',name:'ผมฟรี',hairHeadId:'head',hairHeadPose:headPose(head),hairId:'hair-21',hairRole:'front',source:'old-free-hair',x:head.x+4,y:head.y-3,scale:head.scale,rotation:0,sourceFrame:head.sourceFrame};
 const initial=process?[raw,suit]:freeHair?[head,hair,suit]:[head,suit];
 const sourcePhoto={idpromFemaleEyeStyle:'makeup'};
 const resultLayer={name:'หัว · คอ · ผม',source:freshSource,sourceFrame:{...head.sourceFrame},jobId:'new-job',portraitMode:'female',femaleEyeStyle:'natural',initialFemaleEyeStyle:'natural',hairId:'seedream-new',outputUnlocked:true};
 const env={state:{current:initial},assets:{current:new Map([[suit.id,{directPixelsReady:false}]])},sourcePhoto,
  layerKind:l=>l.kind,outputHeads:layers=>layers.filter(l=>l.kind==='head'||l.name==='หัว · คอ · ผม'),onMeasureSuitFace:async()=>[],
  nativeAsset:async(...args)=>{events.push('native');calls.native.push(args);if(failNative)throw Error('catalogue decode failed');return{source:rawNative}},
  fitStudioSuit:async args=>{events.push('fit');calls.fit.push(args);if(failFit)throw Error('local refit failed');const currentHead=args.layers.find(l=>l.kind==='head'&&l.jobId);return args.layers.filter(l=>!(l.kind==='neck-fit'&&l.hairHeadId===currentHead.id)).map(l=>l.id===args.nextSuit.id?{...args.nextSuit,neckWidth:-33,autoCollarFitWidth:-33,autoCollarFitApplied:true}:l)},
  ready:true,processActive:false,assetBusy:false,processRequestRef:{current:false},mounted:{current:true},touch:false,
  sourceLayerRef:{current:process?'raw':null},pendingHairProcessRef:{current:null},portraitMode:'female',hairGender:'female',
  isFreeFemaleHair,portraitFinishChoice,replaceHairstyleLayer,headPose,HAIR_DESIGN_VERSION,
  fresh:l=>({id:'fresh-head',x:0,y:0,scale:1,rotation:0,squeezeX:1,squeezeY:1,opacity:1,visible:true,locked:false,...l}),
  historySnapshot:()=>env.state.current,flushTransforms:noop,
  hydrate:async next=>{events.push('hydrate');env.state.current=syncHairAttachments(next);return true},
  onProcessPhoto:async()=>{events.push('process');return{layer:resultLayer,placement:{tag:'fresh placement'},commit:()=>{events.push('commit');calls.commits++},rollback:()=>{calls.rollbacks++}}},
  onChangeHair:async(id,mode,finish)=>{calls.change.push({id,mode,finish});events.push('change');return{layer:{...resultLayer,hairId:id,femaleEyeStyle:finish,initialFemaleEyeStyle:finish},reused,commit:()=>{events.push('commit');calls.commits++},rollback:()=>{calls.rollbacks++}}},
  onPrepareHairOverlay:async(source,id)=>{calls.prepare.push({source,id});events.push('prepare-free-hair');return{cleanedHeadSource:'new-cleaned-head',source:'new-free-front',backSource:'new-free-back'}},
  surfaceURL:value=>value,isProcessCancelled:()=>false,checkProcessCredits:async()=>true,
  canRestoreHair:()=>reused,appearanceFailure:(kind,message)=>calls.errors.push({kind,message}),
  onFinishProcess:async success=>{events.push('finish-'+success);calls.finish.push(success)},
  sessionUnlockedJobs:{current:new Set()},hairStyleMemory:{current:{clear:noop}},youcamHairMemory:{current:{clear:noop}},placementRef:{current:{tag:'original placement'}},
  resetPhotoHistory:()=>events.push('reset-history'),resetBrushSession:noop,undo:{current:[]},redo:{current:[]},
  trackPhotoType:noop,trackHairSelection:noop,reportProcessedResult:noop,
  setStatus:noop,setAppearanceError:noop,setPortraitProcessError:noop,setProcessHairPending:noop,setPicker:noop,setHairNotice:noop,setHairConfirmed:noop,
  setProcessingPhoto:noop,setTool:noop,setSelected:noop,setRevision:noop,setSelectedHair:noop,setComparing:noop,
  setAssetBusy:value=>{env.assetBusy=value}
 };
 env.refitActiveSuit=extract(' const refitActiveSuit=async next=>{','\n const selectAsset=','refitActiveSuit',env);
 const processPhoto=extract(' const processPhoto=async(options={})=>{','\n useEffect','processPhoto',env);
 const applyHair=extract(' const applyHair=async (id,','\n const selectPortraitFinish=','applyHair',env);
 return{env,initial,head,suit,sourcePhoto,freshSource,resultLayer,rawNative,baked,events,calls,
  refit:next=>env.refitActiveSuit(next||env.state.current),
  process:()=>processPhoto({hairId:'seedream-new',portraitMode:'female',continueWithoutSave:true}),
  appearance:(kind='hair')=>applyHair(freeHair?'':'seedream-new',{femaleEyeStyle:'natural',portraitMode:'female',appearanceKind:kind})};
}
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};

await check('ordinary first-processing suits retain the exact incoming layer array without native or fit work',async()=>{
 const f=fixture({auto:false}),result=await f.refit();assert.equal(result,f.initial);assert.equal(f.calls.native.length,0);assert.equal(f.calls.fit.length,0);
});
await check('an active automatic suit is rebuilt from the original catalogue and measured against the current head',async()=>{
 const f=fixture(),placement=f.env.placementRef.current;const next=f.initial.map(l=>l.id===f.head.id?{...l,source:f.freshSource,jobId:'replacement-job'}:l);await f.refit(next);
 assert.equal(f.calls.native.length,1);assert.deepEqual(f.calls.native[0],['suit',{template:f.suit.templatePath},f.suit.sourceFrame,null]);
 const args=f.calls.fit[0];assert.equal(args.headSource,f.freshSource);assert.equal(args.preservePlacement,true);assert.equal(args.nextSuit.source,f.rawNative);assert.deepEqual(args.nextSuit.source,f.baked,'reloading a catalogue image retains identical garment pixels');assert.equal(args.nextSuit.mask,f.suit.mask);assert.equal(args.nextSuit.sourceFrame,f.suit.sourceFrame);assert.equal(args.previousSuit,f.suit);assert.equal(f.env.placementRef.current,placement);assert.equal(f.suit.source,f.baked);
});
await check('later collar-only fitting preserves the complete head pose and independent fixed suit geometry',async()=>{
 const f=fixture();f.suit.sourceFrame={x:-53,y:282,w:1007,h:1311};f.suit.collarFrame={x:-17,y:330,w:921,h:1203};Object.assign(f.suit,{x:38,y:-31,scale:1.17,squeezeX:.93,squeezeY:1.05,rotation:4});
 f.initial.splice(1,0,{id:'old-neck-fit',kind:'neck-fit',source:'old copied skin',hairHeadId:f.head.id});
 const result=await f.refit();const h=result.find(l=>l.id===f.head.id),suit=result.find(l=>l.id===f.suit.id);
 assert.equal(h,f.head);assert.deepEqual(headPose(h),headPose(f.head));for(const key of ['x','y','scale','rotation','squeezeX','squeezeY','sourceFrame','collarFrame','mask'])assert.equal(suit[key],f.suit[key],'fixed garment '+key);
 assert.deepEqual(suit.source,f.suit.source);assert.equal(suit.neckWidth,-33);assert(!result.some(l=>l.kind==='neck-fit'));assert.equal(f.calls.fit[0].preservePlacement,true);
});
for(const manual of ['warpSource','neckWidth','neckHeight','directPixelsReady'])await check('manual '+manual+' work remains untouched during a later portrait change',async()=>{
 const f=fixture();if(manual==='directPixelsReady')f.env.assets.current.get(f.suit.id).directPixelsReady=true;else f.suit[manual]=manual==='warpSource'?{tag:'manual warped suit'}:11;
 assert.equal(await f.refit(),f.initial);assert.equal(f.calls.native.length,0);assert.equal(f.calls.fit.length,0);
});
for(const value of [-75,75])await check('automatic width '+value+' refits when it still matches its stored baseline',async()=>{
 const f=fixture();f.suit.neckWidth=value;f.suit.autoCollarFitWidth=value;
 const result=await f.refit();assert.equal(f.calls.fit.length,1);assert.equal(f.calls.fit[0].nextSuit.source,f.rawNative);assert.equal(result.filter(l=>l.kind==='neck-fit').length,0);
});
await check('a user width change relative to the automatic baseline is respected',async()=>{
 const f=fixture();f.suit.neckWidth=74;f.suit.autoCollarFitWidth=75;assert.equal(await f.refit(),f.initial);assert.equal(f.calls.fit.length,0);assert.equal(f.calls.native.length,0);
});
await check('missing processed job, template or local callback does not invent a refit',async()=>{
 for(const missing of ['job','template','callback']){const f=fixture();if(missing==='job')delete f.head.jobId;else if(missing==='template')delete f.suit.templatePath;else f.env.onMeasureSuitFace=null;assert.equal(await f.refit(),f.initial);assert.equal(f.calls.native.length,0);assert.equal(f.calls.fit.length,0)}
});
for(const failure of ['failFit','failNative'])await check(failure+' cannot mutate the existing helper input or commit it',async()=>{
 const f=fixture({[failure]:true});await assert.rejects(f.refit());assert.equal(f.env.state.current,f.initial);assert.equal(f.suit.source,f.baked);assert.equal(f.calls.commits,0);
});
await check('normal first generation commits its original head with no automatic refit',async()=>{
 const f=fixture({auto:false,process:true});await f.process();assert.equal(f.calls.native.length,0);assert.equal(f.calls.fit.length,0);assert.equal(f.calls.commits,1);assert.equal(f.calls.rollbacks,0);assert.equal(f.env.state.current.find(l=>l.kind==='head').source,f.freshSource);assert.equal(f.env.state.current.find(l=>l.kind==='suit').source,f.baked);
});
await check('a new person on an automatically fitted suit refits the new master before hydration and commit',async()=>{
 const f=fixture({process:true});f.suit.neckWidth=-75;f.suit.autoCollarFitWidth=-75;await f.process();assert.equal(f.calls.fit.length,1);assert.equal(f.calls.fit[0].headSource,f.freshSource);assert.equal(f.calls.fit[0].layers.find(l=>l.kind==='head').jobId,'new-job');assert.equal(f.calls.fit[0].nextSuit.source,f.rawNative);assert.equal(f.calls.fit[0].preservePlacement,true);
 assert(f.events.indexOf('fit')<f.events.indexOf('hydrate'));assert(f.events.indexOf('hydrate')<f.events.indexOf('commit'));assert.equal(f.env.state.current.find(l=>l.kind==='suit').source,f.rawNative);assert.equal(f.calls.commits,1);assert.equal(f.calls.rollbacks,0);
 const h=f.env.state.current.find(l=>l.kind==='head');assert.equal(h.source,f.freshSource);assert.equal(f.env.state.current.filter(l=>l.kind==='neck-fit').length,0);
 const finalSuit=f.env.state.current.find(l=>l.kind==='suit');for(const key of ['x','y','scale','squeezeX','squeezeY','rotation','sourceFrame','collarFrame'])assert.equal(finalSuit[key],f.suit[key],'new person keeps garment '+key);
});
await check('failed new-person collar fitting restores the previous project and cannot commit a misfitted AI result',async()=>{
 const f=fixture({process:true,failFit:true});await f.process();assert.deepEqual(f.env.state.current,f.initial);assert.equal(f.calls.commits,0);assert.equal(f.calls.rollbacks,1);assert.deepEqual(f.calls.finish,[false]);assert(!f.events.includes('reset-history'));assert.equal(f.env.processRequestRef.current,false);
});
await check('an unflagged suit keeps the existing hairstyle replacement without new collar work',async()=>{
 const f=fixture({auto:false});await f.appearance();assert.equal(f.calls.fit.length,0);assert.equal(f.calls.native.length,0);assert.equal(f.calls.commits,1);assert.equal(f.calls.change.length,1);assert.equal(f.env.state.current.find(l=>l.id==='head').source,f.freshSource);
});
for(const reused of [false,true])await check((reused?'cached makeup':'new AI hairstyle')+' refreshes the automatic collar against its own returned neck while retaining placement',async()=>{
 const f=fixture({reused});f.suit.neckWidth=75;f.suit.autoCollarFitWidth=75;f.initial.splice(1,0,{id:'old-neck-fit',kind:'neck-fit',hairHeadId:f.head.id,hairHeadPose:headPose(f.head),...headPose(f.head),source:'old-neck'});await f.appearance(reused?'makeup':'hair');assert.equal(f.calls.fit.length,1);assert.equal(f.calls.fit[0].headSource,f.freshSource);assert.equal(f.calls.fit[0].preservePlacement,true);assert.equal(f.calls.fit[0].nextSuit.source,f.rawNative);assert.equal(f.calls.commits,1);assert.equal(f.calls.rollbacks,0);assert.equal(f.sourcePhoto.idpromFemaleEyeStyle,'natural');assert.deepEqual(headPose(f.env.state.current.find(l=>l.id==='head')),headPose(f.head));assert(f.events.indexOf('fit')<f.events.indexOf('hydrate'));assert(f.events.indexOf('hydrate')<f.events.indexOf('commit'));
 assert.equal(f.env.state.current.filter(l=>l.kind==='neck-fit').length,0);assert(!f.env.state.current.some(l=>l.id==='old-neck-fit'));
 const finalSuit=f.env.state.current.find(l=>l.kind==='suit');for(const key of ['x','y','scale','squeezeX','squeezeY','rotation','sourceFrame','collarFrame'])assert.equal(finalSuit[key],f.suit[key],'portrait change keeps garment '+key);
});
await check('free hair is fully rebuilt before makeup collar fitting reads the cleaned new head',async()=>{
 const f=fixture({reused:true,freeHair:true});await f.appearance('makeup');assert.equal(f.calls.prepare.length,1);assert.equal(f.calls.fit.length,1);assert.equal(f.calls.fit[0].headSource,'new-cleaned-head');assert.equal(f.calls.fit[0].layers.filter(l=>l.kind==='hair-preview').length,2);assert(f.events.indexOf('prepare-free-hair')<f.events.indexOf('fit'));assert.equal(f.calls.commits,1);assert.equal(f.calls.errors.length,0);
});
await check('failed hairstyle refitting retains the old face, makeup selection, job and fixed garment',async()=>{
 const f=fixture({failFit:true});await f.appearance('makeup');assert.deepEqual(f.env.state.current,f.initial);assert.equal(f.calls.commits,0);assert.equal(f.calls.rollbacks,1);assert.equal(f.sourcePhoto.idpromFemaleEyeStyle,'makeup');assert.equal(f.env.state.current.find(l=>l.id==='head').jobId,'old-job');assert.equal(f.env.state.current.find(l=>l.id==='suit').source,f.baked);assert.equal(f.calls.errors.length,1);assert.equal(f.env.assetBusy,false);assert.equal(f.env.processRequestRef.current,false);
});
console.log(JSON.stringify({passed,scope:'Actual refitActiveSuit, processPhoto and applyHair; native/geometry/AI boundaries mocked locally, no provider or account calls.'}));
