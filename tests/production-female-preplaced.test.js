import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {FEMALE_PREPLACED_PROMPT_VERSION as VERSION} from '../female-exact-prompt-policy.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {createMakeupRequestAudit} from '../makeup-generation-audit.js';
import {seedreamReviewPayload,requestReviewSeedream} from '../seedream-review-transport.js';
import {proLabPayload} from '../seedream-pro-lab.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_PORTRAIT_POLISH_VERSION} from '../thai-portrait-polish.js';
import {THAI_COLLAR_CONTEXT_VERSION} from '../thai-collar-context.js';
import {THAI_FEMALE_HEAD_SIZE_VERSION} from '../thai-female-head-size.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
const root=new URL('..',import.meta.url).pathname;
const base={faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),portraitMode:'female',femaleEyeStyle:'makeup',thaiWholeHeadGuideVersion:VERSION,thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiPortraitPolishVersion:THAI_PORTRAIT_POLISH_VERSION,thaiCollarContextVersion:THAI_COLLAR_CONTEXT_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION,englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,portraitComposition:'en-outfit-body-v1',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',hairReferenceVersion:'picker-hair-v1'};

import {captureFemaleFaceEvidence,FEMALE_FACE_OUTLINE,parseFemaleFaceEvidence} from '../female-preplaced-face-contract.js';
import {prepareFemaleFace} from '../female-preplaced-face.js';
import {femaleFullLabPrompt} from '../female-full-lab-prompt.js';
import {femaleFlashLabPayload} from '../female-preplaced-payload.js';
import {PRODUCTION_FEMALE_V9_PROMPT} from '../production-female-v9-prompt.js';
const landmarks=[];
for(const [i,id]of FEMALE_FACE_OUTLINE.entries()){const a=2*Math.PI*i/FEMALE_FACE_OUTLINE.length;landmarks[id]={x:.5+.22*Math.sin(a),y:.475-.275*Math.cos(a)};}
for(const [id,x,y]of [[33,.35,.4],[263,.65,.4],[1,.5,.55],[152,.5,.75],[234,.28,.5],[454,.72,.5]])landmarks[id]={x,y};
const evidence=captureFemaleFaceEvidence(landmarks,480,640);
const png=await sharp({create:{width:480,height:640,channels:4,background:{r:176,g:143,b:127,alpha:.8}}}).png().toBuffer();
const input={buffer:png,mimetype:'image/png'};
const fields={...base,femalePreplacedFace:JSON.stringify(evidence),hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};

test('new production female uses the lab v9 Flash payload exactly once and preserves alpha-only delivery',async()=>{
 const face=await prepareFemaleFace(png,evidence),outfit=await readFile(root+'public'+fields.neckOutfitReferencePath),hair=await readFile(root+'public/assets/seedream-hairstyles/references/14.png');
 const expected=await femaleFlashLabPayload({prompt:femaleFullLabPrompt(),order:'person-outfit-hair',files:{person:[input],face:[{buffer:face}],outfit:[{buffer:outfit}],hair:[{buffer:hair}]}});
 let calls=0,matting=0;
 const audit=createMakeupRequestAudit(async args=>{calls++;assert.equal(args.prompt,femaleFullLabPrompt());assert.equal(args.singleAttempt,true);assert.equal(args.femalePreplacedVersion,VERSION);assert.deepEqual(seedreamReviewPayload(args),expected);return {png};},{requirePolicy:true});
 const result=await processProductionPortrait({input,fields,root,key:'inert',requestPortrait:audit.requestPortrait,removeBackground:async()=>{matting++;return png;}});
 assert.equal(calls,1);assert.equal(matting,1);assert.deepEqual(await sharp(result).raw().toBuffer(),await sharp(png).raw().toBuffer());
 assert.deepEqual(audit.snapshot(),{providerCalls:1,makeupPolicyVersion:VERSION});
});

test('missing or invalid face evidence fails before provider, never falls back to old prompts',async()=>{
 let calls=0;const requestPortrait=async()=>{calls++;throw Error('UNEXPECTED_CALL');};
 for(const raw of [undefined,'{}',JSON.stringify({...evidence,width:12}),JSON.stringify({...evidence,width:600})]){
  await assert.rejects(processProductionPortrait({input,fields:{...fields,femalePreplacedFace:raw},root,key:'inert',requestPortrait,removeBackground:async()=>png}));
 }
 assert.equal(calls,0);
});

