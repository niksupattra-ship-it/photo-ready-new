import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {createEnglishBodyLayout} from '../english-body-layout.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION,ENGLISH_TEMPLATE_BODY_SIZE} from '../english-template-body-policy.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
const root=new URL('..',import.meta.url).pathname,template='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:'female',femaleEyeStyle:'natural',femaleFinishPair:AI_MAKEUP_PAIR_VERSION,studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,neckOutfitReferencePath:template};
const cutout=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9788'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
test('template, rather than original body, is the actual AI base; identity and exact selected hair remain separate',async()=>{
 const [nativeWidth,nativeHeight]=ENGLISH_TEMPLATE_BODY_SIZE.split('x').map(Number);assert.equal(nativeWidth/nativeHeight,.75);assert(nativeWidth*nativeHeight<=4624220,'Stay within the verified Flash output limit');assert.equal(nativeWidth%32,0);assert.equal(nativeHeight%32,0);
 const outfit=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer(),layout=await createEnglishBodyLayout(outfit);let previousBase;
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

test('the new English guide contains the original face at fixed size before generation, with no extra AI pass',async()=>{
 const box=[.25,.125,.75,.625],input={buffer:cutout,mimetype:'image/png'},identity=await portraitIdentityCrop(input,box),outfit=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const expected=await createEnglishBodyLayout(outfit,{headScale:.70,identity,canvasWidth:1824});
 for(const withHair of [false,true]){
  const calls=[];
  await processProductionPortrait({input,fields:{...fields,faceIdentityBox:JSON.stringify(box),...(withHair?{hairId:'seedream-41',hairReferenceVersion:'picker-hair-v1'}:{})},root,key:'inert',removeBackground:async()=>cutout,onMakeupVariant:async()=>{},requestPortrait:async p=>{calls.push(p);return{png:cutout}}});
  assert.equal(calls.length,2);assert.deepEqual(calls[0].portrait,expected);assert.equal(calls[0].identity,null);
  assert.match(calls[0].prompt,/already contains THIS real person/);assert.match(calls[0].prompt,/no separate close-up/);
  assert.match(calls[0].prompt,/IDENTITY — IMAGE 1/);
  assert(calls[0].prompt.includes('NATIVE GARMENT DETAIL — IMAGE '+(withHair?3:2)));
  const payload=seedreamReviewPayload(calls[0]);assert.equal(payload.image.length,withHair?3:2);
  assert.equal(payload.image[0],'data:image/png;base64,'+expected.toString('base64'));
  if(withHair)assert.match(calls[0].prompt,/SELECTED HAIRSTYLE — IMAGE 2/);
 }
});
