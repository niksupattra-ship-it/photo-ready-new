import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {measureHairCrown,fitWholeHeadGuide,THAI_WHOLE_HEAD_GUIDE_VERSION as VERSION,LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION as LEGACY,PREVIOUS_THAI_WHOLE_HEAD_GUIDE_VERSION as PREVIOUS,usesThaiWholeHeadGuide,thaiWholeHeadInstruction} from '../thai-whole-head-guide.js';
import {createEnglishBodyLayout,ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE as PROFILE} from '../english-body-layout.js';
import {selectedRearLayoutHair} from '../thai-selected-rear-layout.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {createMakeupRequestAudit} from '../makeup-generation-audit.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_FEMALE_HEAD_SIZE_VERSION} from '../thai-female-head-size.js';
import {THAI_PORTRAIT_POLISH_VERSION} from '../thai-portrait-polish.js';
import {THAI_COLLAR_CONTEXT_VERSION} from '../thai-collar-context.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
const root=new URL('..',import.meta.url).pathname;
test('crown measurement includes upper hair volume but not long ends below the chin',()=>{
 const w=100,h=150,pixels=new Uint8Array(w*h*4),geometry={faceWidth:40,faceHeight:55,centerX:50,chinY:80};
 const paint=(l,r,t,b)=>{for(let y=t;y<b;y++)for(let x=l;x<r;x++)pixels[(y*w+x)*4+3]=255};paint(20,80,10,80);
 const crown=measureHairCrown(pixels,w,h,geometry);assert.equal(crown.width,60);assert.equal(crown.height,70);paint(0,100,90,150);assert.deepEqual(measureHairCrown(pixels,w,h,geometry),crown);
 const plan=fitWholeHeadGuide({faceWidth:160,faceHeight:220,shoulderWidth:400,hair:crown});assert(plan.widthToShoulder<=.42+1e-9);assert(plan.heightToShoulder<=.567+1e-9);assert.equal(plan.faceWidth/plan.faceHeight,160/220);
 const marker={portraitMode:'female',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiWholeHeadGuideVersion:VERSION,portraitComposition:'en-outfit-body-v1'};assert.equal(usesThaiWholeHeadGuide(marker),true);assert.equal(usesThaiWholeHeadGuide({...marker,thaiWholeHeadGuideVersion:PREVIOUS}),true);assert(thaiWholeHeadInstruction({...marker,thaiWholeHeadGuideVersion:LEGACY}).includes('at most 40%'));assert(thaiWholeHeadInstruction(marker).includes('at most 42%'));assert.equal(usesThaiWholeHeadGuide({...marker,portraitMode:'male'}),false);assert.equal(usesThaiWholeHeadGuide({...marker,interfaceLanguage:'en',thaiOutfitAiVersion:undefined}),false);assert.equal(usesThaiWholeHeadGuide({...marker,portraitComposition:'en-head-template-v1'}),false);assert.equal(usesThaiWholeHeadGuide({}),false);
});
test('real long/compact/male hair and wide/tall identities fit full-head bounds with byte-identical native clothing',async()=>{
 const files=['government-uniforms/female-operational.png','government-uniforms/male-government-employee.png','job-uniforms/female-navy-suit-2.png','job-uniforms/male-job-black-solid-tie.webp','student-uniforms/female-01.png','student-uniforms/male-01.png','gown-uniforms/kmitl-female.png','gown-uniforms/kmitl-male.png'];
 const hairs=await Promise.all(['seedream-14','seedream-42','seedream-79','seedream-28','seedream-36'].map(async id=>selectedRearLayoutHair({selected:PRODUCTION_HAIR_CATALOG.find(h=>h.id===id),hair:await loadCatalogueHairGuide(id,root),root})));
 let i=0;
 for(const file of files){const outfit=await readFile(root+'public/assets/'+file),identity=await sharp({create:{width:100,height:[115,155,210][i%3],channels:3,background:'#01fe23'}}).png().toBuffer(),rearHairGuide=hairs[i++%hairs.length];assert(rearHairGuide);
  const options={identity,profile:PROFILE,headScale:.95,headOnlyScale:.9,canvasWidth:768,garmentBalancedNeck:true,poseOnlyHead:true,rearHairGuide,stableGarmentFrame:i%2===0,collarContext:{template:'/assets/'+file},returnNativeForeground:true};
  const old=await createEnglishBodyLayout(outfit,options),fresh=await createEnglishBodyLayout(outfit,{...options,wholeHeadGuide:{}}),m=fresh.measuredWholeHead;
  assert(m.widthToShoulder<=.42+1e-9,file);assert(m.heightToShoulder<=.567+1e-9,file);assert(m.scale<=1.05&&m.scale>0,file);assert(old.nativeForeground.equals(fresh.nativeForeground),file+' native garment stays exact');
  for(const key of ['shoulderSpan','shoulderTopY','collarTopY','centerX'])assert.equal(old[key],fresh[key],file+' '+key);
  const previous=await createEnglishBodyLayout(outfit,{...options,wholeHeadGuide:{version:LEGACY}});
  assert.equal(fresh.measuredCollar.chinY,previous.measuredCollar.chinY,file+' chin anchor stays exact');assert.equal(fresh.measuredCollar.gap,previous.measuredCollar.gap,file+' neck stays exact');assert(previous.nativeForeground.equals(fresh.nativeForeground));
  assert(Math.abs(m.faceWidth/previous.measuredWholeHead.faceWidth-1.05)<1e-9,file+' isotropic five percent head increase');
  assert(fresh.measuredCollar.gap<=old.measuredCollar.gap+1e-9);assert((await createEnglishBodyLayout(outfit,{...options,wholeHeadGuide:null})).composition.equals(old.composition),'Archived board unchanged');
 }
});
test('new female full-image requests use bounded hair-aware guides and one generation without old larger-head instructions or output pasting',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:{create:{width:80,height:115,channels:4,background:'#bd9887'}},left:8,top:13}]).png().toBuffer();
 for(const [gender,finish,file,hair]of [['female','makeup','government-uniforms/female-operational.png','seedream-14'],['female','natural','job-uniforms/female-navy-suit-2.png','seedream-42'],['female','makeup','gown-uniforms/kmitl-female.png','seedream-79']]){
  const female=gender==='female',fields={portraitMode:gender,femaleEyeStyle:finish,thaiWholeHeadGuideVersion:VERSION,thaiCollarContextVersion:THAI_COLLAR_CONTEXT_VERSION,thaiPortraitPolishVersion:THAI_PORTRAIT_POLISH_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION,thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:female?ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:hair,neckOutfitReferencePath:'/assets/'+file,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),...(female?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})};
  let calls=0,firstBoard=null;const audit=createMakeupRequestAudit(async args=>{calls++;firstBoard=args.portrait;assert.equal(args.singleAttempt,true);assert(args.prompt.includes('WHOLE HEAD INCLUDING HAIR'));assert(args.prompt.includes('OUTER HEAD limits'));assert(args.prompt.includes('at most 42%'));assert(args.prompt.includes('at most 56.7%'));assert(args.prompt.includes('SAME ONE image generation'));for(const text of ['38–40%','naturally larger but balanced female','restore the larger approved female','ADDITIONAL SMALLER HEAD'])assert(!args.prompt.includes(text),text);assert(args.prompt.includes('THIS GARMENT\'S COLLAR CONTACT'));if(finish==='natural')assert(!args.prompt.includes('CLEAR SKIN / DIFFUSED'));else assert(args.prompt.includes('CLEAR SKIN / DIFFUSED'));assert(!args.adaptiveComposition,'one primary board, no conflicting second layout');assert(args.identity?.length,'neutral board always has a separate real identity reference');const meta=await sharp(args.portrait).metadata();assert.equal(meta.width,1824);assert.equal(meta.height,2432);return {png}},{requirePolicy:finish==='makeup'});
  const output=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>png,requestPortrait:audit.requestPortrait});assert.equal(calls,1);const a=await sharp(output).ensureAlpha().raw().toBuffer(),b=await sharp(png).ensureAlpha().raw().toBuffer();assert(a.equals(b),'The delivered generated pixels are not locally resized or covered by the reference garment');
  let alternateCalls=0;await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...fields,faceIdentityBox:JSON.stringify([.3,.1,.7,.9])},root,key:'inert',removeBackground:async()=>png,requestPortrait:async args=>{alternateCalls++;assert(args.portrait.equals(firstBoard),'Different identity-crop aspect must not change the neutral head, neck or garment board');return {png}}});assert.equal(alternateCalls,1);

 }
});

