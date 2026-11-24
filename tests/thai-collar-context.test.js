import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {measureUniformAnchors} from '../src/portrait-uniform-fit.js';
import {createEnglishBodyLayout,ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE as PROFILE} from '../english-body-layout.js';
import {garmentNeckBalance} from '../garment-neck-balance.js';
import {measureGarmentCollarContext,THAI_COLLAR_CONTEXT_VERSION as VERSION,thaiCollarContextInstruction as instruction} from '../thai-collar-context.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_FEMALE_HEAD_SIZE_VERSION} from '../thai-female-head-size.js';
import {THAI_PORTRAIT_POLISH_VERSION} from '../thai-portrait-polish.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
const root=new URL('..',import.meta.url).pathname;
const files=[['government-uniforms/female-operational.png','shirt-tie'],['government-uniforms/male-government-employee.png','standing'],['job-uniforms/female-navy-suit-2.png','open'],['student-uniforms/female-01.png','open'],['gown-uniforms/kmitl-female.png','standing'],['job-uniforms/female-job-ivory-bow-blouse.png','bow'],['job-uniforms/female-job-black-round-collar.png','round']];
test('actual garment collar types place the reduced head lower without moving any native garment pixels or resizing the head',async()=>{
 const identity=await sharp({create:{width:120,height:174,channels:3,background:'#01fe23'}}).png().toBuffer();
 const box=async png=>{const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});let l=info.width,r=-1,t=info.height,b=-1;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i]<10&&data[i+1]>240&&data[i+2]<60){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}}return {w:r-l+1,h:b-t+1,b}};
 for(const [file,kind]of files){const outfit=await readFile(root+'public/assets/'+file),opts={identity,profile:PROFILE,headScale:.95,headOnlyScale:.9,canvasWidth:768,garmentBalancedNeck:true,returnNativeForeground:true};
  const old=await createEnglishBodyLayout(outfit,opts),fresh=await createEnglishBodyLayout(outfit,{...opts,collarContext:{template:'/assets/'+file}});
  assert(old.nativeForeground.equals(fresh.nativeForeground),file+' coat remains exact');for(const key of ['collarTopY','shoulderTopY','shoulderSpan','centerX'])assert.equal(old[key],fresh[key]);assert.equal(fresh.measuredCollar.kind,kind,file);
  const a=await box(old.composition),b=await box(fresh.composition);assert(a.w>10&&b.w>10,file);assert(Math.abs(a.w-b.w)<=2,file+' head width');assert(Math.abs(a.h-b.h)<=2,file+' head height');assert(b.b>a.b,file+' chin should sit lower to meet this collar');
  assert((await createEnglishBodyLayout(outfit,{...opts,collarContext:null})).composition.equals(old.composition),'Archived guide remains byte-identical');
 }
});
test('contact comes from upper collar geometry after head reduction, never the low V or tie/button closure',async()=>{
 for(const [file,kind]of files){let previous;
  for(const width of [300,600]){const {data,info}=await sharp(root+'public/assets/'+file).resize({width,height:900,fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true}),u=measureUniformAnchors(data,info.width,info.height),h=u.shoulderWidth*.6;
   const m=measureGarmentCollarContext(u,h*.9,'/assets/'+file),old=garmentNeckBalance(data,info.width,info.height,u,h);assert.equal(m.kind,kind);assert(m.chinY>u.collarTopY-old.gap);assert(m.contactY>=u.collarTopY);assert(m.contactY<=u.collarTopY+u.shoulderWidth*.035+1e-8);assert(m.gap/u.shoulderWidth<=.020+1e-8);
   const deep=measureGarmentCollarContext({...u,socketY:u.socketY+u.shoulderWidth*.5},h*.9,'/assets/'+file);assert.equal(deep.contactY,m.contactY);assert.equal(deep.chinY,m.chinY);
   const ratio=(m.chinY-u.collarTopY)/u.shoulderWidth;if(previous!==undefined)assert(Math.abs(previous-ratio)<.006);previous=ratio;
  }
 }
 assert.equal(measureGarmentCollarContext(null,20),null);assert.equal(instruction({},{}),'');
});
test('new female/male Makeup/Natural requests use the measured collar context in the original single generation',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:{create:{width:80,height:115,channels:4,background:'#bd9887'}},left:8,top:13}]).png().toBuffer();
 for(const [gender,finish,file,label]of [['female','makeup',files[0][0],'FOLDED SHIRT COLLAR / TIE'],['female','natural',files[2][0],'OPEN COLLAR / V NECKLINE'],['male','natural',files[1][0],'STANDING / HIGH COLLAR']]){
  const female=gender==='female',fields={portraitMode:gender,femaleEyeStyle:finish,thaiCollarContextVersion:VERSION,thaiPortraitPolishVersion:THAI_PORTRAIT_POLISH_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION,thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:female?ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:female?'seedream-14':'thai-male-auto',neckOutfitReferencePath:'/assets/'+file,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),...(female?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})};let calls=0;
  await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>png,requestPortrait:async args=>{calls++;assert.equal(args.singleAttempt,true);assert(args.prompt.includes('THIS GARMENT\'S COLLAR CONTACT'));assert(args.prompt.includes(label));if(label==='OPEN COLLAR / V NECKLINE')assert(args.prompt.includes('lower triangular opening is upper chest, not extra neck'));else assert(!args.prompt.includes('lower triangular opening is upper chest, not extra neck'));assert(args.prompt.lastIndexOf('THIS GARMENT\'S COLLAR CONTACT')>args.prompt.lastIndexOf('FIXED NATIVE GARMENT / ADDITIONAL SMALLER HEAD'));if(finish==='natural')assert(!args.prompt.includes('CLEAR SKIN / DIFFUSED SOFT-MIST LIGHT'));assert.equal(args.collarContext,undefined);return {png}}});assert.equal(calls,1);
 }
});
