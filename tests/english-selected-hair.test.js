import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import boundaries from '../english-hair-boundaries.json' with {type:'json'};
import {PRODUCTION_HAIR_CATALOG,productionHair} from '../hairstyle-catalog.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {englishSelectedHairReference,englishSelectedHairBoundaryInstruction} from '../english-selected-hair.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';

const root=new URL('..',import.meta.url).pathname;
const choices=PRODUCTION_HAIR_CATALOG.filter(h=>h.interfaceLanguage==='en');
test('all 33 English choices bind exact picker context; complete chosen hair pixels remain in the left panel',async()=>{
 assert.equal(choices.length,33);assert.deepEqual(new Set(Object.keys(boundaries)),new Set(choices.map(h=>h.id)));
 for(const h of choices){
  const entry=boundaries[h.id],preview=await readFile(root+'public'+h.src);
  assert.equal(entry.preview,h.src);assert.equal(createHash('sha256').update(preview).digest('hex'),entry.previewSha256);
  const original=await loadCatalogueHairGuide(h.id,root),board=await englishSelectedHairReference({selected:h,hair:original,root});
  const info=await sharp(board).metadata();assert.equal(info.width,1024);assert.equal(info.height,768);assert(!info.hasAlpha);
  // The reference is resampled isotropically, never trimmed at ears/neck.
  const expected=await sharp(original).flatten({background:'#356bd8'}).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const actual=await sharp(board).extract({left:Math.round((512-expected.info.width)/2),top:48,width:expected.info.width,height:expected.info.height}).removeAlpha().raw().toBuffer();
  assert(actual.equals(expected.data),h.id+' selected strands were edited or clipped');
  // Face bounding rectangle is fully neutral, including donor eye/brow corners.
  const {width,height}=await sharp(preview).metadata(),scale=Math.min(480/width,704/height),cx=(Math.min(...entry.faceOval.map(p=>p.x))+Math.max(...entry.faceOval.map(p=>p.x)))/2,cy=(Math.min(...entry.faceOval.map(p=>p.y))+Math.max(...entry.faceOval.map(p=>p.y)))/2;
  const x=512+Math.round((512-Math.round(width*scale))/2)+Math.floor(cx*width*scale),y=48+Math.floor(cy*height*scale);
  const pixel=await sharp(board).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...pixel],[189,195,203]);
 }
});

test('short, bob, gathered and long designs receive distinct endpoint rules, without blanket removal of long hair',()=>{
 const short=englishSelectedHairBoundaryInstruction(productionHair('seedream-77'));
 assert.match(short,/SHORT SELECTED DESIGN/);assert.match(short,/neck-side spaces below the reference ends must remain hair-free/);assert.match(short,/nape spikes, mullet, neck tufts/);
 const long=englishSelectedHairBoundaryInstruction(productionHair('seedream-44'));
 assert.match(long,/LONG SELECTED DESIGN/);assert.match(long,/Do not shorten it to a bob/);assert.doesNotMatch(long,/must remain hair-free/);
 assert.match(englishSelectedHairBoundaryInstruction(productionHair('seedream-47')),/BOB SELECTED DESIGN/);
 assert.match(englishSelectedHairBoundaryInstruction(productionHair('seedream-53')),/GATHERED SELECTED DESIGN/);
});

test('production sends boundary context and final selected rule in its existing single generation',async()=>{
 const input=await sharp({create:{width:96,height:128,channels:4,background:'#b99b88'}}).png().toBuffer();
 const matte=await sharp(input).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 for(const id of ['seedream-77','seedream-44','seedream-47','seedream-53']){
  const h=productionHair(id),calls=[];
  await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:{interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:h.gender,femaleEyeStyle:'natural',hairReferenceVersion:HAIR_REFERENCE_VERSION,hairId:id,neckOutfitReferencePath:'/assets/job-uniforms/male-job-navy-three-piece-burgundy-tie.png'},root,key:'inert',requestPortrait:async r=>{calls.push(r);return{png:matte}},removeBackground:async()=>matte});
  assert.equal(calls.length,1);assert.equal((await sharp(calls[0].hair).metadata()).width,1024);
  assert.equal(calls[0].prompt.includes('FEMALE HAIR LIGHTNESS'),h.gender==='female');
  assert(calls[0].prompt.endsWith(englishSelectedHairBoundaryInstruction(h)),'Selected endpoints must be the final authority, after generic cleanup');
 }
});

test('Thai hair references retain their existing exact bytes',async()=>{
 const h=productionHair('seedream-42'),hair=await loadCatalogueHairGuide(h.id,root);
 assert.equal(await englishSelectedHairReference({selected:h,hair,root}),hair);
});
