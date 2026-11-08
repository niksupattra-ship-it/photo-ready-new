import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ORIGINAL_PORTRAIT_AI_VERSION as V,hasOriginalPortraitAiFinish,markOriginalPortraitAiFinish} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {inspectGatheredPortraitHair} from '../src/compact-hair-check.js';
import {PRODUCTION_HAIR_CATALOG,selectedHairDesign} from '../hairstyle-catalog.js';
const root=new URL('..',import.meta.url).pathname;let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const raw=await sharp({create:{width:120,height:160,channels:3,background:'#b99b83'}}).jpeg().toBuffer();
const prepared=await sharp(raw).png().toBuffer(),p=new Uint8Array(40*60*4);for(let y=5;y<55;y++)for(let x=6;x<34;x++)p.set([185,160,144,255],(y*40+x)*4);
const final=await sharp(p,{raw:{width:40,height:60,channels:4}}).png().toBuffer();
await check('all finishes keep skin preparation before head/hair, remove all marks and apply compact rules only to gathered hair',async()=>{
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])for(const hairId of ['original','seedream-41','seedream-42','hair-21']){
  const fields={portraitMode:'female',studioSkinVersion:V,femaleEyeStyle:style,hairId,...(style==='natural'?{naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION}:{})},stages=[];let calls=0,matting=0;
  await processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields,root,key:'inert',onStage:async s=>stages.push(s),requestPortrait:async r=>{
   calls++;for(const token of ['moles','black/dark spots','red spots','acne','wrinkle'])assert(r.prompt.toLowerCase().includes(token),token);
   assert.doesNotMatch(r.prompt,/preserve (?:distinctive permanent moles|stable identifying marks|genuine stable moles)/i);
   if(calls===1){assert.equal(r.portrait,raw);assert.equal(r.hair,undefined);assert.equal(r.identity,undefined);assert.match(r.prompt,/Keep all source hair, garments/);return {png:prepared}}
   assert.equal(calls,2);assert.equal(r.portrait,prepared);assert(r.identity?.length);assert(r.neckReference?.length);assert.equal(Boolean(r.hair),hairId!=='original');
   assert.equal(r.prompt.includes('FINAL GATHERED HAIR:'),hairId!=='seedream-42');assert.match(r.prompt,/no stable\/identifying-mark exception/);return {png:final};
  },removeBackground:async r=>{matting++;assert.equal(r,final);assert.equal(calls,2);return r}});
  assert.equal(calls,2);assert.equal(matting,1);assert.deepEqual(stages,['skin-prepare','generation','matting','edges']);
 }
});
function evidence({strand=0,semantic=true,dark=false,noise=false}={}){
 const pixels=new Uint8ClampedArray(256*320*4),hair=new Uint8ClampedArray(pixels.length),skin=dark?[35,27,25]:[180,140,120],black=[12,14,20];
 const paint=(x0,x1,y0,y1,colour,isHair=false)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*256+x)*4;pixels.set([...colour,255],i);if(isHair)hair[i+3]=255}};
 paint(70,186,40,136,black,true);paint(80,176,224,285,skin);
 if(strand)paint(170,171,238,238+strand,black,semantic);
 if(noise)for(let k=0;k<12;k++)paint(180+k*2,181+k*2,240+(k%3)*3,241+(k%3)*3,black,semantic);
 return {pixels,hair,chinY:224,garments:{measurable:true,retained:false}};
}
await check('a narrow connected neck strand is rejected while isolated noise and clear necks pass',()=>{
 for(const semantic of [true,false]){const e=evidence({strand:16,semantic});assert(!inspectGatheredPortraitHair(e).retained);assert(inspectGatheredPortraitHair(e,{strict:true}).retained)}
 for(const dark of [true,false])assert(!inspectGatheredPortraitHair(evidence({dark}),{strict:true}).retained);
 assert(!inspectGatheredPortraitHair(evidence({strand:4}),{strict:true}).retained);assert(!inspectGatheredPortraitHair(evidence({noise:true}),{strict:true}).retained);
});
await check('the actual completion handler blocks a narrow gathered tail without applying that rule to a long style',async()=>{
 const source=await readFile(root+'src/main.jsx','utf8'),a=source.indexOf('async function checkPortraitCompletion('),b=source.indexOf('\nconst femaleMakeupGuideCache',a);assert(a>=0&&b>a);
 const env={ORIGINAL_PORTRAIT_AI_VERSION:V,PRODUCTION_HAIR_CATALOG,selectedHairDesign,inspectGatheredPortraitHair,portraitCompletionEvidence:async()=>evidence({strand:16})};
 const run=Function('env','with(env){'+source.slice(a,b)+';return checkPortraitCompletion}')(env),result={idpromStudioSkinVersion:V};
 await assert.rejects(run({},result,'seedream-41'),e=>e.code==='selected_hairstyle_mismatch');await run({},result,'seedream-42');
});
await check('old V5 result remains historical and cannot satisfy the refined finish cache',()=>{
 assert(!hasOriginalPortraitAiFinish({studioSkinVersion:'studio-original-ai-v5'},'natural'));
 assert(hasOriginalPortraitAiFinish(markOriginalPortraitAiFinish(new Blob(['new'])),'natural'));
});
console.log(JSON.stringify({passed,scope:'Actual unchanged skin-before-head/hair order across 16 fixture requests, all-mark removal prompts, strict connected-neck-strand validation and actual App completion, long-style exemption and cache revision. Inert provider only; no paid image calls.'}));
