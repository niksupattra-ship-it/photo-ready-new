import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {FEMALE_LAB_PROCESS_VERSION as VERSION} from '../female-portrait-prompt.js';
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
const landmarks=[];
for(const [i,id]of FEMALE_FACE_OUTLINE.entries()){const a=2*Math.PI*i/FEMALE_FACE_OUTLINE.length;landmarks[id]={x:.5+.22*Math.sin(a),y:.475-.275*Math.cos(a)};}
for(const [id,x,y]of [[33,.35,.4],[263,.65,.4],[1,.5,.55],[152,.5,.75],[234,.28,.5],[454,.72,.5]])landmarks[id]={x,y};
const evidence=captureFemaleFaceEvidence(landmarks,480,640);
const png=await sharp({create:{width:480,height:640,channels:4,background:{r:176,g:143,b:127,alpha:.8}}}).png().toBuffer();
const input={buffer:png,mimetype:'image/png'};
const fields={...base,femalePreplacedFace:JSON.stringify(evidence),hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};

test('missing or invalid face evidence fails before provider, never falls back to old prompts',async()=>{
 let calls=0;const requestPortrait=async()=>{calls++;throw Error('UNEXPECTED_CALL');};
 for(const raw of [undefined,'{}',JSON.stringify({...evidence,width:12}),JSON.stringify({...evidence,width:600})]){
  await assert.rejects(processProductionPortrait({input,fields:{...fields,femalePreplacedFace:raw},root,key:'inert',requestPortrait,removeBackground:async()=>png}));
 }
 assert.equal(calls,0);
});

test('current production matches the active Pro lab request exactly across outfit and hair changes',async()=>{
 const {FEMALE_LAB_PROCESS_VERSION}=await import('../female-portrait-prompt.js');
 const {productionLabPayload,productionLabPrompt}=await import('../female-production-lab.js');
 const prompt=productionLabPrompt();
 assert.equal(prompt.split('Combine the four reference images').length,2);
 assert(!prompt.includes('HAIR OCCLUSION'));
 for(const text of ['Image 1: Primary edit canvas','Image 2: Original facial identity only','Image 3: Mandatory hairstyle reference','Image 4: Fixed clothing and body template','Completely replace the original hairstyle with Image 3','Do not retain any hairstyle elements from Image 2'])assert(prompt.includes(text),text);
 for(const [path,id,file]of [['job-uniforms/female-job-navy-notch-white-shirt.png','seedream-80','80.png'],['government-uniforms/female-operational.png','seedream-81','81.png'],['job-uniforms/female-job-navy-notch-white-shirt.png','seedream-05','5.png'],['government-uniforms/female-operational.png','seedream-14','14.png'],['gown-uniforms/kmitl-female.png','seedream-79','79.png'],['student-uniforms/female-01.png','seedream-24','24.png']]){
  const outfit=await readFile(root+'public/assets/'+path),hair=await readFile(root+'public/assets/seedream-hairstyles/references/'+file);
  const expected=await productionLabPayload({prompt,order:'person-outfit-hair',files:{person:[input],outfit:[{buffer:outfit}],hair:[{buffer:hair}]},fields:{femalePreplacedFace:JSON.stringify(evidence)}});
  let calls=0;const audit=createMakeupRequestAudit(async args=>{
   calls++;assert.equal(args.singleAttempt,true);assert.equal(args.prompt,prompt);assert.deepEqual(seedreamReviewPayload(args),expected);
   assert.equal(expected.model,'dola-seedream-5-0-pro-260628');assert.equal(expected.image.length,4);assert.equal(expected.size,'2K');return {png};
  },{requirePolicy:true});
  await processProductionPortrait({input,fields:{...fields,hairId:id,sourceJobId:'previous-completed-job',creditKind:'hairstyle',neckOutfitReferencePath:'/assets/'+path,thaiWholeHeadGuideVersion:FEMALE_LAB_PROCESS_VERSION},root,key:'inert',removeBackground:async()=>png,requestPortrait:audit.requestPortrait});
  assert.equal(calls,1);assert.equal(audit.snapshot().makeupPolicyVersion,FEMALE_LAB_PROCESS_VERSION);
  let attempts=0;
  await assert.rejects(requestReviewSeedream({key:'inert',prompt,preparedFemalePayload:expected,femalePreplacedVersion:FEMALE_LAB_PROCESS_VERSION},{fetchImpl:async()=>{attempts++;return Response.json({error:{message:'inert'}},{status:503});}}));assert.equal(attempts,1);
 }
});

test('new production uses the complete lab foreground process and needs no second framing pass',async()=>{
 const {FEMALE_LAB_PROCESS_VERSION}=await import('../female-portrait-prompt.js');
 const {prepareFemaleLabForeground,compositeFemaleLabBackground}=await import('../female-lab-output.js');
 const {productionLabResult}=await import('../female-production-lab.js');
 const mask=await sharp({create:{width:480,height:640,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:360,height:580,channels:4,background:'#ffffff'}}).png().toBuffer(),left:60,top:60}]).png().toBuffer();
 const remove=async()=>mask;
 let calls=0,mattes=0;
 const main=await processProductionPortrait({input,fields:{...fields,thaiWholeHeadGuideVersion:FEMALE_LAB_PROCESS_VERSION},root,key:'inert',removeBackground:async()=>{mattes++;return mask},requestPortrait:createMakeupRequestAudit(async()=>{calls++;return {png};},{requirePolicy:true}).requestPortrait});
 assert.equal(calls,1);assert.equal(mattes,1);
 const expected=await prepareFemaleLabForeground(png,remove);assert.deepEqual(main,expected);
 const size=await sharp(main).metadata();assert.equal(size.width,900);assert.equal(size.height,1200);
 assert.deepEqual(await compositeFemaleLabBackground(main),await productionLabResult(png,remove),'The same AI result produces identical finished lab pixels');
});

test('valid high-detail source over SVG attribute limit still prepares exact face guide',async()=>{
 const width=1800,height=1800;
 const source=await sharp(randomBytes(width*height*3),{raw:{width,height,channels:3}}).png().toBuffer();
 assert(source.length*4/3>10000000);
 const face=await prepareFemaleFace(source,captureFemaleFaceEvidence(landmarks,width,height));
 const metadata=await sharp(face).metadata();assert.equal(metadata.format,'png');assert(metadata.width>0&&metadata.height>0);
 const {data,info}=await sharp(face).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(data[3],0);assert(data.some((value,index)=>index%info.channels===3&&value>200));
});
