import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {applyThaiProportionAuthority} from '../thai-proportion-authority.js';
import {THAI_PROPORTION_AUTHORITY_VERSION} from '../thai-proportion-authority-version.js';
import {THAI_BODY_GEOMETRY_VERSION,thaiBodyGeometryInstruction} from '../thai-body-geometry-policy.js';
import {THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_REAL_FACE_VERSION,thaiFinalOriginalIdentity} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
const root=new URL('..',import.meta.url).pathname;
const fields={thaiOutfitAiVersion:'th-full-outfit-ai-v1',thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiProportionAuthorityVersion:THAI_PROPORTION_AUTHORITY_VERSION};
test('English and archived Thai prompts retain exact bytes without opt-in',()=>{const text='Scale and move the whole portrait uniformly only; never squeeze a face to fit the garment or an ideal head/body ratio.';for(const f of [{},{...fields,thaiProportionAuthorityVersion:undefined},{...fields,thaiOutfitAiVersion:undefined},{...fields,thaiBodyGeometryVersion:undefined}])assert.equal(applyThaiProportionAuthority(text,f,{boardIndex:5}),text)});
test('one fallback target remains if visual evidence is unavailable; identity and hair policies survive',()=>{
 const initial=thaiBodyGeometryInstruction(fields)+thaiFinalOriginalIdentity(fields),p=applyThaiProportionAuthority(initial,fields);
 assert.equal((p.match(/SINGLE FINAL PROPORTION AUTHORITY/g)||[]).length,1);assert.match(p,/width around 0.30/);assert.doesNotMatch(p,/0.40–0.45|0.50–0.58|Scale and move the whole portrait uniformly only|ONE AUTHORITATIVE HEAD/);assert.match(p,/existing catchlight pattern/);assert.match(p,/NO VISIBLE BUN ANYWHERE/);assert.match(p,/SAME single AI request/);
});
test('actual assembled one-call payload has one measured composition authority for different face shapes, genders and finishes',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9887'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 for(const [gender,finish,aspect] of [['female','natural',1.15],['female','makeup',1.85],['male','natural',1.48]]){
  let calls=0,payload;
  const f={...fields,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',portraitMode:gender,femaleEyeStyle:finish,hairReferenceVersion:'picker-hair-v1',hairId:gender==='male'?'thai-male-auto':'seedream-14',neckOutfitReferencePath:gender==='male'?'/assets/government-uniforms/male-government-employee.png':'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:aspect,jawRatio:.75,eyeRatio:.53}),...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})};
  await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:f,root,key:'inert',removeBackground:async()=>png,requestPortrait:async p=>{calls++;payload=p;return {png}}});
  assert.equal(calls,1);assert(payload.adaptiveComposition?.length);assert(payload.portrait.equals(png));
  const p=payload.prompt;assert.equal((p.match(/SINGLE FINAL PROPORTION AUTHORITY/g)||[]).length,1);assert.match(p,/MEASURED COMPOSITION, is the ONLY authority/);
  assert.doesNotMatch(p,/Preserve head size and position|face dimensions and head scale|Scale and move the whole portrait uniformly only|No mannequin, composited head, scale template|unseen composition guide|ONE AUTHORITATIVE HEAD|width around 0.30|0.40–0.45|0.50–0.58|27–31%|90%|10% smaller|instead of a universal numeric face-width target/);
  assert.match(p,/existing catchlight pattern/);assert.match(p,/selected hairstyle and approved Natural\/Makeup finish/);assert.match(p,/do not narrow the body/);assert.match(p,/Image 1 is the untouched uploaded person/);
 }
});
test('new revision is submitted only inside Thai full-outfit request and appears in both cache identities',async()=>{
 const app=await readFile(root+'src/main.jsx','utf8');const start=app.indexOf(' const hairResultKey=');const end=app.indexOf(' const hairResultScope=',start);assert.match(app.slice(start,end),/!englishPreviewEnabled\(\).*isThaiOutfitPath.*THAI_PROPORTION_AUTHORITY_VERSION/);assert.equal((app.match(/THAI_REAL_FACE_VERSION,THAI_COLLARLESS_VERSION,THAI_PROPORTION_AUTHORITY_VERSION\]/g)||[]).length,2);assert(app.includes("else {fd.append('thaiBodyGeometryVersion',THAI_BODY_GEOMETRY_VERSION);fd.append('thaiProportionAuthorityVersion',THAI_PROPORTION_AUTHORITY_VERSION)"));
});
