import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ORIGINAL_PORTRAIT_AI_VERSION as V,originalAiSkinFinish,hasOriginalPortraitAiFinish,markOriginalPortraitAiFinish,originalPortraitAiMetadata} from '../original-portrait-ai.js';
import {prepareStudioSkinInput,parseStudioSkinRequest} from '../studio-skin-input.js';
import {processProductionPortrait,productionPortraitPrompt,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {studioSkinWorkflowMetadata} from '../studio-skin-metadata.js';
import {preserveLocalSkinLook} from '../src/preserve-local-skin-look.js';
const root=new URL('..',import.meta.url).pathname,styles=['natural','makeup','korean-rosy-v1','soft-rosy-v1'];
let passed=0;const reports=[];
async function check(name,run){await run();passed++;reports.push(name);console.log('PASS '+name)}
const raw=await sharp({create:{width:160,height:200,channels:3,background:'#b69583'}}).jpeg({quality:92}).withMetadata({orientation:6}).toBuffer();
const input={buffer:raw,mimetype:'image/jpeg',originalname:'unmodified-camera.jpg'},fields=style=>({portraitMode:'female',hairId:'original',femaleEyeStyle:style,studioSkinVersion:V});
await check('original JPEG including EXIF remains byte-exact through the production preparation boundary',async()=>{
 for(const style of styles){const f=fields(style);assert.equal(parseStudioSkinRequest(f,'female'),null);const prepared=await prepareStudioSkinInput(input,f,'female');assert.equal(prepared.input,input);assert.equal(prepared.input.buffer,raw);assert.equal(prepared.staged,false);assert.equal((await sharp(raw).metadata()).orientation,6)}
 for(const patch of [{portraitMode:'male'},{femaleEyeStyle:'unknown'},{studioSkinEvidence:'{}'}])assert.throws(()=>validateProductionPortrait(input,{...fields('natural'),...patch}));
});
await check('one production AI call receives the original, its selected makeup instruction and optional hair only',async()=>{
 const native=new Uint8Array(32*40*4);for(let y=4;y<36;y++)for(let x=4;x<28;x++)native.set([189,154,134,255],(y*32+x)*4);
 const cutout=await sharp(native,{raw:{width:32,height:40,channels:4}}).png().toBuffer();
 for(const style of styles)for(const hair of ['original','seedream-19']){
  let calls=0,actual,matting=0;const stages=[];
  await processProductionPortrait({input,fields:{...fields(style),hairId:hair},root,onStage:async s=>stages.push(s),requestPortrait:async options=>{calls++;actual=options;return {png:cutout}},removeBackground:async image=>{matting++;assert.deepEqual(image,cutout);return image}});
  assert.equal(calls,1);assert.equal(matting,1);assert.equal(actual.portrait,raw);assert.equal(actual.portraitMime,'image/jpeg');assert.equal(actual.identity,null);assert.equal(actual.skinReference,undefined);assert.equal(actual.outfit,undefined);assert.equal(Boolean(actual.hair),hair!=='original');assert(!stages.includes('skin-base'));assert.match(actual.prompt,/Image 1 is the untouched original photograph/);assert.doesNotMatch(actual.prompt,/PREPARED PHOTO-STUDIO SKIN BASE|Selected cosmetics are separate local|local cosmetics happen only after/);
  if(style==='natural')assert.match(actual.prompt,/NATURAL OPTION/);else assert.match(actual.prompt,/MAKEUP OPTION — COMPLETE HERE/);
 }
});
await check('Natural and Makeup have explicit different AI cosmetic instructions without a shared local bare-base marker',async()=>{
 assert.notEqual(productionPortraitPrompt({gender:'female'},'natural',fields('natural')),productionPortraitPrompt({gender:'female'},'makeup',fields('makeup')));
 for(const style of styles){const original=new Blob(['upload']),blob=markOriginalPortraitAiFinish(new Blob(['AI output']),style);assert(hasOriginalPortraitAiFinish(blob,style));assert.deepEqual(studioSkinWorkflowMetadata(blob),originalPortraitAiMetadata(blob));assert.equal(blob.idpromStudioSkinBaseSource,undefined);assert.deepEqual(studioSkinWorkflowMetadata(original),{});if(style!=='natural')assert(!hasOriginalPortraitAiFinish(blob,'natural'))}
 assert(!hasOriginalPortraitAiFinish({studioSkinVersion:'studio-skin-stages-v5'},'natural'));
});
await check('new AI results bypass automatic restoration of earlier local skin/makeup recipes',async()=>{
 const replacement={portraitMode:'female',femaleEyeStyle:'makeup',studioSkinVersion:V,source:'untouched-new-AI-image'},previous={portraitMode:'female',femaleEyeStyle:'makeup',makeupStyles:{look:'local-korean-pink-eye-v1'},makeupIntensity:100};
 const fail=()=>{throw Error('local cosmetic path must not run')};assert.equal(await preserveLocalSkinLook(previous,replacement,{render:fail,mix:fail,toSource:fail}),replacement);
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');assert(!main.includes('onLocalPortraitFinish={changeStudioPortraitFinish}'));
});
await check('actual App completion wrapper performs no skin filters or cosmetic renderer on original-AI results',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=main.indexOf('async function aiFinishPortrait('),b=main.indexOf('\nasync function aiFinishPortraitUncached(',a);assert(a>=0&&b>a);
 for(const style of ['natural','makeup','korean-rosy-v1']){
  const upload=new Blob(['original']),completed=markOriginalPortraitAiFinish(new Blob(['already finished AI pixels']),style),operation={cancelled:false};let unfiltered=0,cleanup=0;
  const forbidden=()=>{throw Error('No local skin or cosmetics may execute on this route')};
  const env={window:{dispatchEvent(){}},CustomEvent:class{},activeProcessOperation:operation,assertProcessActive:()=>{},cancelledProcessError:()=>Error('cancelled'),PRODUCTION_HAIR_CATALOG:[],portraitFinishChoice:(v,f)=>v||f||'natural',currentResultCacheScope:()=> 'fixture',resultSourceDigest:async()=> 'raw-source-sha',uploadGenerationScope:()=> 'upload',HAIR_DESIGN_VERSION:'hair',NATURAL_STUDIO_SKIN_VERSION:'natural',STUDIO_SKIN_WORKFLOW_VERSION:'studio-skin-stages-v5',ORIGINAL_PORTRAIT_AI_VERSION:V,
   portraitResultCache:{async get(key,create){assert(key.includes(V));return {value:await create(),reused:false}},delete(){}},aiFinishPortraitUncached:async original=>{assert.equal(original,upload);unfiltered++;return completed},cleanPortraitClothing:async blob=>{assert.equal(blob,completed);cleanup++;return blob},finishSharedStudioSkin:forbidden,finishFemaleMakeupSoftFocusBlob:forbidden,prepareStudioMakeup:forbidden,checkPortraitProportions:async()=>{},checkPortraitCompletion:async()=>{}};
  const fn=Function('env','with(env){'+main.slice(a,b)+';return aiFinishPortrait}')(env),result=await fn(upload,'original',{portraitMode:'female',femaleEyeStyle:style});assert.equal(result,completed);assert.equal(unfiltered,1);assert.equal(cleanup,1);assert.equal(await result.text(),'already finished AI pixels');assert.equal(upload.idpromStudioSkinVersion,undefined);
 }
});
console.log(JSON.stringify({passed,reports,scope:'Exact original bytes, actual production request and App completion, one inert provider call, AI makeup distinction, cache metadata and no automatic local skin/cosmetic restoration. No external requests, accounts or payments.'}));
