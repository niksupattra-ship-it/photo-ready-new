import {garmentNeckBalance} from '../garment-neck-balance.js';
import {measureUniformAnchors} from '../src/portrait-uniform-fit.js';
import {sanitizeAiError,sanitizedAiJob} from '../ai-error-sanitizer.js';
import {planThaiBodyFrame} from '../src/thai-body-framing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createThaiAdaptiveComposition} from '../thai-adaptive-composition.js';
import {usesThaiFemaleSmallerHead,usesThaiEnglishMakeupHead,usesThaiFrontalPose,isKnownThaiHeadVersion,THAI_NEW_NECK_GAP,THAI_FEMALE_HEAD_SIZE_VERSION,THAI_FEMALE_HEAD_SIZE_INSTRUCTION} from '../thai-female-head-size.js';
import {thaiBodyGeometryInstruction,THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {createEnglishBodyLayout,ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE} from '../english-body-layout.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';
import {processProductionPortrait,portraitIdentityCrop} from '../production-portrait-pipeline.js';
const root=new URL('..',import.meta.url).pathname;
test('new version only opts Thai females into the smaller head; other locales/genders and stored old jobs stay PR143',()=>{
 const fields={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION};
 assert(usesThaiFemaleSmallerHead(fields,'female'));assert(!usesThaiFemaleSmallerHead(fields,'male'));assert(!usesThaiFemaleSmallerHead({...fields,thaiOutfitAiVersion:undefined,interfaceLanguage:'en'},'female'));assert(usesThaiFemaleSmallerHead({...fields,interfaceLanguage:'en'},'female'),'Internal English renderer keeps Thai marker');assert(!usesThaiFemaleSmallerHead({},'female'));
 const text=thaiBodyGeometryInstruction(fields,'female');assert(text.includes('90%'));assert(!text.includes('around 0.30'));assert(!text.includes('0.40–0.45'));
 assert(thaiBodyGeometryInstruction({...fields,thaiFemaleHeadSizeVersion:''},'female').includes('around 0.30'));
});
test('actual guide shrinks only head width and height about 10%, retaining chin anchor and exact lower garment pixels',async()=>{
 const outfit=await readFile(root+'public/assets/government-uniforms/female-operational.png');
 for(const aspect of [1.15,1.5,2.1]){
  const identity=await sharp({create:{width:120,height:Math.round(120*aspect),channels:3,background:{r:201,g:96,b:74}}}).png().toBuffer();
  const args={outfit,identity,evidence:{version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53},gender:'female'};
  const old=await createThaiAdaptiveComposition(args),newGuide=await createThaiAdaptiveComposition({...args,smallerFemaleHead:true});
  const dec=b=>sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true}),[a,b]=await Promise.all([dec(old),dec(newGuide)]);assert.deepEqual(a.info,b.info);
  const W=a.info.width,H=a.info.height,row=W*4;assert(a.data.subarray(Math.floor(H*.55)*row).equals(b.data.subarray(Math.floor(H*.55)*row)),'Keep native suit placement and pixels exact');
  const box=d=>{let l=W,r=-1,t=H,z=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(Math.abs(d[i]-201)<2&&Math.abs(d[i+1]-96)<2&&Math.abs(d[i+2]-74)<2){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);z=Math.max(z,y)}}return {w:r-l+1,h:z-t+1,bottom:z,cx:(l+r)/2}};
  const x=box(a.data),y=box(b.data);assert(x.w>0&&y.w>0);assert(Math.abs(y.w/x.w-.9)<.015);assert(Math.abs(y.h/x.h-.9)<.015);assert(Math.abs(y.bottom-x.bottom)<=2);assert(Math.abs(y.cx-x.cx)<=2);
 }
});
test('Natural and Makeup use one generation with the smaller-head guide and final fixed-body instruction',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9887'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 for(const finish of ['natural','makeup']){
  let calls=0;const fields={portraitMode:'female',femaleEyeStyle:finish,thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,thaiFemaleHeadSizeVersion:'thai-pr143-female-head-90-full-body-v2'};
  const result=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>png,requestPortrait:async options=>{calls++;assert(options.adaptiveComposition?.length);const expectedGuide=await createThaiAdaptiveComposition({outfit:options.outfit,identity:options.identity,evidence:fields.thaiAdaptiveFaceGeometry,gender:'female',smallerFemaleHead:true});assert(options.adaptiveComposition.equals(expectedGuide),'Actual provider receives the reduced-head guide despite internal locale normalization');assert(options.prompt.endsWith(THAI_FEMALE_HEAD_SIZE_INSTRUCTION));assert(!options.prompt.includes('cheek-to-cheek width around 0.30'));assert(!options.prompt.includes('27–31%'));assert.equal(options.prompt.split(THAI_FEMALE_HEAD_SIZE_INSTRUCTION).length-1,1);return {png}}});assert(result.length);assert.equal(calls,1);
 }
});

