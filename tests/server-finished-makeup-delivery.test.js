import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ORIGINAL_PORTRAIT_AI_VERSION,markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish} from '../original-portrait-ai.js';
import {isCompletedServerMakeup,finishSharedStudioSkin,sharedStudioSkinSource} from '../src/shared-studio-skin.js';
import {SHARED_PORTRAIT_BASE_VERSION} from '../shared-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';

const png=(finish='natural')=>{
 const b=new Blob([Buffer.from('exact-server-image-bytes')],{type:'image/png'});
 markOriginalPortraitAiFinish(b,finish,ORIGINAL_PORTRAIT_AI_VERSION);
 b.idpromFemaleFinishSingleVersion=FEMALE_SINGLE_FINISH_VERSION;
 b.idpromJobId='job_1234';
 return b;
};

test('server-selected Makeup has final AI cosmetics and no Natural base: deliver as-is',async()=>{
 const makeup=png('makeup');
 assert.equal(hasOriginalPortraitAiFinish(makeup,'makeup'),true);
 assert.equal(sharedStudioSkinSource(makeup),null);
 assert.equal(isCompletedServerMakeup(makeup,'makeup'),true);
 assert.equal(isCompletedServerMakeup(makeup,'natural'),false);
 assert.equal(isCompletedServerMakeup(makeup,'soft-rosy-v1'),false);
 assert.equal(Buffer.from(await makeup.arrayBuffer()).toString(),'exact-server-image-bytes');
 // Regression: the old unconditional local post-cosmetics would fail here,
 // even though the server had already made a complete Makeup PNG.
 await assert.rejects(finishSharedStudioSkin(makeup,{style:'makeup'}),/ภาพฐานแสงและผิวยังไม่พร้อม/);
});

test('single Natural and legacy paired base still use their normal local pipeline',()=>{
 const natural=png('natural');
 assert.equal(isCompletedServerMakeup(natural,'natural'),false);
 assert.equal(isCompletedServerMakeup(natural,'makeup'),false);
 const legacy=png('makeup');
 legacy.idpromSharedPortraitBaseVersion=SHARED_PORTRAIT_BASE_VERSION;
 legacy.idpromStudioSkinBaseSource='data:image/png;base64,aGVsbG8=';
 assert(sharedStudioSkinSource(legacy),'a legacy independently saved Natural base must remain accessible');
 assert.equal(isCompletedServerMakeup(legacy,'makeup'),false,'only base-less already-finished Makeup can bypass local pipeline');
});

test('new Studio path skips ONLY completed single Makeup and never requests a new paid AI job',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const source=await readFile(new URL('../src/shared-studio-skin.js',import.meta.url),'utf8');
 const start=main.indexOf('const cached=await portraitResultCache.get(key,async()=>{');
 const finish=main.indexOf('const finishRequested=async base=>',start);
 assert(start>=0&&finish>start,'the real result delivery path must be present');
 const pipeline=main.slice(start,finish);
 assert.match(pipeline,/!isCompletedServerMakeup\(finished,options\.femaleEyeStyle\)/,'already-completed Makeup bypasses local post-cosmetics');
 assert.match(pipeline,/finished=await finishSharedStudioSkin\(finished,/,'Natural and older pairs still have their normal local finish');
 assert.match(source,/hasOriginalPortraitAiFinish\(blob,'makeup'\)&&!sharedStudioSkinSource\(blob\)/);
 const receipt=main.slice(main.indexOf('async function waitForAiJob('),main.indexOf('\nlet landmarkerPromise'));
 assert.match(receipt,/if\(j\.femaleFinishSingleVersion\)blob\.idpromFemaleFinishSingleVersion=j\.femaleFinishSingleVersion/,'preserve server finished job protocol');
 assert.match(receipt,/markOriginalPortraitAiFinish\(blob,portraitFinishChoice\(j\.femaleEyeStyle\),j\.studioSkinVersion\)/,'server Makeup metadata is correctly recognized');
 const recovery=main.slice(main.indexOf('const generate=()=>aiFinishPortrait('),main.indexOf('const master=await finishFirstPortraitMaster(aiHead)'));
 assert.match(recovery,/AI output was already generated; automatically recovering the same job/,'recover existing job rather than asking AI to create another');
});


