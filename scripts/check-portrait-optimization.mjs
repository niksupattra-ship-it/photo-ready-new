import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createPortraitFaceCache} from '../src/portrait-analysis-cache.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';

let passed=0;
const test=async(name,run)=>{await run();passed++;console.info('PASS '+name)};
await test('concurrent and later native measurements share one immutable Blob analysis',async()=>{
 let decodes=0,detections=0;const blob=new Blob(['original']),image={},face=[{x:.2,y:.3}];
 const measure=createPortraitFaceCache({decode:async b=>{assert.equal(b,blob);decodes++;return image},landmarker:async()=>({detect:im=>{assert.equal(im,image);detections++;return {faceLandmarks:[face]}}})});
 const results=await Promise.all([measure(blob),measure(blob),measure(blob)]);
 assert(results.every(result=>result===face));assert.equal(await measure(blob),face);
 assert.equal(decodes,1);assert.equal(detections,1);
});
await test('a different Blob or transformed image receives a separate measurement',async()=>{
 let calls=0;const one=new Blob(['original']),two=new Blob(['original']),changed=new Blob(['changed']);
 const measure=createPortraitFaceCache({decode:async b=>b,landmarker:async()=>({detect:()=>({faceLandmarks:[[{x:++calls,y:0}]]})})});
 assert.notDeepEqual(await measure(one),await measure(two));assert.notDeepEqual(await measure(one),await measure(changed));assert.equal(calls,3);
});
await test('failed and missing-face measurements can retry without stale evidence',async()=>{
 for(const failure of ['decode','detect','missing']){
  let calls=0,broken=true;const blob=new Blob(['retry']);
  const measure=createPortraitFaceCache({decode:async()=>{if(broken&&failure==='decode')throw Error('decode failed');return {}},landmarker:async()=>({detect:()=>{calls++;if(broken&&failure==='detect')throw Error('detect failed');return {faceLandmarks:broken?[]:[[{x:.5,y:.4}]]}}})});
  if(failure==='missing')assert.equal(await measure(blob),undefined);else await assert.rejects(measure(blob));
  broken=false;assert.deepEqual(await measure(blob),[{x:.5,y:.4}]);assert.equal(calls,failure==='decode'?1:2);
 }
});

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const a=main.indexOf('async function checkPortraitCompletion('),b=main.indexOf('\nconst femaleMakeupGuideCache',a);assert(a>=0&&b>a);
const completion=env=>Function('env',`with(env){${main.slice(a,b)};return checkPortraitCompletion}`)(env);
function completionFixture({version=ORIGINAL_PORTRAIT_AI_VERSION,replacement=false,retained=false,mismatch=false}={}){
 const source=new Blob(['original']),result=new Blob(['AI output']),events=[];source.idpromStudioSourceReplacement=replacement;result.idpromStudioSkinVersion=version;
 const env={ORIGINAL_PORTRAIT_AI_VERSION,async portraitCompletionEvidence(blob,garments,options){events.push({kind:blob===result?'result':'source',options});return {garments:{measurable:true,retained}}},async selectedHairEvidence(){events.push({kind:'reference'});return {}},inspectSelectedPortraitHair(){return {mismatch}},inspectUnchangedPortraitHair(){events.push({kind:'unchanged'});return {unchanged:true}}};
 return {source,result,events,run:completion(env)};
}
await test('both current finishes skip source hair analysis whose result is unused',async()=>{
 for(const style of ['natural','makeup'])for(const hair of ['original','seedream-41']){
  const f=completionFixture();f.source.idpromFemaleEyeStyle=style;await f.run(f.source,f.result,hair);
  assert.deepEqual(f.events,[{kind:'result',options:{includeHair:false}}]);
 }
});
await test('older portraits still reject unchanged selected hair',async()=>{
 const f=completionFixture({version:'studio-original-ai-v4'});await assert.rejects(f.run(f.source,f.result,'seedream-41'),e=>e.code==='portrait_finish_incomplete');
 assert.deepEqual(f.events.map(e=>e.kind),['result','source','unchanged']);assert.equal(f.events[0].options.includeHair,true);
});
await test('replacement hairstyle matching and garment rejection remain enforced',async()=>{
 const replacement=completionFixture({replacement:true,mismatch:true});await assert.rejects(replacement.run(replacement.source,replacement.result,'seedream-41'),e=>e.code==='selected_hairstyle_mismatch');assert.equal(replacement.events[0].options.includeHair,true);assert(replacement.events.some(e=>e.kind==='reference'));
 const garment=completionFixture({retained:true});await assert.rejects(garment.run(garment.source,garment.result,'seedream-41'),e=>e.code==='portrait_finish_incomplete');
});