test('PR143 placement does not enlarge or move the body when the head alone is reduced',()=>{
 const W=300,H=400,p=new Uint8ClampedArray(W*H*4);for(let y=10;y<H;y++)for(let x=20;x<280;x++)p[(y*W+x)*4+3]=255;
 const head={top:20,width:120,height:180,centerX:150},smaller={...head,top:38,width:108,height:162};
 const original=planThaiBodyFrame(p,W,H,{head}),reduced=planThaiBodyFrame(p,W,H,{head:smaller,headScale:.9});
 for(const k of ['scale','x','y'])assert(Math.abs(original[k]-reduced[k])<1e-8,k);
});

test('rollback keeps credential redaction while result bytes and ownership remain unchanged',()=>{
 const result=Buffer.from('same accepted image'),job={wallet_id:'same-owner',status:'completed',result,error:'Bearer sk-proj-fake_test_value_123456789'};
 assert(!sanitizeAiError(job.error).includes('sk-proj-fake_test_value_123456789'));
 const clean=sanitizedAiJob(job);assert.equal(clean.result,result);assert.equal(clean.wallet_id,job.wallet_id);assert.equal(clean.status,job.status);
});

test('generated-head size metadata survives server recovery, alternate finish and Studio reopening',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8'),store=await readFile(root+'job-store.js','utf8'),editor=await readFile(root+'src/studio-editor.jsx','utf8');
 assert(store.includes('AS "thaiFemaleHeadSizeVersion"'));
 assert(main.includes('blob.idpromThaiFemaleHeadSizeVersion=j.thaiFemaleHeadSizeVersion'));assert(main.includes('blob.idpromThaiFemaleHeadSizeVersion=job.thaiFemaleHeadSizeVersion'));
 assert(main.includes('thaiFemaleHeadSizeVersion:headMasterBlob.idpromThaiFemaleHeadSizeVersion'));
 assert(editor.includes('fullBodyFrame:head.thaiFemaleHeadSizeVersion===THAI_FEMALE_HEAD_SIZE_VERSION'));
});


test('new generated head is smaller but coat fills frame independently of head size or source padding',()=>{
 for(const [left,right,bottom] of [[20,280,399],[70,250,370],[5,295,399]]){
  const W=300,H=400,p=new Uint8ClampedArray(W*H*4);
  for(let y=170;y<=bottom;y++)for(let x=left;x<right;x++)p[(y*W+x)*4+3]=255;
  for(let y=15;y<170;y++)for(let x=100;x<200;x++)p[(y*W+x)*4+3]=255;
  const plans=[{top:15,width:130,height:180,centerX:140},{top:33,width:117,height:162,centerX:160}].map(head=>planThaiBodyFrame(p,W,H,{head,headScale:.9,fullBodyFrame:true}));
  for(const plan of plans){
   assert.equal(plan.scale,904/(right-left));
   assert(plan.x+left*plan.scale<=0);assert(plan.x+right*plan.scale>=900);
   assert(plan.y+(bottom+1)*plan.scale>=1200);assert.equal(plan.headFitLimited,false);
  }
  assert.equal(plans[0].scale,plans[1].scale);assert.equal(plans[0].x,plans[1].x);
 }
});


