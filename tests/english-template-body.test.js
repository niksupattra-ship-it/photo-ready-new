import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {createEnglishBodyLayout,ENGLISH_TEMPLATE_PROPORTION_PROFILE} from '../english-body-layout.js';
import {englishTemplateBodyPrompt} from '../english-template-body-prompt.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION,ENGLISH_TEMPLATE_BODY_SIZE} from '../english-template-body-policy.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
const root=new URL('..',import.meta.url).pathname,template='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:'female',femaleEyeStyle:'natural',femaleFinishPair:AI_MAKEUP_PAIR_VERSION,studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,neckOutfitReferencePath:template};
const cutout=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9788'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
test('template, rather than original body, is the actual AI base; identity and exact selected hair remain separate',async()=>{
 const [nativeWidth,nativeHeight]=ENGLISH_TEMPLATE_BODY_SIZE.split('x').map(Number);assert.equal(nativeWidth/nativeHeight,.75);assert(nativeWidth*nativeHeight<=4624220,'Stay within the verified Flash output limit');assert.equal(nativeWidth%32,0);assert.equal(nativeHeight%32,0);
 const outfit=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer(),layout=await createEnglishBodyLayout(outfit,{profile:ENGLISH_TEMPLATE_PROPORTION_PROFILE});let previousBase;
 for(const [width,height]of [[64,160],[200,80]]){
  const original=await sharp({create:{width,height,channels:3,background:'#ba9788'}}).png().toBuffer(),calls=[];let pair;
  await processProductionPortrait({input:{buffer:original,mimetype:'image/png'},fields:{...fields,hairId:'seedream-41',hairReferenceVersion:'picker-hair-v1'},root,key:'inert',removeBackground:async()=>cutout,onMakeupVariant:async p=>pair=p,requestPortrait:async p=>{calls.push(p);return{png:cutout}}});
  assert.equal(calls.length,2);const natural=calls[0];assert.deepEqual(natural.portrait,layout);assert.deepEqual(natural.outfit,outfit);assert(natural.identity?.length);assert(natural.hair?.length);assert(!natural.compositionReference,'Do not send the base layout twice');assert.equal(natural.size,ENGLISH_TEMPLATE_BODY_SIZE);
  if(previousBase)assert.deepEqual(natural.portrait,previousBase,'Source body aspect cannot change the base garment size');previousBase=natural.portrait;
  assert.match(natural.prompt,/ZERO authority over shoulder width/);assert.match(natural.prompt,/Keep the garment at EXACTLY this template size/);assert.match(natural.prompt,/SELECTED PICKER HAIR seedream-41/);assert.match(natural.prompt,/IDENTITY — IMAGE 3/);assert.match(natural.prompt,/NATIVE GARMENT DETAIL — IMAGE 4/);
  const payload=seedreamReviewPayload(natural);assert.equal(payload.image.length,4);assert.equal(payload.image[0],'data:image/png;base64,'+layout.toString('base64'));
  assert.match(calls[1].prompt,/whole outfit at its identical width, height/);assert.doesNotMatch(calls[1].prompt,/EXPOSURE AND BARE-FACE HANDLING|40% pigment opacity/);
  assert.deepEqual(calls[1].portrait,await sharp(cutout).flatten({background:'#5a86b0'}).png().toBuffer(),'Makeup must edit this completed Natural portrait, not start again from the source face');
  assert.match(natural.prompt,/finish the real person's head, selected hairstyle, neck and selected outfit together/);
  assert.doesNotMatch(natural.prompt,/27–31%|Scale the entire head uniformly/);
  assert.deepEqual(await sharp(cutout).extractChannel(3).raw().toBuffer(),await sharp(pair).extractChannel(3).raw().toBuffer());
 }
});
test('male template generation is one request and the new English policy cannot activate on Thai',async()=>{
 let calls=0;await processProductionPortrait({input:{buffer:cutout,mimetype:'image/png'},fields:{...fields,portraitMode:'male',femaleFinishPair:undefined,studioSkinVersion:undefined,hairId:'seedream-37',hairReferenceVersion:'picker-hair-v1'},root,key:'inert',removeBackground:async()=>cutout,requestPortrait:async p=>{calls++;assert.match(p.prompt,/SELECTED PICKER HAIR seedream-37/);return{png:cutout}}});assert.equal(calls,1);
 assert.throws(()=>validateProductionPortrait({buffer:cutout,mimetype:'image/png'},{...fields,interfaceLanguage:'th'}),/English studio/);
});

test('English male default and female selected hair do not receive an extra automatic full-photo hair reference',async()=>{
 const base={buffer:cutout,mimetype:'image/png'};
 const rootPath=new URL('..',import.meta.url).pathname;
 const maleCalls=[];
 await processProductionPortrait({input:base,fields:{...fields,portraitMode:'male',hairId:'',femaleFinishPair:undefined},root:rootPath,key:'fixture',removeBackground:async()=>cutout,requestPortrait:async p=>{maleCalls.push(p);return {png:cutout}}});
 assert.equal(maleCalls.length,1);
 assert.equal(maleCalls[0].hair,null);
 assert.match(maleCalls[0].prompt,/CLASSIC SIDE PART TAPER/);
 assert.match(maleCalls[0].prompt,/NATIVE GARMENT DETAIL — IMAGE 3/);
 assert.equal(seedreamReviewPayload(maleCalls[0]).image.length,3,'male route already sends a separate identity reference; do not add a new hair image');
 const chosenCalls=[];
 await processProductionPortrait({input:base,fields:{...fields,hairId:'seedream-41',hairReferenceVersion:'picker-hair-v1',femaleFinishPair:undefined},root:rootPath,key:'fixture',removeBackground:async()=>cutout,requestPortrait:async p=>{chosenCalls.push(p);return {png:cutout}}});
 assert.equal(chosenCalls.length,1);
 assert(chosenCalls[0].hair?.length);
 assert.match(chosenCalls[0].prompt,/SELECTED PICKER HAIR seedream-41/);
 assert.doesNotMatch(chosenCalls[0].prompt,/ORIGINAL HAIR REFERENCE/);
});

test('female AI Picks indexes original hair photo and cropped identity separately when there is no identity layout',async()=>{
 const original=await sharp({create:{width:180,height:240,channels:4,background:'#987467'}}).png().toBuffer();
 const photo={buffer:original,mimetype:'image/png'},calls=[];
 await processProductionPortrait({input:photo,fields:{...fields,hairId:'',femaleFinishPair:undefined,faceIdentityBox:undefined},root:new URL('..',import.meta.url).pathname,key:'fixture',removeBackground:async()=>cutout,requestPortrait:async p=>{calls.push(p);return {png:cutout}}});
 assert.equal(calls.length,1,'extra hair reference must not add an AI generation');
 const natural=calls[0],payload=seedreamReviewPayload(natural);
 assert.equal(payload.image.length,4,'Image 1 composition, Image 2 original hair, Image 3 identity, Image 4 outfit');
 assert(natural.hair?.length);
 assert(natural.identity?.length);
 assert.match(natural.prompt,/ORIGINAL HAIR REFERENCE — IMAGE 2/);
 assert.match(natural.prompt,/IDENTITY — IMAGE 3/);
 assert.match(natural.prompt,/NATIVE GARMENT DETAIL — IMAGE 4/);
 assert.equal(payload.image[1],'data:image/png;base64,'+natural.hair.toString('base64'));
 assert.equal(payload.image[2],'data:image/png;base64,'+natural.identity.toString('base64'));
 assert.equal(payload.image[3],'data:image/png;base64,'+natural.outfit.toString('base64'));
});

test('the new English guide contains the original face at fixed size before generation, with no extra AI pass',async()=>{
 const box=[.25,.125,.75,.625],input={buffer:cutout,mimetype:'image/png'},identity=await portraitIdentityCrop(input,box),outfit=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const expected=await createEnglishBodyLayout(outfit,{headScale:ENGLISH_TEMPLATE_PROPORTION_PROFILE.identityHeadScale,identity,canvasWidth:1824,profile:ENGLISH_TEMPLATE_PROPORTION_PROFILE});
 for(const withHair of [false,true]){
  const calls=[];
  await processProductionPortrait({input,fields:{...fields,faceIdentityBox:JSON.stringify(box),...(withHair?{hairId:'seedream-41',hairReferenceVersion:'picker-hair-v1'}:{})},root,key:'inert',removeBackground:async()=>cutout,onMakeupVariant:async()=>{},requestPortrait:async p=>{calls.push(p);return{png:cutout}}});
  assert.equal(calls.length,2);assert.deepEqual(calls[0].portrait,expected);assert.equal(calls[0].identity,null);
  assert.match(calls[0].prompt,/already contains THIS real person/);assert.match(calls[0].prompt,/no separate close-up/);
  assert.match(calls[0].prompt,/IDENTITY — IMAGE 1/);
  assert(calls[0].prompt.includes('NATIVE GARMENT DETAIL — IMAGE 3'));
  const payload=seedreamReviewPayload(calls[0]);assert.equal(payload.image.length,3);
  assert.equal(payload.image[0],'data:image/png;base64,'+expected.toString('base64'));
  if(withHair){
   assert.match(calls[0].prompt,/SELECTED HAIRSTYLE — IMAGE 2/);
   assert.doesNotMatch(calls[0].prompt,/ENGLISH AI PICKS/);
  }else{
   const originalFullReference=await sharp(input.buffer).rotate().resize({width:1024,height:1536,fit:'inside',withoutEnlargement:true}).png().toBuffer();
   assert.deepEqual(calls[0].hair,originalFullReference,'English female AI Picks supplies the uncropped original hair photo in Image 2');
   assert.equal(payload.image[1],'data:image/png;base64,'+originalFullReference.toString('base64'));
   assert.match(calls[0].prompt,/ORIGINAL HAIR REFERENCE — IMAGE 2/);
   assert.match(calls[0].prompt,/Do not reduce below-shoulder hair to a bob/);
   assert.doesNotMatch(calls[0].prompt,/SELECTED HAIRSTYLE — IMAGE 2/);
  }
 }
});

test('English v8 alone locks head/neck/shoulder proportion and reference hair extent',()=>{
 const base={gender:'male',identityIndex:1,outfitIndex:2,identityLayout:true,proportionLock:true};
 const short=englishTemplateBodyPrompt({...base,selectedHairKind:'short'});
 assert.match(short,/ENGLISH BODY PROPORTION LOCK/);
 assert.match(short,/head-to-shoulder scale/);
 assert.match(short,/ENGLISH CLEAN SHORT\/UPDO EDGE CHECK/);
 assert.match(short,/neck or shoulders/);
 const bob=englishTemplateBodyPrompt({...base,selectedHairKind:'bob'});
 assert.match(bob,/ENGLISH BOB EDGE CHECK/);
 assert.match(bob,/Never shorten a legitimate bob edge/);
 const gathered=englishTemplateBodyPrompt({...base,selectedHairKind:'gathered'});
 assert.match(gathered,/ENGLISH CLEAN SHORT\/UPDO EDGE CHECK/);
 const retained=englishTemplateBodyPrompt({...base,keepCurrentHair:true,selectedHairKind:'short'});
 assert.doesNotMatch(retained,/ENGLISH CLEAN SHORT\/UPDO EDGE CHECK/);
 const previous=englishTemplateBodyPrompt({...base,proportionLock:false,selectedHairKind:'short'});
 assert.doesNotMatch(previous,/ENGLISH BODY PROPORTION LOCK|ENGLISH CLEAN SHORT\/UPDO EDGE CHECK/);
});

test('v9 visibly expands the approved head and treats the lower blouse opening as upper chest, not neck',()=>{
 const profile=ENGLISH_TEMPLATE_PROPORTION_PROFILE;
 assert(profile.headWidthToShoulder*profile.identityHeadScale>.40);
 assert(profile.chinToCollar<.02);
 const base={gender:'female',identityIndex:1,outfitIndex:2,identityLayout:true,selectedHairKind:'gathered',proportionLock:true};
 const v9=englishTemplateBodyPrompt({...base,naturalHeadNeck:true});
 assert.match(v9,/40–42%/);
 assert.match(v9,/ENGLISH V9 — VISIBLE NECK IS SHORT/);
 assert.match(v9,/inner shirt's much LOWER neckline/);
 assert.match(v9,/NEVER raise the chin or reduce the face size/);
 const v8=englishTemplateBodyPrompt({...base,naturalHeadNeck:false});
 assert.doesNotMatch(v8,/ENGLISH V9 — VISIBLE NECK IS SHORT|40–42%/);
});