// Frozen against 24b9d33 before this optimization. Inert provider responses
// isolate pipeline changes from the image provider's nondeterministic output.
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const summarize=value=>Buffer.isBuffer(value)?{sha256:hash(value),bytes:value.length}:Array.isArray(value)?value.map(summarize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,summarize(value[key])])):value;
const data=Buffer.alloc(64*80*4);
for(let y=0;y<80;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;data[i]=130+x;data[i+1]=90+y;data[i+2]=80;data[i+3]=(x<5||x>58||y<4||y>75)?0:50+(x*3+y)%206;}
const input=await sharp(data,{raw:{width:64,height:80,channels:4}}).jpeg().toBuffer(),png=await sharp(data,{raw:{width:64,height:80,channels:4}}).png().toBuffer();
const expected={
 'natural|original':'561d2d0370d8efef3adb0244c9baa73e0b3d3446678873cdd795d31be1f1d31c',
 'natural|seedream-41':'9ced2e73824d7b7fd6473c256ecbb22ced38d0b5108febb128868a20b0359a4b',
 'makeup|original':'7c814783db4c0741b3a11f73bccadaa68dbf74c288d4edb7976ba784073a0135',
 'makeup|seedream-41':'3343b0819776c5872f0698f7b734406f60e632b0e0d4f21a1a5afe006ca17cd5'
};
for(const style of ['natural','makeup'])for(const hairId of ['original','seedream-41'])await test(`${style}/${hairId}: exact provider payloads, two AI stages and PNG bytes stay unchanged`,async()=>{
 const requests=[],stages=[];
 const result=await processProductionPortrait({input:{buffer:input,mimetype:'image/jpeg'},fields:{portraitMode:'female',femaleEyeStyle:style,hairId,studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,...(style==='natural'?{naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION}:{})},root:new URL('..',import.meta.url).pathname,onStage:async stage=>stages.push(stage),requestPortrait:async request=>{requests.push(summarize(request));return {png}},removeBackground:async image=>image});
 assert.equal(requests.length,2);assert.equal(hash(JSON.stringify(requests)),expected[style+'|'+hairId]);
 assert.deepEqual(stages,['skin-prepare','generation','matting','edges']);
 assert.equal(hash(result),'c8ba4e7507189b04163f7248a31fd58ab06fe88bd30087d19b1508a191b950d1');
});
for(const background of ['#b89988',{r:180,g:150,b:130,alpha:0},'#3299ee'])await test('invalid opaque, empty or blue-only matte still fails delivery',async()=>{
 const invalid=await sharp({create:{width:32,height:40,channels:4,background}}).png().toBuffer();
 await assert.rejects(processProductionPortrait({input:{buffer:input,mimetype:'image/jpeg'},fields:{portraitMode:'female',femaleEyeStyle:'makeup',hairId:'original',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION},root:new URL('..',import.meta.url).pathname,requestPortrait:async()=>({png:invalid}),removeBackground:async image=>image}),/แยกพื้นหลังโปร่งใสไม่สำเร็จ/);
});
console.info(JSON.stringify({passed,scope:'Immutable analysis reuse, unchanged quality guards, exact pre-optimization provider payload/PNG fingerprints and alpha rejection.'}));