test('male requests ignore the latest whole-head marker and retain the exact preceding prompt and guide',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:{create:{width:80,height:115,channels:4,background:'#bd9887'}},left:8,top:13}]).png().toBuffer();
 for(const [hair,file]of [['thai-male-auto','government-uniforms/male-government-employee.png'],['seedream-36','job-uniforms/male-job-black-solid-tie.webp']]){
  const fields={portraitMode:'male',femaleEyeStyle:'natural',thaiCollarContextVersion:THAI_COLLAR_CONTEXT_VERSION,thaiPortraitPolishVersion:THAI_PORTRAIT_POLISH_VERSION,thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:hair,neckOutfitReferencePath:'/assets/'+file,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53})};
  const requests=[];
  for(const marker of [undefined,VERSION]){let calls=0;await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...fields,thaiWholeHeadGuideVersion:marker},root,key:'inert',removeBackground:async()=>png,requestPortrait:async args=>{calls++;requests.push(args);return {png}}});assert.equal(calls,1)}
  const [before,after]=requests;assert.equal(after.prompt,before.prompt);assert(!after.prompt.includes('WHOLE HEAD INCLUDING HAIR'));assert(after.prompt.includes('ADDITIONAL SMALLER HEAD'));assert(after.adaptiveComposition?.length);
  for(const key of ['portrait','adaptiveComposition','identity','hair','outfit'])assert.deepEqual(after[key],before[key],hair+' '+key+' stays byte-identical');
 }
});
