import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {THAI_SINGLE_COLLAR_VERSION,usesThaiSingleCollar,thaiSingleCollarInstruction} from '../thai-single-collar-policy.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {withoutObsoleteThaiNeckBridges} from '../src/thai-collar-layers.js';
const root=new URL('..',import.meta.url).pathname;
test('single-collar instruction opts into new Thai submissions only and preserves legitimate inner collar plus jacket lapels',()=>{
 assert(!usesThaiSingleCollar({interfaceLanguage:'en',thaiSingleCollarVersion:THAI_SINGLE_COLLAR_VERSION}));
 assert(!usesThaiSingleCollar({thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION}));
 assert(usesThaiSingleCollar({thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiSingleCollarVersion:THAI_SINGLE_COLLAR_VERSION}));
 assert.match(thaiSingleCollarInstruction(4),/Image 4 alone defines clothing/);
 assert.match(thaiSingleCollarInstruction(4),/discard their original shirt/);
 assert.match(thaiSingleCollarInstruction(4),/legitimate separate parts/);
 assert.throws(()=>thaiSingleCollarInstruction(null));
});
test('full-body restore removes obsolete attached/orphan bridges while retaining other heads, manual suit, insignia and head-only joins',()=>{
 const body={id:'body',kind:'head',visible:true,portraitComposition:'en-outfit-body-v1'},bridge={id:'old-neck',kind:'neck-fit',hairHeadId:'body'},orphan={id:'orphan',kind:'neck-fit'},otherHead={id:'head2',kind:'head'},otherNeck={id:'neck2',kind:'neck-fit',hairHeadId:'head2'},suit={id:'suit',kind:'suit',visible:true},pin={id:'pin',kind:'collar'};
 const source=[body,bridge,orphan,otherHead,otherNeck,suit,pin];
 assert.deepEqual(withoutObsoleteThaiNeckBridges(source),[body,otherHead,otherNeck,suit,pin]);
 assert.equal(source.length,7,'No mutation of purchased project/history');
 const headOnly=[otherHead,otherNeck];assert.equal(withoutObsoleteThaiNeckBridges(headOnly),headOnly);
});
test('new Thai male/female requests get one collar policy in the original single provider call; old jobs retain their prompt and result bytes',async()=>{
 const input={buffer:await sharp({create:{width:120,height:160,channels:4,background:'#bc9786'}}).png().toBuffer(),mimetype:'image/png'};
 const png=await sharp({create:{width:120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:120,channels:4,background:'#bc9786'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 for(const gender of ['female','male']){
  const base={englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:gender==='female'?ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:gender,hairId:'original',femaleEyeStyle:'natural',neckOutfitReferencePath:'/assets/government-uniforms/'+(gender==='female'?'female-operational':'male-government-employee')+'.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53})};
  const outputs=[];
  for(const current of [false,true]){
   const calls=[];const fields={...base,...(current?{thaiSingleCollarVersion:THAI_SINGLE_COLLAR_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION}:{})};
   const output=await processProductionPortrait({input,fields,root,key:'test',removeBackground:async()=>png,requestPortrait:async request=>{calls.push(request);return {png}}});
   outputs.push(output);if(current)assert.deepEqual(output,outputs[0],'Policy changes provider instructions, never locally repaints a completed image');
   assert.equal(calls.length,1);assert(output.length);assert.equal(calls[0].prompt.includes('THAI SINGLE COLLAR'),current);
   if(current){assert.match(calls[0].prompt,/THAI REAL FACE/);assert.match(calls[0].prompt,/original catchlight pattern/);assert.match(calls[0].prompt,/one coherent selected garment/i);assert.match(calls[0].prompt,/THAI FACE SHAPE LOCK V12/)}
   assert.equal(fields.interfaceLanguage,'th');
  }
 }
});
test('Thai browser cache/submission keys and payload opt in while English and pricing stay separate',async()=>{
 const source=await readFile(root+'src/main.jsx','utf8'),editor=await readFile(root+'src/studio-editor.jsx','utf8');
 assert(source.includes("fd.append('thaiSingleCollarVersion',THAI_SINGLE_COLLAR_VERSION)"));
 assert.equal((source.match(/thaiWholeOutfit\?\[THAI_OUTFIT_APPEARANCE_VERSION,THAI_SINGLE_COLLAR_VERSION,THAI_REAL_FACE_VERSION\]/g)||[]).length,2);
 assert(editor.includes('if(!englishFlow)next=withoutObsoleteThaiNeckBridges(next)'));
});
