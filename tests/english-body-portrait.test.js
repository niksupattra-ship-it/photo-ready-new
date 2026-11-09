import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_BODY_PORTRAIT_VERSION,isEnglishBodyPortrait} from '../english-body-portrait.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
const root=new URL('..',import.meta.url).pathname;
const template='/assets/job-uniforms/female-formal-suit.png';
const fields={interfaceLanguage:'en',portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,neckOutfitReferencePath:template,femaleEyeStyle:'natural'};
test('English opt-in requires language, mode and a selected job outfit; Thai remains opt-out',()=>{
 assert(isEnglishBodyPortrait(fields));assert(!isEnglishBodyPortrait({}));assert(!isEnglishBodyPortrait({...fields,interfaceLanguage:'th'}));
 const input={buffer:Buffer.from('fixture'),mimetype:'image/png'};
 for(const overrides of [{interfaceLanguage:'th'},{neckOutfitReferencePath:''},{neckOutfitReferencePath:'/assets/gown-uniforms/kmitl-female.png'}])assert.throws(()=>validateProductionPortrait(input,{...fields,portraitMode:'female',...overrides}),/English outfit/);
});
test('English male and female generations use the selected outfit to generate a complete clothed portrait and retain torso alpha',async()=>{
 const input=await sharp({create:{width:64,height:96,channels:3,background:'tan'}}).png().toBuffer();
 const matte=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:52,height:85,channels:4,background:'#3c8cff'}}).png().toBuffer(),left:6,top:11}]).png().toBuffer();
 const outfit=await sharp(await readFile(root+'public'+template)).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 for(const portraitMode of ['female','male']){
  const calls=[];let matted=0;
  const result=await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:{...fields,portraitMode,...(portraitMode==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION}:{})},root,key:'fixture-not-sent',requestPortrait:async p=>{calls.push(p);return {png:input}},removeBackground:async png=>{assert.deepEqual(png,input);matted++;return matte}});
  const generated=calls.at(-1);assert.equal(calls.length,portraitMode==='female'?2:1);assert.equal(matted,1);
  assert.deepEqual(generated.outfit,outfit);assert(!generated.neckReference);assert(!generated.neckShapeReference);
  assert.match(generated.prompt,/head, new upright neck, level shoulders and clothed upper torso together/);
  assert.match(generated.prompt,/Generate this garment ON the person/);
  assert.doesNotMatch(generated.prompt,/Do not generate this garment|NECKLINE-CONTOUR CUTOUT|REBUILD THE VISIBLE NECK NOW/);
  const {data,info}=await sharp(result).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(data[((info.height-2)*info.width+32)*4+3],255,'clothed lower torso survives');assert.equal(data[3],0,'background remains transparent');
 }
});
test('English makeup keeps the complete outfit and natural alpha in the paired result',async()=>{
 const {AI_MAKEUP_PAIR_VERSION}=await import('../ai-makeup-pair-policy.js');
 const natural=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:52,height:85,channels:4,background:'#3c8cff'}}).png().toBuffer(),left:6,top:11}]).png().toBuffer();
 const calls=[];let makeup;
 await processProductionPortrait({input:{buffer:natural,mimetype:'image/png'},fields:{...fields,portraitMode:'female',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishPair:AI_MAKEUP_PAIR_VERSION},root,key:'fixture-not-sent',requestPortrait:async p=>{calls.push(p);return {png:natural}},removeBackground:async()=>natural,onMakeupVariant:async png=>{makeup=png}});
 assert.equal(calls.length,3);assert.match(calls.at(-1).prompt,/Preserve the existing selected outfit, complete clothed torso/);
 const a=await sharp(natural).extractChannel(3).raw().toBuffer(),b=await sharp(makeup).extractChannel(3).raw().toBuffer();assert.deepEqual(a,b);
});
