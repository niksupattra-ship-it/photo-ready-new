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
 const {THAI_COLLARLESS_VERSION}=await import('../thai-collarless-version.js');
 const {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION}=await import('../thai-outfit-ai-policy.js');
 const {MAKEUP_STUDIO_RETOUCH_POLICY}=await import('../makeup-studio-retouch-policy.js');
 const {ENGLISH_OUTFIT_FIDELITY_VERSION}=await import('../english-outfit-fidelity-version.js');
 const {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION}=await import('../english-template-body-policy.js');
 const {SINGLE_PASS_PORTRAIT_VERSION}=await import('../single-pass-portrait-policy.js');
 const {FEMALE_SINGLE_FINISH_VERSION}=await import('../female-single-finish-policy.js');
 const {ORIGINAL_PORTRAIT_AI_VERSION}=await import('../original-portrait-ai.js');
 const sharp=(await import('sharp')).default;
 const fields={interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,portraitMode:'female',hairId:'original',femaleEyeStyle:'makeup',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53})};
 const png=await sharp({create:{width:120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:120,channels:4,background:'#b38a72'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 const calls=[],audit=createMakeupRequestAudit(async request=>{calls.push(request);return {png}},{requirePolicy:true});
 for(const sourceJobId of [undefined,'previous-completed-job']){
  const result=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...fields,...(sourceJobId?{sourceJobId,creditKind:'hairstyle'}:{})},root:new URL('..',import.meta.url).pathname,key:'inert',requestPortrait:audit.requestPortrait,removeBackground:async()=>png});
  assert(result.length);
 }
 assert.equal((await sharp(calls[0].outfitDetailReference).metadata()).width,2304);
 assert(calls.every(r=>r.prompt.includes('REMOVE both pointed shirt-collar flaps')));
 assert.equal(calls.length,2);assert(calls.every(r=>r.thaiRealFaceVersion===THAI_REAL_FACE_VERSION&&r.prompt.includes('original catchlight pattern')));
 const adapted=applyThaiRealFacePolicy(MAKEUP_STUDIO_RETOUCH_POLICY,fields);
 for(const request of [{prompt:adapted},{prompt:adapted,thaiRealFaceVersion:'unknown'},{prompt:adapted+'\n'+adapted,thaiRealFaceVersion:THAI_REAL_FACE_VERSION},{prompt:MAKEUP_STUDIO_RETOUCH_POLICY,thaiRealFaceVersion:THAI_REAL_FACE_VERSION},{prompt:adapted+'\n'+MAKEUP_STUDIO_RETOUCH_POLICY,thaiRealFaceVersion:THAI_REAL_FACE_VERSION}])await assert.rejects(audit.requestPortrait(request),{code:'MAKEUP_POLICY_MISMATCH'});
 assert.equal(calls.length,2,'Invalid policy must still be rejected before provider billing');
 const {seedreamReviewPayload}=await import('../seedream-review-transport.js');
 assert(!('thaiRealFaceVersion' in seedreamReviewPayload(calls[0])),'Internal version is not sent as an unsupported provider field');
});
