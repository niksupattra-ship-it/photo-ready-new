import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {THAI_PORTRAIT_POLISH_VERSION as VERSION,thaiPortraitHeadInstruction as headRule,thaiPortraitSkinInstruction as skinRule} from '../thai-portrait-polish.js';
import {createEnglishBodyLayout,ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE as PROFILE} from '../english-body-layout.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {createMakeupRequestAudit} from '../makeup-generation-audit.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_FEMALE_HEAD_SIZE_VERSION} from '../thai-female-head-size.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {generateMakeupFromCompletedNatural} from '../natural-master-makeup.js';
const root=new URL('..',import.meta.url).pathname,marker={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,portraitMode:'female',thaiPortraitPolishVersion:VERSION};
test('explicit new Thai opt-in controls head/skin instructions without modifying archived or English jobs',()=>{
 for(const fields of [{}, {...marker,thaiPortraitPolishVersion:undefined},{...marker,thaiOutfitAiVersion:undefined,interfaceLanguage:'en'}]){assert.equal(headRule(fields),'');assert.equal(skinRule(fields),'')}
 for(const portraitMode of ['female','male'])for(const femaleEyeStyle of ['natural','makeup']){const fields={...marker,portraitMode,femaleEyeStyle};assert(headRule(fields).includes('additional 10%'));if(femaleEyeStyle==='natural')assert.equal(skinRule(fields),'');else for(const text of ['Remove visible active acne','wrinkle texture','SKIN ONLY','original catchlights','approved light brow/lash/liner'])assert(skinRule(fields).includes(text))}
});
test('actual head pixels shrink another 10% while native garment pixels, collar and body placement stay identical across outfit categories',async()=>{
 const identity=await sharp({create:{width:120,height:174,channels:3,background:'#01fe23'}}).png().toBuffer();
 const files=['government-uniforms/female-operational.png','government-uniforms/male-government-employee.png','job-uniforms/female-navy-suit-2.png','job-uniforms/male-job-black-solid-tie.webp','student-uniforms/female-01.png','student-uniforms/male-01.png','gown-uniforms/kmitl-female.png','gown-uniforms/kmitl-male.png'];
 for(const file of files){
  const outfit=await readFile(root+'public/assets/'+file),opts={identity,headScale:.95,canvasWidth:768,profile:PROFILE,garmentBalancedNeck:true,returnNativeForeground:true};
  const old=await createEnglishBodyLayout(outfit,opts),fresh=await createEnglishBodyLayout(outfit,{...opts,headOnlyScale:.9});
  assert(old.nativeForeground.equals(fresh.nativeForeground),file+' native coat must stay byte-identical');for(const key of ['shoulderTopY','collarTopY','centerX','shoulderSpan'])assert.equal(old[key],fresh[key],file+' '+key);
  const box=async png=>{const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});let l=info.width,r=-1,t=info.height,b=-1;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i]<10&&data[i+1]>240&&data[i+2]<60){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}}return {w:r-l+1,h:b-t+1,b,cx:(l+r)/2}};
  const a=await box(old.composition),b=await box(fresh.composition);assert(a.w>10&&b.w>10,file);assert(Math.abs(b.w/a.w-.9)<.025,file+' width');assert(Math.abs(b.h/a.h-.9)<.025,file+' height');assert(Math.abs(a.b-b.b)<=2,file+' chin anchor');assert(Math.abs(a.cx-b.cx)<=2,file+' head centre');
 }
});
test('actual job/student/gown/government requests receive smaller-head guides and Makeup-only skin diffusion in one existing provider attempt',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:{create:{width:80,height:115,channels:4,background:'#bd9887'}},left:8,top:13}]).png().toBuffer();
 for(const [portraitMode,finish,file]of [['female','makeup','job-uniforms/female-navy-suit-2.png'],['female','natural','student-uniforms/female-01.png'],['female','makeup','gown-uniforms/kmitl-female.png'],['male','natural','government-uniforms/male-government-employee.png']]){
  const female=portraitMode==='female',fields={...marker,portraitMode,femaleEyeStyle:finish,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:female?ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:female?'seedream-14':'thai-male-auto',neckOutfitReferencePath:'/assets/'+file,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),...(female?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})};
  let calls=0;const audit=createMakeupRequestAudit(async args=>{calls++;assert.equal(args.singleAttempt,true);assert(args.prompt.includes(headRule(fields)));if(finish==='makeup')assert(args.prompt.includes(skinRule(fields)));else {assert.equal(skinRule(fields),'');assert(!args.prompt.includes('CLEAR SKIN / DIFFUSED SOFT-MIST LIGHT'));assert(!args.prompt.includes('soft-mist glow'));}assert(!args.prompt.includes("90% of PR143's head"));assert(!args.prompt.includes('cheek-to-cheek width around 0.30'));assert(args.outfit.length);if(female&&finish==='makeup')assert(!args.adaptiveComposition);else assert(args.adaptiveComposition?.length);return {png}},{requirePolicy:finish==='makeup'});
  await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>png,requestPortrait:audit.requestPortrait});assert.equal(calls,1);
 }
});
test('Natural-to-Makeup cleans skin in its existing edit without shrinking the already accepted head again',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:'#bd9887'}}).png().toBuffer();let calls=0;
 await generateMakeupFromCompletedNatural({natural:png,fields:{...marker,femaleEyeStyle:'natural',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION},key:'inert',requestPortrait:async args=>{calls++;assert.equal(args.singleAttempt,true);assert(args.prompt.includes('CLEAR SKIN / DIFFUSED SOFT-MIST LIGHT'));assert(!args.prompt.includes('ADDITIONAL SMALLER HEAD'));return {png}}});assert.equal(calls,1);
});
test('saved/recovered portrait metadata keeps the actual revision and fixed-coat framing without relabelling archived images',async()=>{
 const [main,editor,store]=await Promise.all(['src/main.jsx','src/studio-editor.jsx','job-store.js'].map(p=>readFile(root+p,'utf8')));
 assert(main.includes("fd.append('thaiPortraitPolishVersion',THAI_PORTRAIT_POLISH_VERSION)"));assert(main.includes('blob.idpromThaiPortraitPolishVersion=j.thaiPortraitPolishVersion'));assert(main.includes('blob.idpromThaiPortraitPolishVersion=job.thaiPortraitPolishVersion'));
 assert.equal(main.split('finished.idpromThaiPortraitPolishVersion=cached.value.idpromThaiPortraitPolishVersion').length-1,2);assert(!main.includes('finished.idpromThaiPortraitPolishVersion=THAI_PORTRAIT_POLISH_VERSION'));
 assert(main.includes('fullBodyFrame:headBlob.idpromThaiPortraitPolishVersion===THAI_PORTRAIT_POLISH_VERSION'));assert(editor.includes('fullBodyFrame:head.thaiPortraitPolishVersion===THAI_PORTRAIT_POLISH_VERSION'));assert(store.includes('AS "thaiPortraitPolishVersion"'));
});