test('new female provider failures never retry or perform legacy generation',async()=>{
 let calls=0;await assert.rejects(processProductionPortrait({input,fields,root,key:'inert',requestPortrait:async()=>{calls++;throw Error('INERT_FAILURE');},removeBackground:async()=>png}),/INERT_FAILURE/);assert.equal(calls,1);
 let requests=0;await assert.rejects(requestReviewSeedream({key:'inert',prompt:femaleFullLabPrompt(),femalePreplacedVersion:VERSION,preparedFemalePayload:{model:'dola-seedream-5-0-flash-260915',prompt:femaleFullLabPrompt(),size:'2K',image:['a','b','c','d']}},{fetchImpl:async()=>{requests++;return Response.json({error:{message:'inert'}},{status:503});}}));assert.equal(requests,1);
});

test('frontend-safe evidence stays small and production submission recovery remains stable',async()=>{
 assert.equal(PRODUCTION_FEMALE_V9_PROMPT,femaleFullLabPrompt());
 const generation=await readFile(root+'female-exact-reference-request.js','utf8');
 assert(generation.includes("from './production-female-skin-prompt.js'"));assert(!generation.includes("from './female-full-lab-prompt.js'"));
 assert(JSON.stringify(evidence).length<12000);assert.deepEqual(parseFemaleFaceEvidence(JSON.stringify(evidence)),evidence);
 const source=await readFile(root+'src/main.jsx','utf8');assert(source.includes("if(measured.femalePreplacedFace)fd.append('femalePreplacedFace'"));
 assert(source.includes('FEMALE_REAR_HAIR_VERSION as FEMALE_EXACT_PROMPT_VERSION'));
});


test('new production skin finish changes only cosmetics/light, preserving v9 references and lab prompt',async()=>{
 const {FEMALE_LUMINOUS_PROMPT_VERSION}=await import('../female-exact-prompt-policy.js');
 const {PRODUCTION_FEMALE_LUMINOUS_PROMPT,productionFemalePromptFor}=await import('../production-female-skin-prompt.js');
 const old=PRODUCTION_FEMALE_V9_PROMPT,prompt=PRODUCTION_FEMALE_LUMINOUS_PROMPT;
 const composition=s=>s.slice(0,s.indexOf('MAKEUP — THE ONLY FEMALE FINISH:'));
 assert.equal(composition(prompt),composition(old));assert.equal(femaleFullLabPrompt(),old);
 for(const term of ['skin wrinkles and fine lines','fine, subtle, evenly distributed photographic pores','softly diffused frontal softbox']){assert(prompt.includes(term),term);}
 assert(!prompt.includes('Do not blur, diffuse, airbrush, denoise or globally smooth the skin.'));
 assert.equal(productionFemalePromptFor(VERSION),old);
 const calls=[],run=version=>processProductionPortrait({input,fields:{...fields,thaiWholeHeadGuideVersion:version},root,key:'inert',requestPortrait:createMakeupRequestAudit(async args=>{calls.push(args);return {png};},{requirePolicy:true}).requestPortrait,removeBackground:async()=>png});
 await run(VERSION);await run(FEMALE_LUMINOUS_PROMPT_VERSION);
 assert.equal(calls.length,2);assert.equal(calls[1].prompt,prompt);assert.equal(calls[1].femalePreplacedVersion,FEMALE_LUMINOUS_PROMPT_VERSION);
 const before=seedreamReviewPayload(calls[0]),after=seedreamReviewPayload(calls[1]);
 assert.deepEqual(before.image,after.image);assert.equal(after.model,before.model);assert.equal(after.size,before.size);
});


test('new selected short/bob/gathered styles use the exact file and face-only identity, with no old hair source',async()=>{
 const {FEMALE_HAIR_REPLACEMENT_VERSION,FEMALE_LUMINOUS_PROMPT_VERSION}=await import('../female-exact-prompt-policy.js');
 const {productionFemalePromptFor}=await import('../production-female-skin-prompt.js');
 const prompt=productionFemalePromptFor(FEMALE_HAIR_REPLACEMENT_VERSION),previous=productionFemalePromptFor(FEMALE_LUMINOUS_PROMPT_VERSION);
 assert(prompt.includes('MANDATORY COMPLETE HAIRSTYLE REPLACEMENT'));assert(prompt.includes('hidden long rear curtain'));
 assert.equal(prompt.slice(prompt.indexOf('MAKEUP — THE ONLY FEMALE FINISH:')),previous.slice(previous.indexOf('MAKEUP — THE ONLY FEMALE FINISH:')));
 const face=await prepareFemaleFace(png,evidence);
 for(const [id,file]of [['seedream-05','5.png'],['seedream-10','10.png'],['seedream-24','24.png'],['seedream-79','79.png'],['seedream-14','14.png']]){
  let calls=0;
  await processProductionPortrait({input,fields:{...fields,hairId:id,creditKind:'hairstyle',thaiWholeHeadGuideVersion:FEMALE_HAIR_REPLACEMENT_VERSION},root,key:'inert',removeBackground:async()=>png,requestPortrait:createMakeupRequestAudit(async args=>{
   calls++;const payload=seedreamReviewPayload(args);
   assert.equal(payload.prompt,prompt);assert.equal(payload.image.length,4);
   assert.deepEqual(Buffer.from(payload.image[1].split(',')[1],'base64'),face);
   assert.notDeepEqual(Buffer.from(payload.image[1].split(',')[1],'base64'),png);
   assert.deepEqual(Buffer.from(payload.image[2].split(',')[1],'base64'),await readFile(root+'public/assets/seedream-hairstyles/references/'+file));
   return {png};
  },{requirePolicy:true}).requestPortrait});
  assert.equal(calls,1);
 }
 // Explicitly retained/original hair continues to have the original hair reference.
 await processProductionPortrait({input,fields:{...fields,hairId:'original',hairReferenceVersion:undefined,thaiWholeHeadGuideVersion:FEMALE_HAIR_REPLACEMENT_VERSION},root,key:'inert',removeBackground:async()=>png,requestPortrait:async args=>{assert.deepEqual(Buffer.from(seedreamReviewPayload(args).image[2].split(',')[1],'base64'),png);return {png};}});
});