test('new Thai Makeup uses the actual English female Makeup Image 1 and head builder, not a late adaptive board',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9887'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 const input={buffer:png,mimetype:'image/png'},box=[.2,.1,.8,.7];
 const common={interfaceLanguage:'en',portraitMode:'female',femaleEyeStyle:'makeup',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify(box),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION};
 const requests=[];
 for(const thai of [false,true,'new-neck','frontal']){
  let count=0;
  const fields=thai?{...common,interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiRearHairShortNeckVersion:'thai-natural-neck-rear-hair-v2',thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),thaiFemaleHeadSizeVersion:thai==='frontal'?THAI_FEMALE_HEAD_SIZE_VERSION:thai==='new-neck'?'thai-english-makeup-garment-neck-v5':'thai-english-makeup-head-v3'}:common;
  await processProductionPortrait({input,fields,root,key:'inert',removeBackground:async()=>png,requestPortrait:async options=>{count++;requests.push(options);return {png}}});assert.equal(count,1);
 }
 const [english,thai,newNeck,frontal]=requests;
 assert(thai.portrait.equals(english.portrait),'Actual primary AI input must be byte-identical to English for identical source/outfit');
 assert.equal(thai.identity,null);assert(!thai.adaptiveComposition);assert(thai.outfit.equals(english.outfit));assert.equal(thai.size,english.size);
 const identity=await portraitIdentityCrop(input,box),expected=await createEnglishBodyLayout(thai.outfit,{headScale:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE.identityHeadScale,identity,canvasWidth:1824,profile:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE});assert(thai.portrait.equals(expected));
 for(const text of ['IMAGE 1 IS THE BASE CANVAS AND BODY GEOMETRY AUTHORITY','ENGLISH FEMALE V2 — BALANCED HEAD/BODY','38–40%','Keep the garment at EXACTLY this template size'])assert(thai.prompt.includes(text)&&english.prompt.includes(text));
 for(const text of ['No mannequin, composited head','Image 1 is the uploaded PERSON','ONE AUTHORITATIVE HEAD / SHOULDER PROPORTION','Scale and move the whole portrait uniformly only','MEASURED COMPOSITION — IMAGE','FINAL COLLAR MEASUREMENT CHECK V2'])assert(!thai.prompt.includes(text),text);
 assert(thai.makeupStudioReference?.equals(english.makeupStudioReference));
 const expectedNeck=await createEnglishBodyLayout(thai.outfit,{headScale:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE.identityHeadScale,identity,canvasWidth:1824,profile:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE,garmentBalancedNeck:true});
 assert(newNeck.portrait.equals(expectedNeck));assert(!newNeck.adaptiveComposition);assert(newNeck.outfit.equals(thai.outfit));
 assert(newNeck.prompt.includes('uploaded neck length, thickness, folds, tilt and posture have NO authority'));
 assert(!/\b(?:naturally )?short (?:supporting |naturally widening )?neck\b/i.test(newNeck.prompt));
 const dec=b=>sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true}),old=await dec(thai.portrait),fresh=await dec(newNeck.portrait);
 assert.deepEqual(old.info,fresh.info);const offset=Math.floor(old.info.height*.7)*old.info.width*4;
 assert(old.data.subarray(offset).equals(fresh.data.subarray(offset)),'New neck must never resize or move lower garment pixels');
 const faceBox=d=>{const W=old.info.width,H=old.info.height;let l=W,r=-1,t=H,b=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(Math.abs(d[i]-189)<2&&Math.abs(d[i+1]-152)<2&&Math.abs(d[i+2]-135)<2){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}}return {w:r-l+1,h:b-t+1,t,b}};
 const before=faceBox(old.data),after=faceBox(fresh.data);assert(before.w>20);assert.equal(after.w,before.w);assert.equal(after.h,before.h);assert(after.t<before.t);assert(after.b<before.b);
 const frontalExpected=await createEnglishBodyLayout(thai.outfit,{headScale:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE.identityHeadScale,identity,canvasWidth:1824,profile:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE,garmentBalancedNeck:true,poseOnlyHead:true});
 assert(frontal.portrait.equals(frontalExpected));assert(!frontal.portrait.equals(newNeck.portrait));assert(frontal.identity.equals(identity));assert(frontal.outfit.equals(thai.outfit));assert(!frontal.adaptiveComposition);
 assert(frontal.prompt.includes('deliberately contains no pasted customer face'));assert(frontal.prompt.includes('Bring the chin gently back over the neck centre'));
 assert(!frontal.prompt.includes('It already contains THIS real person'));
 const f=await dec(frontal.portrait);assert(f.data.subarray(offset).equals(fresh.data.subarray(offset)),'Frontal pose must not alter garment geometry');


});


test('English Makeup head reuse is limited to new Thai female Makeup, retaining old jobs and Natural',()=>{
 const fields={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION,femaleEyeStyle:'makeup'};
 assert(usesThaiEnglishMakeupHead(fields,'female'));assert(!usesThaiEnglishMakeupHead(fields,'male'));
 assert(!usesThaiEnglishMakeupHead({...fields,femaleEyeStyle:'natural'},'female'));
 assert(!usesThaiEnglishMakeupHead({...fields,thaiOutfitAiVersion:undefined,interfaceLanguage:'en'},'female'));
 for(const version of ['thai-pr143-female-head-90-full-body-v2','thai-pr143-female-head-90-v1',undefined])assert(!usesThaiEnglishMakeupHead({...fields,thaiFemaleHeadSizeVersion:version},'female'));
});