test('explicit Makeup does not fall back to a Natural-only local cache',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 assert.ok(main.includes("requestedFinish==='makeup'&&entry&&sharedStudioSkinSource(entry.master)&&!entry.master.idpromAiMakeupSource&&!entry.master.idpromMakeupPolicyVersion"));
 assert.ok(main.includes("hairResultMode(id,portraitMode)==='female'&&requestedFinish!=='makeup'"));
 assert.ok(editor.includes("appearanceKind==='makeup'&&finish!=='makeup'&&typeof onLocalPortraitFinish"));
});
test('audit records actual successful provider requests and rejects a missing or duplicate required policy before submission',async()=>{
 const {createMakeupRequestAudit}=await import('../makeup-generation-audit.js');
 const {MAKEUP_STUDIO_RETOUCH_POLICY,MAKEUP_STUDIO_RETOUCH_VERSION}=await import('../makeup-studio-retouch-policy.js');
 let calls=0;
 const a=createMakeupRequestAudit(async()=>{calls++;return {png:Buffer.from('fixture')}},{requirePolicy:true});
 for(const prompt of ['legacy prompt',MAKEUP_STUDIO_RETOUCH_POLICY+'\n'+MAKEUP_STUDIO_RETOUCH_POLICY])await assert.rejects(a.requestPortrait({prompt}),{code:'MAKEUP_POLICY_MISMATCH'});
 assert.equal(calls,0);assert.equal(a.snapshot().makeupPolicyVersion,null);
 await a.requestPortrait({prompt:MAKEUP_STUDIO_RETOUCH_POLICY});
 assert.deepEqual(a.snapshot(),{providerCalls:1,makeupPolicyVersion:MAKEUP_STUDIO_RETOUCH_VERSION});
 const legacy=createMakeupRequestAudit(async()=>({png:Buffer.from('fixture')}));
 await legacy.requestPortrait({prompt:'legacy prompt'});
 assert.deepEqual(legacy.snapshot(),{providerCalls:1,makeupPolicyVersion:null});
});

