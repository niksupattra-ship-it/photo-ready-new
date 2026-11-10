import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {THAI_NECK_BACKING_VERSION,usesCompleteThaiNeckBacking,planThaiNeckCanvas} from '../thai-neck-backing-policy.js';
import {prepareThaiNeckCanvas} from '../thai-neck-canvas.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';
const root=new URL('..',import.meta.url).pathname;
const base={portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,thaiNeckBackingVersion:THAI_NECK_BACKING_VERSION};
const box=[.12,.08,.88,.90];
const input=await sharp(Buffer.from('<svg width="240" height="280"><rect width="240" height="280" fill="#ba947d"/><path fill="#5c3b36" d="M75 40h25v20H75zM140 40h25v20h-25z"/><path fill="#8e5058" d="M90 160h60v9H90z"/></svg>')).png().toBuffer();
const cutout=await sharp({create:{width:240,height:380,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:180,height:330,channels:4,background:'#ba947d'}}).png().toBuffer(),left:30,top:20}]).png().toBuffer();

test('only current Thai female head/neck requests opt in; English, old clients and male requests retain their policy',()=>{
 assert(usesCompleteThaiNeckBacking(base));
 for(const patch of [{interfaceLanguage:'en'},{portraitMode:'male'},{thaiNeckBackingVersion:undefined},{studioSkinVersion:'studio-original-ai-v4'}])assert(!usesCompleteThaiNeckBacking({...base,...patch}));
});
test('close-cropped and off-centre faces get room for the full U, while complete inputs keep their original frame',()=>{
 for(const faceBox of [box,[0,.1,.8,.98],[.3,.05,1,.88]]){
  const plan=planThaiNeckCanvas(240,280,faceBox),fw=(faceBox[2]-faceBox[0])*240,d=fw*.68,cx=(faceBox[0]+faceBox[2])*120,chin=faceBox[3]*280;
  assert(plan.bottom>0);assert(plan.left+cx>d*1.44);assert(240+plan.right-cx>d*1.44);assert(280+plan.bottom>chin+d*1.62);assert.equal(plan.top,0);
 }
 assert.deepEqual(planThaiNeckCanvas(900,1600,[.3,.1,.7,.45]),{left:0,right:0,top:0,bottom:0});
 for(const invalid of [null,[0,0,NaN,1],[0,0,2,1],[]]){const p=planThaiNeckCanvas(240,280,invalid);assert(p.bottom>0&&p.left>0&&p.right>0)}
 assert.equal(planThaiNeckCanvas(0,280,box),null);
});
test('working-space extension retains all photographed pixels without stretching or painting skin, and has a non-blocking fallback',async()=>{
 const original={buffer:input,mimetype:'image/png'},result=await prepareThaiNeckCanvas(original,box),p=planThaiNeckCanvas(240,280,box),meta=await sharp(result.buffer).metadata();
 assert(meta.height>280&&meta.width>=240);assert.equal(meta.height,280+p.bottom);
 const [outW,outH]=result.neckCanvasSize.split('x').map(Number);assert(outW*outH>=3686400&&outW<=4096&&outH<=4096);assert(Math.abs(outW/outH-meta.width/meta.height)<.015);
 const restored=await sharp(result.buffer).extract({left:p.left,top:0,width:240,height:280}).removeAlpha().raw().toBuffer();
 assert.deepEqual(restored,await sharp(input).removeAlpha().raw().toBuffer());
 const corner=await sharp(result.buffer).extract({left:0,top:meta.height-1,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...corner],[53,107,216]);
 assert.equal(await prepareThaiNeckCanvas(original,[.42,.10,.58,.25]),original);
 const unreadable={buffer:Buffer.from('invalid fixture'),mimetype:'image/png'};assert.equal(await prepareThaiNeckCanvas(unreadable,box),unreadable);
});
test('Thai paired processing completes with one complete guide and the existing three provider calls; both final assets retain their backing',async()=>{
 for(const hairId of ['original','seedream-41']){
  const calls=[],stages=[];let makeup;
  const result=await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:{...base,hairId,faceIdentityBox:JSON.stringify(box),...(hairId==='original'?{}:{hairReferenceVersion:HAIR_REFERENCE_VERSION}),femaleFinishPair:AI_MAKEUP_PAIR_VERSION,neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'},root,key:'fixture-not-sent',onStage:async s=>stages.push(s),onMakeupVariant:async p=>{makeup=p},removeBackground:async()=>cutout,requestPortrait:async p=>{calls.push(p);return {png:calls.length===1?input:cutout}}});
  assert.equal(calls.length,3);assert(result.length&&makeup.length);assert.deepEqual(stages,['skin-prepare','generation','matting','edges','makeup']);
  assert.deepEqual(calls[0].portrait,input,'skin preparation must still receive the untouched upload');
  const generation=calls[1],meta=await sharp(generation.portrait).metadata();assert(meta.height>280);assert.match(generation.size,/^\d+x\d+$/);const [outW,outH]=generation.size.split('x').map(Number);assert(Math.abs(outW/outH-meta.width/meta.height)<.015);
  assert.match(generation.prompt,/Build continuous opaque matching skin/);assert.match(generation.prompt,/through BOTH complete clavicles/);assert.match(generation.prompt,/Do not stop at the upper neck, neck root, collar edge/);
  assert.match(generation.prompt,/full-frame 50 mm/);assert.match(generation.prompt,/10–15% fuller/);assert.match(generation.prompt,/not a longer visible neck/);
  assert.doesNotMatch(generation.prompt,/VISIBLE NECK SIDE|two separate guides|Follow the separate|separate visible-neck guide/);
  assert.deepEqual(generation.neckReference,await readFile(root+'public/assets/neck-backing-reference/wide-deep-u-v1.png'));assert(!generation.neckShapeReference);
  const images=seedreamReviewPayload(generation).image;assert(Array.isArray(images));assert(generation.prompt.includes(`COMPLETE NECK AND U-BACKING GUIDE — IMAGE ${images.length}`));
  const alpha=await sharp(result).ensureAlpha().extractChannel(3).raw().toBuffer(),pairAlpha=await sharp(makeup).ensureAlpha().extractChannel(3).raw().toBuffer();assert.deepEqual(pairAlpha,alpha);
  assert(alpha[340*240+120]>240,'the lower backing must survive processing');
 }
});
test('the same opt-in flag cannot change English provider input, reference images or request count',async()=>{
 const calls=[];
 await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:{...base,interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'},root,key:'fixture-not-sent',removeBackground:async()=>cutout,requestPortrait:async p=>{calls.push(p);return {png:cutout}}});
 assert.equal(calls.length,1);assert.deepEqual(calls[0].portrait,input);assert(!calls[0].neckReference&&!calls[0].neckShapeReference);assert(calls[0].compositionReference);assert.doesNotMatch(calls[0].prompt,/COMPLETE THAI HEAD|COMPLETE NECK AND U-BACKING/);
});

test('the actual browser submission opts in only Thai, preserves both original uploads and still submits when optional face measurement fails',async()=>{
 const {PRODUCTION_HAIR_CATALOG}=await import('../hairstyle-catalog.js');
 const {NATURAL_STUDIO_SKIN_VERSION}=await import('../natural-studio-skin.js');
 const {markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish}=await import('../original-portrait-ai.js');
 const {portraitFinishChoice}=await import('../src/portrait-finish-choice.js');
 const code=await readFile(root+'src/main.jsx','utf8'),a=code.indexOf('async function aiFinishPortraitUncached('),b=code.indexOf('\n// V206:',a);
 assert(a>=0&&b>a);
 for(const [english,missingFace,cancelled]of [[false,false,false],[false,true,false],[true,false,false],[false,true,true]]){
  const source=new File([input],'original.png',{type:'image/png'}),operation={cancelled:false};let body,scans=0;
  const env={THAI_NECK_BACKING_VERSION,AI_MAKEUP_PAIR_VERSION,ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,PRODUCTION_HAIR_CATALOG,HAIR_REFERENCE_VERSION,FormData,acceptedPaidTrial:false,activeProcessOperation:operation,activeSavedDownloadWork:null,englishPreviewEnabled:()=>english,assertProcessActive(){if(operation.cancelled)throw Error('cancelled')},portraitFinishChoice,hasOriginalPortraitAiFinish,warmPortraitResources:async()=>{},submitPortraitJob:async(_op,run)=>run(),replacementFaceIdentityBox:async()=>{scans++;if(cancelled)operation.cancelled=true;if(missingFace)throw Error('optional measurement unavailable');return box},saveAiJobFile:async file=>assert.equal(file,source),walletHeaders:()=>({}),analyticsTagError:e=>e,portraitJobError:e=>e,writeActiveAiJob(){},portraitFetch:async(_url,options)=>{body=options.body;return {ok:true,json:async()=>({jobId:'same-job',trialPreview:true})}},waitForAiJob:async()=>Object.assign(markOriginalPortraitAiFinish(new Blob([cutout],{type:'image/png'}),'natural'),{idpromNaturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION})};
  const run=Function('env','with(env){'+code.slice(a,b)+';return aiFinishPortraitUncached}')(env);
  if(cancelled){await assert.rejects(run(source,'original',{portraitMode:'female',femaleEyeStyle:'natural'}),/cancelled/);assert.equal(body,undefined);continue}
  const result=await run(source,'original',{portraitMode:'female',femaleEyeStyle:'natural'});assert(result.size);
  assert.deepEqual(new Uint8Array(await body.get('image').arrayBuffer()),new Uint8Array(input));assert.deepEqual(new Uint8Array(await body.get('originalSource').arrayBuffer()),new Uint8Array(input));
  assert.equal(body.get('thaiNeckBackingVersion'),english?null:THAI_NECK_BACKING_VERSION);assert.equal(body.get('faceIdentityBox'),!english&&!missingFace?JSON.stringify(box):null);assert.equal(scans,english?0:1);
 }
});