test('garment-derived neck height varies with actual collar/shoulder geometry while head size and suit pixels stay fixed',async()=>{
 const identity=await sharp({create:{width:120,height:174,channels:3,background:'#01fe23'}}).png().toBuffer(),gaps=[];
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-ivory-bow-blouse.png','job-uniforms/female-job-navy-collared.png','student-uniforms/female-01.png']){
  const outfit=await readFile(root+'public/assets/'+path),{data,info}=await sharp(outfit).ensureAlpha().raw().toBuffer({resolveWithObject:true}),u=measureUniformAnchors(data,info.width,info.height);
  const headHeight=u.shoulderWidth*.41*.95*(174/120+.12),m=garmentNeckBalance(data,info.width,info.height,u,headHeight);
  assert.equal(m.reason,'garment_shoulders');assert(m.gap/u.shoulderWidth>=.012-1e-8&&m.gap/u.shoulderWidth<=.045+1e-8);gaps.push(m.gap/u.shoulderWidth);
  const opts={headScale:.95,identity,canvasWidth:1824,profile:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE},oldGuide=await createEnglishBodyLayout(outfit,{...opts,neckHeadRatio:THAI_NEW_NECK_GAP}),guide=await createEnglishBodyLayout(outfit,{...opts,garmentBalancedNeck:true});
  const dec=b=>sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true}),[a,b]=await Promise.all([dec(oldGuide),dec(guide)]),offset=Math.floor(a.info.height*.7)*a.info.width*4;
  assert.deepEqual(a.info,b.info);assert(a.data.subarray(offset).equals(b.data.subarray(offset)),'Native lower garment remains exactly in place');
  const bounds=d=>{let l=1824,r=-1,t=2432,z=-1;for(let y=0;y<2432;y++)for(let x=0;x<1824;x++){const i=(y*1824+x)*4;if(Math.abs(d[i]-1)<2&&Math.abs(d[i+1]-254)<2&&Math.abs(d[i+2]-35)<2){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);z=Math.max(z,y)}}return {width:r-l+1,height:z-t+1,top:t,bottom:z}};
  const old=bounds(a.data),next=bounds(b.data);assert(old.width>20);assert.equal(next.width,old.width);assert.equal(next.height,old.height);assert(next.bottom>old.bottom,'Lower the unchanged head toward this collar to remove the excessive gap');
 }
 assert(Math.max(...gaps)-Math.min(...gaps)>.01,'Different collar/shoulder constructions must produce different neck gaps');
});


test('frontal reconstruction is limited to the new Thai female Makeup version with severe identity/eye gates retained',async()=>{
 const fields={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION,femaleEyeStyle:'makeup'};
 assert(usesThaiFrontalPose(fields,'female'));assert(!usesThaiFrontalPose(fields,'male'));
 assert(!usesThaiFrontalPose({...fields,femaleEyeStyle:'natural'},'female'));assert(!usesThaiFrontalPose({...fields,thaiOutfitAiVersion:undefined,interfaceLanguage:'en'},'female'));
 for(const version of ['thai-english-makeup-garment-neck-v5','thai-english-makeup-new-neck-v4','thai-english-makeup-head-v3'])assert(!usesThaiFrontalPose({...fields,thaiFemaleHeadSizeVersion:version},'female'));
 const main=await readFile(root+'src/main.jsx','utf8');assert(main.includes("if(eyeLock.action==='reject'||triage.action==='reject')"));assert(main.includes("if(!faceLock.ok)cached.value.idpromQualityReviewNeeded=true"));
});


test('recovery preserves actual generation version instead of relabelling old neck poses as current',async()=>{
 for(const v of [THAI_FEMALE_HEAD_SIZE_VERSION,'thai-english-makeup-garment-neck-v5','thai-english-makeup-new-neck-v4','thai-english-makeup-head-v3','thai-pr143-female-head-90-v1'])assert(isKnownThaiHeadVersion(v));
 for(const v of [null,undefined,'unknown'])assert(!isKnownThaiHeadVersion(v));
 const main=await readFile(root+'src/main.jsx','utf8');
 assert(main.includes('if(isKnownThaiHeadVersion(j.thaiFemaleHeadSizeVersion))'));assert(main.includes('if(isKnownThaiHeadVersion(job.thaiFemaleHeadSizeVersion))'));
 assert.equal(main.split('finished.idpromThaiFemaleHeadSizeVersion=cached.value.idpromThaiFemaleHeadSizeVersion').length-1,2);
 assert(!main.includes('finished.idpromThaiFemaleHeadSizeVersion=THAI_FEMALE_HEAD_SIZE_VERSION'));
});
