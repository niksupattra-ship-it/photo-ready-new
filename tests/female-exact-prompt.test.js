import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {FEMALE_EXACT_PROMPT_VERSION as VERSION,FEMALE_EXACT_PROMPT as PROMPT} from '../female-exact-prompt-policy.js';
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
const png=await sharp({create:{width:96,height:128,channels:4,background:{r:176,g:143,b:127,alpha:.8}}}).png().toBuffer();
const input={buffer:png,mimetype:'image/png'};

test('approved source is one complete exact prompt with the pasted duplicate tail removed',()=>{
 assert(PROMPT.includes('High-resolution 2K.'));
 assert.equal(createHash('sha256').update(PROMPT).digest('hex'),'e8b1e2acbe9373e39693e2921cc2ebe00ca93d01e8a619a8dbf10ebb10112848');
 assert.equal(PROMPT.split('Combine the three reference images').length-1,1);
 assert(PROMPT.endsWith('no additional accessories.'));
});

test('new female outfit/hair variants send ONLY approved prompt and three correctly ordered images once',async()=>{
 for(const [file,hair]of [['government-uniforms/female-operational.png','seedream-14'],['job-uniforms/female-navy-suit-2.png','seedream-42'],['gown-uniforms/kmitl-female.png','seedream-79'],['student-uniforms/female-01.png','seedream-16']]){
  let calls=0,matting=0;
  const audit=createMakeupRequestAudit(async args=>{
   calls++;assert.equal(args.prompt,PROMPT);assert.equal(args.singleAttempt,true);assert.equal(args.size,'1.5K');
   assert.equal(args.femaleExactPromptVersion,VERSION);
   for(const key of ['identity','makeup','skinReference','neckReference','neckShapeReference','hairPlacementReference','compositionReference','makeupStudioReference','outfitDetailReference','adaptiveComposition'])assert.equal(args[key],undefined,key);
   const payload=seedreamReviewPayload(args);assert.equal(payload.image.length,3);
   assert.deepEqual(payload,await proLabPayload({prompt:PROMPT,files:{person:[{buffer:args.portrait}],outfit:[{buffer:args.outfit}],hair:[{buffer:args.hair}]}}),'Production female request must exactly match the current Pro Lab payload');
   assert.equal(payload.model,'dola-seedream-5-0-pro-260628');assert.equal(payload.size,'1.5K');assert.equal(payload.image[0],'data:image/png;base64,'+args.portrait.toString('base64'));
   assert.equal(payload.image[2],'data:image/png;base64,'+args.hair.toString('base64'));
   assert.equal(payload.image[1],'data:image/png;base64,'+args.outfit.toString('base64'));
   assert.deepEqual(args.outfit,await readFile(root+'public/assets/'+file));assert.deepEqual(args.portrait,input.buffer);
   return {png};
  },{requirePolicy:true});
  const out=await processProductionPortrait({input,fields:{...base,hairId:hair,neckOutfitReferencePath:'/assets/'+file},root,key:'inert',requestPortrait:audit.requestPortrait,removeBackground:async()=>{matting++;return png}});
  assert.equal(calls,1);assert.equal(matting,1);assert.deepEqual(await sharp(out).ensureAlpha().raw().toBuffer(),await sharp(png).ensureAlpha().raw().toBuffer());
  assert.deepEqual(audit.snapshot(),{providerCalls:1,makeupPolicyVersion:VERSION});
 }
});

