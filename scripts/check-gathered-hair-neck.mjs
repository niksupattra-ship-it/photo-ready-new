import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectGatheredPortraitHair} from '../src/compact-hair-check.js';
import {boundPortraitNeckAlpha} from '../src/portrait-neck-boundary.js';
import {productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG,selectedHairInstruction,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';

let passed=0;const check=async(name,run)=>{await run();passed++;console.info('PASS '+name)};
function evidence({tail=false,semantic=true,dark=false,wisp=false}={}){
 const pixels=new Uint8ClampedArray(256*320*4),hair=new Uint8ClampedArray(pixels.length),skin=dark?[35,27,25]:[180,140,120],black=[12,14,20];
 const paint=(x0,x1,y0,y1,colour,isHair=false)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*256+x)*4;pixels.set([...colour,255],i);if(isHair)hair[i+3]=255}};
 paint(70,186,40,136,black,true);paint(90,166,144,224,skin);paint(104,152,224,278,skin);paint(55,201,278,310,skin);
 if(tail){paint(70,91,190,276,black,semantic);paint(165,185,190,276,black,semantic)}
 if(wisp)paint(78,79,252,256,black,semantic);
 return {pixels,hair,chinY:224};
}
await check('a gathered crown and neck skin pass for light and dark complexions',()=>{
 for(const dark of [false,true])assert.equal(inspectGatheredPortraitHair(evidence({dark})).retained,false);
 assert.equal(inspectGatheredPortraitHair(evidence({wisp:true})).retained,false);
});
await check('long rear panels fail even when segmentation misses dark hair on transparency',()=>{
 for(const semantic of [false,true]){const r=inspectGatheredPortraitHair(evidence({tail:true,semantic}));assert(r.measurable);assert(r.retained);assert(r.left>0&&r.right>0)}
 assert.equal(inspectGatheredPortraitHair({}).measurable,false);
});
await check('the upper neck stays intact through a smooth flare, with native RGB and deep backing preserved',()=>{
 const W=240,H=360,d=64,chin={x:120/W,y:145/H},face=[];face[33]={x:88/W,y:80/H};face[263]={x:152/W,y:80/H};face[152]=chin;face[234]={x:70/W,y:100/H};face[454]={x:170/W,y:100/H};
 const pixels=new Uint8ClampedArray(W*H*4),hair=new Uint8ClampedArray(pixels.length);for(let i=0;i<pixels.length;i+=4)pixels.set([180,140,120,255],i);
 const original=pixels.slice();boundPortraitNeckAlpha(pixels,hair,W,H,face);
 for(let i=0;i<pixels.length;i+=4)assert.deepEqual(pixels.subarray(i,i+3),original.subarray(i,i+3));
 for(let y=151;y<=163;y++)for(let x=76;x<=164;x++)assert.equal(pixels[(y*W+x)*4+3],255,'no rectangular neck-side cuts');
 assert.equal(pixels[(225*W+120)*4+3],255,'deep center backing retained');assert.equal(pixels[(260*W+120)*4+3],0,'lower body still removed');
 for(let y=0;y<150;y++)assert.equal(pixels[(y*W+120)*4+3],255,'face/upper neck unchanged');
});
await check('all finishes receive the exact selected gathered design, while long styles keep their own length',()=>{
 const gathered=PRODUCTION_HAIR_CATALOG.find(h=>h.id==='seedream-41'),long=PRODUCTION_HAIR_CATALOG.find(h=>h.id==='seedream-42');
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1']){
  const fields={portraitMode:'female',femaleEyeStyle:style,studioSkinVersion:'studio-original-ai-v5'};
  const prompt=productionPortraitPrompt(gathered,style,fields);assert(prompt.includes(selectedHairInstruction(gathered)));assert(prompt.includes('COMPLETE COMPACT SILHOUETTE'));assert(!prompt.includes('Long hair stays behind'));
  const longPrompt=productionPortraitPrompt(long,style,fields);assert(longPrompt.includes(selectedHairInstruction(long)));assert(!longPrompt.includes('COMPLETE COMPACT SILHOUETTE'));
 }
 assert(HAIR_DESIGN_VERSION.includes('v11'));
});

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const extract=(start,end,name,env)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a);return Function('env',`with(env){${main.slice(a,b)};return ${name}}`)(env)};
await check('actual first-generation and hairstyle-change handlers share the original-upload pipeline in every finish',async()=>{
 for(const style of ['natural','makeup','korean-rosy-v1']){
  const file=new File(['immutable original'],'source.webp',{type:'image/webp'});file.idpromFemaleEyeStyle=style;
  const previous=new Blob(['old generated hair']),output=Object.assign(new Blob(['new generated hair']),{idpromJobId:'new-job',idpromTrial:false}),requests=[],template='/assets/job-uniforms/female-formal-suit.png';
  const noop=()=>{};
  const env={busy:false,hairBusy:false,studioPhotoTransactionRef:{current:false},portraitFinishChoice,HAIR_DESIGN_VERSION,backgroundRef:{current:'/assets/background.jpg'},async aiFinishPortrait(source,hair,options){requests.push({source,hair,options});return output},finishFirstPortraitMaster:async b=>b,composePortrait:async()=>({lock:{templatePath:template}}),renderAdjustedFinal:async(...args)=>{args.at(-1).push({name:'หัว · คอ · ผม',source:'new'})},assertProcessActive:noop,femaleFinishMetadata:()=>({}),setBusy:noop,beginProgress:noop};
  const first=extract(' const processStudioPhoto=async',' const applyStudioMakeup=','processStudioPhoto',env);await first(file,template,'seedream-41','female');
  Object.assign(env,{studioPhotoTransactionRef:{current:false},hairRequestRef:{current:false},firstUploadedPhotoRef:{current:file},editCache:{current:{master:previous,lock:{templatePath:template}}},hairResultScope:()=> 'same-work',hairResultMode:()=> 'female',cachedHairResult:()=>null,liveAdjustRef:{current:{}},liveCollarWarpRef:{current:0},liveCollarHeightRef:{current:0},liveNeckAdjustRef:{current:{}},activeUniformTemplate:template,setHairGenerating:noop,setHairBusy:noop,setMsg:noop,setProgressStage:noop,finishProgress:async()=>{},fitChangedHairMaster:async()=>({templatePath:template}),activeProcessOperation:{cancelled:false}});
  const change=extract(' const changeHairForStudio=async',' const downloadHairDonor=','changeHairForStudio',env);await change('seedream-41','female',{studioOnly:true,femaleEyeStyle:style,sourceJobId:'previous-job',outfitReferencePath:template});
  assert.equal(requests.length,2);
  for(const r of requests){assert.equal(r.source,file);assert.notEqual(r.source,previous);assert.equal(r.hair,'seedream-41');assert.equal(r.options.portraitMode,'female');assert.equal(r.options.femaleEyeStyle,style);assert.equal(r.options.templatePath,template)}
 }
});
await check('the actual completion handler rejects a retained lower curtain for both finishes',async()=>{
 for(const style of ['natural','korean-rosy-v1']){
  const source=new Blob(['upload']);source.idpromFemaleEyeStyle=style;const result=new Blob(['AI result']);result.idpromStudioSkinVersion='studio-original-ai-v5';
  const env={PRODUCTION_HAIR_CATALOG,selectedHairDesign:(h)=>h?.id==='seedream-41'?{kind:'gathered'}:{kind:'long'},ORIGINAL_PORTRAIT_AI_VERSION:'studio-original-ai-v5',inspectGatheredPortraitHair,portraitCompletionEvidence:async()=>({...evidence({tail:true,semantic:false}),garments:{measurable:true,retained:false}})};
  const run=extract('async function checkPortraitCompletion(','\nconst femaleMakeupGuideCache','checkPortraitCompletion',env);
  await assert.rejects(run(source,result,'seedream-41'),e=>e.code==='selected_hairstyle_mismatch');await run(source,result,'seedream-42');
 }
});
console.info(JSON.stringify({passed,scope:'Smooth native neck alpha, gathered-tail rejection, length-specific prompts and shared original-upload generation/change flow.'}));
