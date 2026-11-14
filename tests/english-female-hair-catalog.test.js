import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ENGLISH_FEMALE_HAIR_CATALOG} from '../english-female-hair-catalog.js';
import {PRODUCTION_HAIR_CATALOG,productionHair,selectedHairDesign,selectedHairInstruction,downloadHairAllowed} from '../hairstyle-catalog.js';
import {HAIR_REFERENCE_VERSION,catalogueHairInstruction} from '../catalogue-hair-policy.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';

const root=new URL('..',import.meta.url).pathname;
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(root+'public/assets/catalogue-hair-guides/v1/manifest.json','utf8'));
const image=await sharp({create:{width:96,height:128,channels:4,background:'#b99b88'}}).png().toBuffer();
const matte=await sharp(image).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,hairReferenceVersion:HAIR_REFERENCE_VERSION,neckOutfitReferencePath:'/assets/job-uniforms/female-job-ivory-bow-blouse.png'};

test('twenty English styles retain their own IDs, exact source PNGs, picker bindings and hair-only guides',async()=>{
 assert.equal(ENGLISH_FEMALE_HAIR_CATALOG.length,20);
 for(const [i,hair] of ENGLISH_FEMALE_HAIR_CATALOG.entries()){
  assert.equal(hair.id,'seedream-'+(44+i));assert.equal(productionHair(hair.id),hair);assert(downloadHairAllowed(hair.id));
  const entry=manifest.entries[hair.id],source=await readFile(root+'public/assets/seedream-hairstyles/references/'+hair.file),preview=await readFile(root+'public'+hair.src),guide=await loadCatalogueHairGuide(hair.id,root);
  assert.equal(entry.sourceSha256,hash(source));assert.equal(entry.previewSha256,hash(preview));assert.equal(entry.guideSha256,hash(guide));assert.equal(entry.preview,hair.src);
  const {data,info}=await sharp(guide).ensureAlpha().raw().toBuffer({resolveWithObject:true}),original=await sharp(source).ensureAlpha().raw().toBuffer();
  assert.equal(info.width,1086);assert.equal(info.height,1448);let kept=0;
  for(let p=0;p<data.length;p+=4)if(data[p+3]){kept++;assert.deepEqual(data.subarray(p,p+3),original.subarray(p,p+3));assert(data[p+3]<=original[p+3]);}
  assert.equal(kept,entry.hairPixels);assert(kept>100000);
  // A donor's eyes, nose, mouth, chin and central neck never condition identity.
  for(const id of [33,263,1,0,152]){const point=entry.face[id],x=Math.floor(point.x*info.width),y=Math.floor(point.y*info.height);assert.equal(data[(y*info.width+x)*4+3],0,hair.id+' donor feature '+id);}
  assert.equal(data[(Math.floor(info.height*.9)*info.width+Math.floor(info.width*.5))*4+3],0,hair.id+' donor neck');
 }
});

test('Thai still lists the existing catalogue; new IDs require a current English catalogue request',async()=>{
 const raw=await readFile(root+'src/main.jsx','utf8'),declaration=raw.match(/const HAIR_OPTIONS=.*?;/)[0];
 const thai=Function('PRODUCTION_HAIR_CATALOG',declaration+'return HAIR_OPTIONS;')(PRODUCTION_HAIR_CATALOG);
 assert(thai.length>10);assert(thai.some(h=>h.id==='seedream-41'));assert(thai.every(h=>h.interfaceLanguage!=='en'));
 assert(raw.includes('femaleHair={englishPreviewEnabled()?ENGLISH_FEMALE_HAIR_CATALOG:STUDIO_FEMALE_HAIR_OPTIONS}'));
 for(const hair of ENGLISH_FEMALE_HAIR_CATALOG){
  assert.equal(validateProductionPortrait({buffer:image,mimetype:'image/png'},{...fields,hairId:hair.id}).id,hair.id);
  for(const patch of [{interfaceLanguage:'th',portraitComposition:undefined,englishStudioFinishVersion:undefined},{hairReferenceVersion:undefined},{englishStudioFinishVersion:undefined},{portraitComposition:undefined,englishStudioFinishVersion:undefined}])assert.throws(()=>validateProductionPortrait({buffer:image,mimetype:'image/png'},{...fields,hairId:hair.id,...patch}));
 }
});

test('every selected English style reaches the existing AI path with its matching hair pixels',async()=>{
 for(const hair of ENGLISH_FEMALE_HAIR_CATALOG){
  const calls=[];
  await processProductionPortrait({input:{buffer:image,mimetype:'image/png'},fields:{...fields,hairId:hair.id},root,key:'inert-test',requestPortrait:async request=>{calls.push(request);return {png:matte}},removeBackground:async()=>matte});
  assert.equal(calls.length,1);assert.deepEqual(calls[0].hair,await loadCatalogueHairGuide(hair.id,root));
  assert.match(calls[0].prompt,new RegExp('SELECTED ENGLISH HAIRSTYLE '+hair.id));assert(calls[0].outfit);assert.equal(calls[0].size,'1824x2432');
  assert.equal(selectedHairDesign(hair).description,hair.description);assert(catalogueHairInstruction(hair,hair.kind).includes(hair.description));
 }
 assert.match(selectedHairInstruction(ENGLISH_FEMALE_HAIR_CATALOG[5]),/low rear ponytail/);
 assert.match(selectedHairInstruction(ENGLISH_FEMALE_HAIR_CATALOG[9]),/intentional fine curved face-framing wisps/);
});

test('a newly selected hairstyle keeps the same two-call Natural and Makeup pair and silhouette',async()=>{
 const hair=ENGLISH_FEMALE_HAIR_CATALOG[18],calls=[];let makeup;
 const natural=await processProductionPortrait({input:{buffer:image,mimetype:'image/png'},fields:{...fields,hairId:hair.id,femaleFinishPair:AI_MAKEUP_PAIR_VERSION},root,key:'inert-test',requestPortrait:async request=>{calls.push(request);return {png:matte}},removeBackground:async()=>matte,onMakeupVariant:async result=>{makeup=result}});
 assert.equal(calls.length,2);assert.deepEqual(calls[0].hair,await loadCatalogueHairGuide(hair.id,root));assert(!calls[1].hair);
 assert.deepEqual(await sharp(natural).extractChannel(3).raw().toBuffer(),await sharp(makeup).extractChannel(3).raw().toBuffer());
});
