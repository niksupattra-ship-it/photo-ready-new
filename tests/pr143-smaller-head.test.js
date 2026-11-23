import {sanitizeAiError,sanitizedAiJob} from '../ai-error-sanitizer.js';
import {planThaiBodyFrame} from '../src/thai-body-framing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createThaiAdaptiveComposition} from '../thai-adaptive-composition.js';
import {usesThaiFemaleSmallerHead,THAI_FEMALE_HEAD_SIZE_VERSION,THAI_FEMALE_HEAD_SIZE_INSTRUCTION} from '../thai-female-head-size.js';
import {thaiBodyGeometryInstruction,THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
const root=new URL('..',import.meta.url).pathname;
test('new version only opts Thai females into the smaller head; other locales/genders and stored old jobs stay PR143',()=>{
 const fields={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION};
 assert(usesThaiFemaleSmallerHead(fields,'female'));assert(!usesThaiFemaleSmallerHead(fields,'male'));assert(!usesThaiFemaleSmallerHead({...fields,thaiOutfitAiVersion:undefined,interfaceLanguage:'en'},'female'));assert(usesThaiFemaleSmallerHead({...fields,interfaceLanguage:'en'},'female'),'Internal English renderer keeps Thai marker');assert(!usesThaiFemaleSmallerHead({},'female'));
 const text=thaiBodyGeometryInstruction(fields,'female');assert(text.includes('90%'));assert(!text.includes('around 0.30'));assert(!text.includes('0.40–0.45'));
 assert(thaiBodyGeometryInstruction({...fields,thaiFemaleHeadSizeVersion:''},'female').includes('around 0.30'));
});
test('actual guide shrinks only head width and height about 10%, retaining chin anchor and exact lower garment pixels',async()=>{
 const outfit=await readFile(root+'public/assets/government-uniforms/female-operational.png');
 for(const aspect of [1.15,1.5,2.1]){
  const identity=await sharp({create:{width:120,height:Math.round(120*aspect),channels:3,background:{r:201,g:96,b:74}}}).png().toBuffer();
  const args={outfit,identity,evidence:{version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53},gender:'female'};
  const old=await createThaiAdaptiveComposition(args),newGuide=await createThaiAdaptiveComposition({...args,smallerFemaleHead:true});
  const dec=b=>sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true}),[a,b]=await Promise.all([dec(old),dec(newGuide)]);assert.deepEqual(a.info,b.info);
  const W=a.info.width,H=a.info.height,row=W*4;assert(a.data.subarray(Math.floor(H*.55)*row).equals(b.data.subarray(Math.floor(H*.55)*row)),'Keep native suit placement and pixels exact');
  const box=d=>{let l=W,r=-1,t=H,z=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(Math.abs(d[i]-201)<2&&Math.abs(d[i+1]-96)<2&&Math.abs(d[i+2]-74)<2){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);z=Math.max(z,y)}}return {w:r-l+1,h:z-t+1,bottom:z,cx:(l+r)/2}};
  const x=box(a.data),y=box(b.data);assert(x.w>0&&y.w>0);assert(Math.abs(y.w/x.w-.9)<.015);assert(Math.abs(y.h/x.h-.9)<.015);assert(Math.abs(y.bottom-x.bottom)<=2);assert(Math.abs(y.cx-x.cx)<=2);
 }
});
test('Natural and Makeup use one generation with the smaller-head guide and final fixed-body instruction',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9887'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 for(const finish of ['natural','makeup']){
  let calls=0;const fields={portraitMode:'female',femaleEyeStyle:finish,thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION};
  const result=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>png,requestPortrait:async options=>{calls++;assert(options.adaptiveComposition?.length);const expectedGuide=await createThaiAdaptiveComposition({outfit:options.outfit,identity:options.identity,evidence:fields.thaiAdaptiveFaceGeometry,gender:'female',smallerFemaleHead:true});assert(options.adaptiveComposition.equals(expectedGuide),'Actual provider receives the reduced-head guide despite internal locale normalization');assert(options.prompt.endsWith(THAI_FEMALE_HEAD_SIZE_INSTRUCTION));assert(!options.prompt.includes('cheek-to-cheek width around 0.30'));assert(!options.prompt.includes('27–31%'));assert.equal(options.prompt.split(THAI_FEMALE_HEAD_SIZE_INSTRUCTION).length-1,1);return {png}}});assert(result.length);assert.equal(calls,1);
 }
});

test('PR143 placement does not enlarge or move the body when the head alone is reduced',()=>{
 const W=300,H=400,p=new Uint8ClampedArray(W*H*4);for(let y=10;y<H;y++)for(let x=20;x<280;x++)p[(y*W+x)*4+3]=255;
 const head={top:20,width:120,height:180,centerX:150},smaller={...head,top:38,width:108,height:162};
 const original=planThaiBodyFrame(p,W,H,{head}),reduced=planThaiBodyFrame(p,W,H,{head:smaller,headScale:.9});
 for(const k of ['scale','x','y'])assert(Math.abs(original[k]-reduced[k])<1e-8,k);
});

test('rollback keeps credential redaction while result bytes and ownership remain unchanged',()=>{
 const result=Buffer.from('same accepted image'),job={wallet_id:'same-owner',status:'completed',result,error:'Bearer sk-proj-fake_test_value_123456789'};
 assert(!sanitizeAiError(job.error).includes('sk-proj-fake_test_value_123456789'));
 const clean=sanitizedAiJob(job);assert.equal(clean.result,result);assert.equal(clean.wallet_id,job.wallet_id);assert.equal(clean.status,job.status);
});

test('generated-head size metadata survives server recovery, alternate finish and Studio reopening',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8'),store=await readFile(root+'job-store.js','utf8'),editor=await readFile(root+'src/studio-editor.jsx','utf8');
 assert(store.includes('AS "thaiFemaleHeadSizeVersion"'));
 assert(main.includes('blob.idpromThaiFemaleHeadSizeVersion=j.thaiFemaleHeadSizeVersion'));assert(main.includes('blob.idpromThaiFemaleHeadSizeVersion=job.thaiFemaleHeadSizeVersion'));
 assert(main.includes('thaiFemaleHeadSizeVersion:headMasterBlob.idpromThaiFemaleHeadSizeVersion'));
 assert(editor.includes('headScale:head.thaiFemaleHeadSizeVersion===THAI_FEMALE_HEAD_SIZE_VERSION?THAI_FEMALE_HEAD_SCALE:1'));
});
