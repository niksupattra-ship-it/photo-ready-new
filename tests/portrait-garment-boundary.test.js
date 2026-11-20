import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {replaceFullBodyPortraitLayers} from '../src/full-body-portrait-layers.js';
import {PORTRAIT_GARMENT_BOUNDARY_VERSION,portraitGarmentBoundaryInstruction} from '../portrait-garment-boundary.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_BODY_PORTRAIT_VERSION} from '../english-body-portrait.js';
import {ENGLISH_TEMPLATE_BODY_FRAMING_VERSION,englishTemplateBodyFinishForGender} from '../english-template-body-policy.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_PARITY_VERSION} from '../thai-outfit-ai-policy.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';

test('successive full portraits replace old heads, hair and collar overlays without changing background or native template settings',()=>{
 const bg={id:'bg',kind:'background',source:'blue'},suit={id:'suit',kind:'suit',source:'native',visible:true,x:12,rotation:7};
 const previous=[bg,{id:'head-a',kind:'head',source:'old-a'},{id:'head-b',kind:'head',source:'old-b'},{id:'upload',kind:'source-photo',source:'upload'},suit,{id:'hair',kind:'hair-preview',source:'old-hair',hairHeadId:'head-b'},{id:'orphan',kind:'hair-preview',source:'orphan'},{id:'rear',kind:'legacy-rear-hair',hairHeadId:'hair'},{id:'orphan-rear',kind:'rear',hairHeadId:'missing'},{id:'collar',kind:'collar'},{id:'chest',kind:'chest'},{id:'ribbon',kind:'ribbon'}];
 const original=structuredClone(previous);
 for(const id of ['head-a','head-c','head-d']){
  const head={id,kind:'head',source:'fresh-'+id},next=replaceFullBodyPortraitLayers(previous,head);
  assert.deepEqual(next,[bg,head,{...suit,visible:false}]);assert.deepEqual(previous,original);
 }
 assert.throws(()=>replaceFullBodyPortraitLayers(previous,{id:'empty'}));
});

test('garment policy preserves real long length behind both shoulders and only the selected outfit collar/underlayers',()=>{
 const prompt=portraitGarmentBoundaryInstruction(3);
 assert.match(prompt,/SELECTED OUTFIT IMAGE 3/);assert.match(prompt,/BEHIND BOTH SHOULDERS/);assert.match(prompt,/do not add a second shirt collar/);assert.match(prompt,/Keep its original legitimate underlayers/);assert.match(prompt,/Do not shorten long hair/);
});

test('actual fresh-upload requests retain the same original identity and Makeup policy, adding one final garment boundary in both locales',async()=>{
 const root=new URL('..',import.meta.url).pathname;
 const upload=await sharp({create:{width:180,height:240,channels:4,background:'#caad99'}}).png().toBuffer();
 const rgba=Buffer.alloc(180*240*4,180);for(let i=3;i<rgba.length;i+=4)rgba[i]=i<1200?0:255;
 const matte=await sharp(rgba,{raw:{width:180,height:240,channels:4}}).png().toBuffer();
 for(const thai of [false,true])for(const finish of ['natural','makeup']){
  const fields={interfaceLanguage:thai?'th':'en',hairId:'seedream-14',hairReferenceVersion:HAIR_REFERENCE_VERSION,portraitMode:'female',femaleEyeStyle:finish,studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,englishStudioFinishVersion:englishTemplateBodyFinishForGender('female'),portraitFramingVersion:ENGLISH_TEMPLATE_BODY_FRAMING_VERSION,faceIdentityBox:JSON.stringify([.2,.1,.8,.6]),neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',...(thai?{thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitParityVersion:THAI_OUTFIT_PARITY_VERSION}:{})};
  const sent=[];
  for(const current of [false,true])await processProductionPortrait({input:{buffer:upload,mimetype:'image/png'},fields:{...fields,...(current?{portraitGarmentBoundaryVersion:PORTRAIT_GARMENT_BOUNDARY_VERSION}:{})},root,key:'inert',requestPortrait:async r=>{sent.push(r);return{png:matte}},removeBackground:async()=>matte});
  assert.equal(sent.length,2);const [old,fresh]=sent;
  for(const field of ['portrait','identity','hair','outfit','makeupStudioReference','size'])assert.deepEqual(fresh[field],old[field],field+' remains sourced from original upload/reference');
  assert.equal(fresh.prompt,old.prompt+portraitGarmentBoundaryInstruction(3));
  assert.equal(fresh.prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1,finish==='makeup'?1:0);
 }
});

test('new requests keep upload-based generation and existing recovery identity, with explicit Thai AI permitting the three free cuts',async()=>{
 const [main,studio]=await Promise.all(['../src/main.jsx','../src/studio-editor.jsx'].map(file=>readFile(new URL(file,import.meta.url),'utf8')));
 assert.match(studio,/onProcessPhoto\(sourcePhoto,/);
 assert.match(studio,/isFreeFemaleHair\(id\)&&!pendingNewPhoto&&!fullOutfitPortrait/,'Free styles on complete AI portraits also restart from the upload rather than stacking PNG hair');
 assert.match(studio,/isFreeFemaleHair\(chosenHair\)&&!firstGeneration&&!options.generationOptions\?\.thaiOutfitAi/);
 assert.match(main,/fd\.append\('portraitGarmentBoundaryVersion',PORTRAIT_GARMENT_BOUNDARY_VERSION\)/);
 assert.doesNotMatch(main,/preservePortraitJobId|portraitHairContinuityVersion/);
 assert.match(studio,/replaceFullBodyPortraitLayers\(previous,head,layerKind\)/);
 assert.match(main,/automatically recovering the same job/);
});
