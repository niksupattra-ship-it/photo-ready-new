import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ENGLISH_MALE_HAIR_CATALOG} from '../english-male-hair-catalog.js';
import {PRODUCTION_HAIR_CATALOG,productionHair,selectedHairDesign,selectedHairInstruction,downloadHairAllowed} from '../hairstyle-catalog.js';
import {HAIR_REFERENCE_VERSION,catalogueHairInstruction} from '../catalogue-hair-policy.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';

const root=new URL('..',import.meta.url).pathname,hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(root+'public/assets/catalogue-hair-guides/v1/manifest.json','utf8'));
const image=await sharp({create:{width:96,height:128,channels:4,background:'#b99b88'}}).png().toBuffer();
const matte=await sharp(image).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:'male',femaleEyeStyle:'natural',hairReferenceVersion:HAIR_REFERENCE_VERSION,neckOutfitReferencePath:'/assets/job-uniforms/male-job-navy-three-piece-burgundy-tie.png'};

test('seven English male choices have unique IDs and exact source, preview and hair-only guide bindings',async()=>{
 assert.equal(ENGLISH_MALE_HAIR_CATALOG.length,7);
 for(const [i,hair]of ENGLISH_MALE_HAIR_CATALOG.entries()){
  assert.equal(hair.id,'seedream-'+(64+i));assert.equal(productionHair(hair.id),hair);assert(downloadHairAllowed(hair.id));
  const entry=manifest.entries[hair.id],source=await readFile(root+'public/assets/seedream-hairstyles/references/'+hair.file),preview=await readFile(root+'public'+hair.src),guide=await loadCatalogueHairGuide(hair.id,root);
  assert.equal(entry.sourceSha256,hash(source));assert.equal(entry.previewSha256,hash(preview));assert.equal(entry.guideSha256,hash(guide));assert.equal(entry.preview,hair.src);
  const {data,info}=await sharp(guide).ensureAlpha().raw().toBuffer({resolveWithObject:true}),original=await sharp(source).ensureAlpha().raw().toBuffer();
  assert.equal(info.width,1086);assert.equal(info.height,1448);let kept=0;
  for(let p=0;p<data.length;p+=4)if(data[p+3]){kept++;assert.deepEqual(data.subarray(p,p+3),original.subarray(p,p+3));assert(data[p+3]<=original[p+3]);}
  assert.equal(kept,entry.hairPixels);assert(kept>100000);
  for(const id of entry.face?[33,263,1,0,152]:[]){const point=entry.face[id],x=Math.floor(point.x*info.width),y=Math.floor(point.y*info.height);assert.equal(data[(y*info.width+x)*4+3],0,hair.id+' donor feature '+id);}
  assert.equal(data[(Math.floor(info.height*.9)*info.width+Math.floor(info.width*.5))*4+3],0,hair.id+' donor shirt');
  if(!entry.face)for(const y of [.45,.55,.65])assert.equal(data[(Math.floor(info.height*y)*info.width+Math.floor(info.width*.5))*4+3],0,hair.id+' blank face');
 }
});

test('Thai retains its existing male catalogue and new IDs require the English reference protocol',async()=>{
 const raw=await readFile(root+'src/main.jsx','utf8'),declaration=raw.match(/const MALE_HAIR_OPTIONS=.*?;/)[0];
 const thai=Function('PRODUCTION_HAIR_CATALOG','BASIC_MALE_HAIR_IDS',declaration+'return MALE_HAIR_OPTIONS;')(PRODUCTION_HAIR_CATALOG,['seedream-36','seedream-28']);
 assert(thai.length>4);assert.deepEqual(thai.slice(0,2).map(h=>h.id),['seedream-36','seedream-28']);assert(thai.every(h=>h.interfaceLanguage!=='en'));
 assert(raw.includes('maleHair={englishPreviewEnabled()?ENGLISH_MALE_HAIR_CATALOG:MALE_HAIR_OPTIONS}'));
 for(const hair of ENGLISH_MALE_HAIR_CATALOG){
  assert.equal(validateProductionPortrait({buffer:image,mimetype:'image/png'},{...fields,hairId:hair.id}).id,hair.id);
  for(const patch of [{interfaceLanguage:'th',portraitComposition:undefined,englishStudioFinishVersion:undefined},{hairReferenceVersion:undefined},{englishStudioFinishVersion:undefined}])assert.throws(()=>validateProductionPortrait({buffer:image,mimetype:'image/png'},{...fields,hairId:hair.id,...patch}));
 }
});

test('each new male style uses its exact guide in the existing one-call clothed portrait generation',async()=>{
 const fit={width:96,height:128,bareScalp:true,points:{leftEye:{x:.4,y:.4},rightEye:{x:.6,y:.4},forehead:{x:.5,y:.2},leftTemple:{x:.3,y:.35},rightTemple:{x:.7,y:.35},leftFace:{x:.3,y:.5},rightFace:{x:.7,y:.5},chin:{x:.5,y:.65}}};
 for(const hair of ENGLISH_MALE_HAIR_CATALOG){
  const calls=[];let makeup=0;
  await processProductionPortrait({input:{buffer:image,mimetype:'image/png'},fields:{...fields,hairId:hair.id,englishHairFit:JSON.stringify(fit)},root,key:'inert-test',requestPortrait:async request=>{calls.push(request);return{png:matte}},removeBackground:async()=>matte,onMakeupVariant:async()=>makeup++});
  assert.equal(calls.length,1);assert.equal(makeup,0);assert.deepEqual(calls[0].hair,await loadCatalogueHairGuide(hair.id,root));assert(calls[0].outfit);assert.equal(Boolean(calls[0].hairPlacementReference),Boolean(manifest.entries[hair.id].face));assert.equal(calls[0].size,'1824x2432');
  assert.match(calls[0].prompt,new RegExp('SELECTED ENGLISH MALE HAIRSTYLE '+hair.id));assert.equal(selectedHairDesign(hair).kind,'short');
  const policy=catalogueHairInstruction(hair,'short');assert.match(policy,/short top, forehead fringe/);assert.doesNotMatch(policy,/Retain the exact bob, lob/);assert.match(selectedHairInstruction(hair),/bald scalp/);
 }
});