test('generation failure never falls through to legacy builders, retries, paired Makeup or another provider call',async()=>{
 let calls=0,matting=0;
 await assert.rejects(processProductionPortrait({input,fields:{...base,hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'},root,key:'inert',requestPortrait:async args=>{calls++;assert.equal(args.prompt,PROMPT);throw Error('INERT_PROVIDER_FAILURE')},removeBackground:async()=>{matting++;return png}}),/INERT_PROVIDER_FAILURE/);
 assert.equal(calls,1);assert.equal(matting,0);
 for(const fields of [{...base,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',thaiWholeHeadGuideVersion:VERSION+'-unknown'},{...base,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',portraitMode:'male'}]){
  await assert.rejects(processProductionPortrait({input,fields,root,key:'inert',requestPortrait:async()=>{calls++;throw Error('MUST_NOT_CALL')},removeBackground:async()=>png}),/คำสั่งผู้หญิงไม่ตรงรุ่น/);
 }
 assert.equal(calls,1);
});

test('custom prompt audit rejects appended or doubled legacy appearance instructions before contacting provider',async()=>{
 let calls=0;const audit=createMakeupRequestAudit(async()=>{calls++;return {png}},{requirePolicy:true});
 for(const prompt of [PROMPT+'\nEXTRA POLICY',PROMPT+PROMPT])await assert.rejects(audit.requestPortrait({prompt,femaleExactPromptVersion:VERSION}),{code:'MAKEUP_POLICY_MISMATCH'});
 assert.equal(calls,0);
});

test('single-attempt provider transport cannot retry an unsuccessful exact female request',async()=>{
 let calls=0;
 await assert.rejects(requestReviewSeedream({key:'inert',prompt:PROMPT,portrait:png,hair:png,outfit:png,singleAttempt:true,femaleExactPromptVersion:VERSION},{fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{message:'inert'}}),{status:503,headers:{'content-type':'application/json'}})}}));
 assert.equal(calls,1);
});


test('original and retained hairstyles still use the same exact prompt and three references without a second generation',async()=>{
 for(const extras of [{hairId:'original'},{hairId:'original',keepCurrentHair:'1'}]){
  let calls=0;
  await processProductionPortrait({input,fields:{...base,...extras,hairReferenceVersion:undefined,neckOutfitReferencePath:'/assets/job-uniforms/female-navy-suit-2.png'},root,key:'inert',requestPortrait:async args=>{calls++;assert.equal(args.prompt,PROMPT);assert.equal(seedreamReviewPayload(args).image.length,3);return {png}},removeBackground:async()=>png});
  assert.equal(calls,1);
 }
});

 test('exact female matting retains native RGB and dimensions even when mask service resizes or recolors',async()=>{const {preserveExactFemalePixels}=await import('../production-portrait-pipeline.js');const mask=await sharp({create:{width:48,height:64,channels:4,background:{r:0,g:0,b:0,alpha:.5}}}).png().toBuffer();const out=await preserveExactFemalePixels(png,mask);const {data,info}=await sharp(out.png).raw().toBuffer({resolveWithObject:true});const original=await sharp(png).raw().toBuffer();assert.equal(info.width,96);assert.equal(info.height,128);for(let i=0;i<data.length;i+=4){assert.deepEqual(data.subarray(i,i+3),original.subarray(i,i+3));assert.equal(data[i+3],128);}});

test('new female requests never retry even when singleAttempt is omitted, and male transport stays Flash',async()=>{
 let calls=0;await assert.rejects(requestReviewSeedream({key:'inert',prompt:PROMPT,portrait:png,hair:png,outfit:png,femaleExactPromptVersion:VERSION},{fetchImpl:async()=>{calls++;return Response.json({error:{message:'inert'}},{status:503})}}));assert.equal(calls,1);
 const male=seedreamReviewPayload({prompt:'UNCHANGED MALE',portrait:png,hair:png,outfit:png,size:'2K'});assert.equal(male.model,'dola-seedream-5-0-flash-260915');assert.equal(male.size,'2K');assert.equal(male.prompt,'UNCHANGED MALE');
});
test('new female render cache changes while owned submission recovery keys and accepted hair history stay unchanged',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8');
 const render=main.slice(main.indexOf(' const key=JSON.stringify([SINGLE_PASS_PORTRAIT_VERSION'),main.indexOf(' if(options.creditKind',main.indexOf(' const key=JSON.stringify([SINGLE_PASS_PORTRAIT_VERSION')));
 assert(render.includes("thaiWholeOutfit&&gender==='female'?['preplaced-flash-lab-v9-collar']"));
 const submission=main.slice(main.indexOf(' const submissionKey=JSON.stringify'),main.indexOf(' const sourceDigest=',main.indexOf(' const submissionKey=JSON.stringify')));
 assert(!submission.includes('direct-modelark-pro-lab-v8'));assert(submission.includes('direct-modelark-original-refs-v6'));
});