test('rebuilding each female outfit category recomputes its preplaced edit canvas from original face',async()=>{
 const {FEMALE_HAIR_REPLACEMENT_VERSION}=await import('../female-exact-prompt-policy.js');
 const {createFemaleLabBase}=await import('../production-female-v9-layout.js');
 const face=await prepareFemaleFace(png,evidence);
 for(const path of ['job-uniforms/female-job-navy-notch-white-shirt.png','government-uniforms/female-operational.png','gown-uniforms/kmitl-female.png','student-uniforms/female-01.png']){
  const outfit=await readFile(root+'public/assets/'+path),expected=await createFemaleLabBase(outfit,face);let calls=0;
  await processProductionPortrait({input,fields:{...fields,neckOutfitReferencePath:'/assets/'+path,thaiWholeHeadGuideVersion:FEMALE_HAIR_REPLACEMENT_VERSION},root,key:'inert',removeBackground:async()=>png,requestPortrait:async args=>{
   calls++;const payload=seedreamReviewPayload(args);
   assert.deepEqual(Buffer.from(payload.image[0].split(',')[1],'base64'),expected);
   assert.deepEqual(Buffer.from(payload.image[3].split(',')[1],'base64'),outfit);return {png};
  }});assert.equal(calls,1);
 }
});


test('rear-hair production version keeps one Flash request with original face and exact hair reference',async()=>{
 const {FEMALE_REAR_HAIR_VERSION,FEMALE_HAIR_REPLACEMENT_VERSION}=await import('../female-exact-prompt-policy.js');
 const {productionFemalePromptFor}=await import('../production-female-skin-prompt.js');
 const prompt=productionFemalePromptFor(FEMALE_REAR_HAIR_VERSION);
 assert(prompt.includes('HAIR OCCLUSION — ALL HAIRSTYLES, INCLUDING ORIGINAL HAIR'));
 assert(!prompt.includes('For a long reference, follow its actual ends without inventing extra lengths.'));
 const old=productionFemalePromptFor(FEMALE_HAIR_REPLACEMENT_VERSION);
 assert(!old.includes('HAIR OCCLUSION'));
 assert.equal(prompt.slice(prompt.indexOf('MAKEUP — THE ONLY FEMALE FINISH:'),prompt.indexOf('\nHAIR OCCLUSION')),old.slice(old.indexOf('MAKEUP — THE ONLY FEMALE FINISH:')));
 for(const [id,file] of [['seedream-05','5.png'],['seedream-14','14.png'],['seedream-79','79.png'],['original',null]]){
  let calls=0;
  await processProductionPortrait({input,fields:{...fields,hairId:id,thaiWholeHeadGuideVersion:FEMALE_REAR_HAIR_VERSION,...(!file?{hairReferenceVersion:undefined}:{})},root,key:'inert',removeBackground:async()=>png,requestPortrait:createMakeupRequestAudit(async args=>{
   calls++;const payload=seedreamReviewPayload(args);assert.equal(payload.prompt,prompt);assert.equal(payload.image.length,4);
   assert.equal(payload.model,'dola-seedream-5-0-flash-260915');assert.equal(payload.size,'2K');
   if(file)assert.deepEqual(Buffer.from(payload.image[1].split(',')[1],'base64'),await prepareFemaleFace(png,evidence));
   assert.deepEqual(Buffer.from(payload.image[2].split(',')[1],'base64'),file?await readFile(root+'public/assets/seedream-hairstyles/references/'+file):png);
   return {png};
  },{requirePolicy:true}).requestPortrait});assert.equal(calls,1);
 }
});