test('real-face Makeup uses the actual required production audit before a single provider call',async()=>{
 const {processProductionPortrait}=await import('../production-portrait-pipeline.js');
 const {createMakeupRequestAudit}=await import('../makeup-generation-audit.js');
 const {THAI_REAL_FACE_VERSION,applyThaiRealFacePolicy}=await import('../thai-real-face-policy.js');
 const {THAI_REAR_HAIR_SHORT_NECK_VERSION}=await import('../thai-rear-hair-short-neck.js');
 const {THAI_COLLARLESS_VERSION}=await import('../thai-collarless-version.js');
 const {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION}=await import('../thai-outfit-ai-policy.js');
 const {MAKEUP_STUDIO_RETOUCH_POLICY}=await import('../makeup-studio-retouch-policy.js');
 const {ENGLISH_OUTFIT_FIDELITY_VERSION}=await import('../english-outfit-fidelity-version.js');
 const {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION}=await import('../english-template-body-policy.js');
 const {SINGLE_PASS_PORTRAIT_VERSION}=await import('../single-pass-portrait-policy.js');
 const {FEMALE_SINGLE_FINISH_VERSION}=await import('../female-single-finish-policy.js');
 const {ORIGINAL_PORTRAIT_AI_VERSION}=await import('../original-portrait-ai.js');
 const sharp=(await import('sharp')).default;
 const fields={thaiRearHairShortNeckVersion:THAI_REAR_HAIR_SHORT_NECK_VERSION,interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,portraitMode:'female',hairId:'original',femaleEyeStyle:'makeup',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53})};
 const png=await sharp({create:{width:120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:120,channels:4,background:'#b38a72'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 const calls=[],audit=createMakeupRequestAudit(async request=>{calls.push(request);return {png}},{requirePolicy:true});
 for(const sourceJobId of [undefined,'previous-completed-job']){
  const result=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...fields,...(sourceJobId?{sourceJobId,creditKind:'hairstyle'}:{})},root:new URL('..',import.meta.url).pathname,key:'inert',requestPortrait:audit.requestPortrait,removeBackground:async()=>png});
  assert(result.length);
 }
 assert.equal((await sharp(calls[0].outfitDetailReference).metadata()).width,1536);
 assert(calls.every(r=>r.prompt.includes('FINAL SINGLE SKIN-TO-COLLAR SEAM V5')&&!r.prompt.includes('including its folded band')&&r.prompt.indexOf('FINAL SINGLE SKIN-TO-COLLAR SEAM V5')>r.prompt.indexOf('ORIGINAL SINGLE SHIRT COLLAR')));
 assert(calls.every(r=>r.prompt.includes('ORIGINAL SINGLE SHIRT COLLAR')&&!r.prompt.includes('REMOVE both pointed shirt-collar flaps')&&r.prompt.includes('FINAL THAI AI GARMENT AND REAR-HAIR PRIORITY V4')));
 const original=await sharp(new URL('../public/assets/government-uniforms/female-operational.png',import.meta.url).pathname).png().toBuffer();
 const {prepareThaiNecklineReference}=await import('../thai-neckline-reference.js');
 const expected=await prepareThaiNecklineReference(original,fields);
 assert.deepEqual(await sharp(calls[0].outfit).raw().toBuffer(),await sharp(expected).raw().toBuffer(),'Actual request uses the cleaned original neck-cutout reference');
 assert(calls.every(r=>r.prompt.includes('REAL GARMENT NECK CUTOUT — CLEAN REFERENCE V6')));
 assert.equal(calls.length,2);assert(calls.every(r=>r.thaiRealFaceVersion===THAI_REAL_FACE_VERSION&&r.prompt.includes('original catchlight pattern')));

 const {HAIR_REFERENCE_VERSION}=await import('../catalogue-hair-policy.js');
 const {productionHair}=await import('../hairstyle-catalog.js');
 const {loadCatalogueHairGuide}=await import('../catalogue-hair-guide.js');
 const {thaiCompactHairReference}=await import('../thai-compact-hair-reference.js');
 const root=new URL('..',import.meta.url).pathname;
 await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...fields,hairId:'seedream-41',hairReferenceVersion:HAIR_REFERENCE_VERSION,creditKind:'hairstyle',sourceJobId:'previous-completed-job'},root,key:'inert',requestPortrait:audit.requestPortrait,removeBackground:async()=>png});
 assert.equal(calls.length,3,'Switching hair uses only one provider request');
 const selected=productionHair('seedream-41');
 const board=await thaiCompactHairReference({selected,hair:await loadCatalogueHairGuide(selected.id,root),root});
 assert.deepEqual(calls[2].hair,board,'Actual full-garment provider receives photographic neck-side negative space');
 assert.match(calls[2].prompt,/FINAL COMPLETE GARMENT \/ SELECTED HAIR CONTRACT/);
 assert.match(calls[2].prompt,/never paint a blue\/background notch inside either shoulder/);
 assert.match(calls[2].prompt,/OUTPUT GATE — CLEAN NECK/);

 const {thaiRearHairReference}=await import('../thai-rear-hair-reference.js');
 for(const hairId of ['seedream-14','seedream-16']){
  await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...fields,hairId,hairReferenceVersion:HAIR_REFERENCE_VERSION,englishHairFit:JSON.stringify({width:120,height:160,points:{leftEye:{x:.35,y:.3},rightEye:{x:.65,y:.3},forehead:{x:.5,y:.2},leftTemple:{x:.2,y:.3},rightTemple:{x:.8,y:.3},leftFace:{x:.2,y:.5},rightFace:{x:.8,y:.5},chin:{x:.5,y:.7}}})},root,key:'inert',requestPortrait:audit.requestPortrait,removeBackground:async()=>png});
  const call=calls.at(-1),selected=productionHair(hairId);
  assert.equal(call.hairPlacementReference,undefined,'No contradictory front-draped placement guide reaches the provider');
  assert.deepEqual(call.hair,await thaiRearHairReference({selected,hair:await loadCatalogueHairGuide(hairId,root),root}));
  assert(call.prompt.lastIndexOf('FINAL THAI GARMENT OCCLUSION AUTHORITY')>call.prompt.lastIndexOf('FINAL SELECTED HAIR BOUNDARY AUTHORITY'),'Rear placement must override conflicting endpoint retention');
 }

 assert(calls.every(call=>call.prompt.includes('FINAL COLLAR MEASUREMENT CHECK V2')));
 const {ENGLISH_TEMPLATE_BODY_FINISH_VERSION}=await import('../english-template-body-policy.js');
 const maleFields={...fields,portraitMode:'male',hairId:'original',femaleEyeStyle:'natural',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,neckOutfitReferencePath:'/assets/job-uniforms/male-job-blue-navy-tie.png'};
 for(const key of ['studioSkinVersion','singlePassPortraitVersion','femaleFinishSingleVersion'])delete maleFields[key];
 const maleCalls=[];
 await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:maleFields,root,key:'inert',requestPortrait:async request=>{maleCalls.push(request);return {png}},removeBackground:async()=>png});
 assert.equal(maleCalls.length,1);
 assert.match(maleCalls[0].prompt,/FINAL COLLAR MEASUREMENT CHECK V2/);
 assert.match(maleCalls[0].prompt,/TOP of the actual collar TOUCHING SKIN/);
 assert.match(maleCalls[0].prompt,/never squeeze the face or shorten its lower half/);
 const adapted=applyThaiRealFacePolicy(MAKEUP_STUDIO_RETOUCH_POLICY,fields);
 for(const request of [{prompt:adapted},{prompt:adapted,thaiRealFaceVersion:'unknown'},{prompt:adapted+'\n'+adapted,thaiRealFaceVersion:THAI_REAL_FACE_VERSION},{prompt:MAKEUP_STUDIO_RETOUCH_POLICY,thaiRealFaceVersion:THAI_REAL_FACE_VERSION},{prompt:adapted+'\n'+MAKEUP_STUDIO_RETOUCH_POLICY,thaiRealFaceVersion:THAI_REAL_FACE_VERSION}])await assert.rejects(audit.requestPortrait(request),{code:'MAKEUP_POLICY_MISMATCH'});
 assert.equal(calls.length,5,'Invalid policy must still be rejected before provider billing');
 const {seedreamReviewPayload}=await import('../seedream-review-transport.js');
 assert(!('thaiRealFaceVersion' in seedreamReviewPayload(calls[0])),'Internal version is not sent as an unsupported provider field');
});
