import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createThaiAdaptiveComposition} from '../thai-adaptive-composition.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {thaiBodyGeometryInstruction as old} from '../thai-body-geometry-v4.js';
import {thaiBodyGeometryInstruction as current} from '../thai-body-geometry-policy.js';
test('different face aspects and garment types generate bounded guides without modifying source assets',async()=>{
 for(const file of ['female-operational','male-government-employee']){
 const outfit=await readFile(new URL('../public/assets/government-uniforms/'+file+'.png',import.meta.url));const saved=Buffer.from(outfit);
 for(const aspect of [1.05,1.48,2.1]){
 const identity=await sharp({create:{width:160,height:Math.round(160*aspect),channels:4,background:'#cba38c'}}).png().toBuffer();
 const result=await createThaiAdaptiveComposition({outfit,identity,evidence:{version:1,faceAspect:aspect,jawRatio:aspect<1.2?.95:.68,eyeRatio:.53},gender:file.startsWith('male')?'male':'female'});
 const meta=await sharp(result).metadata();assert.equal(meta.width,1824);assert.equal(meta.height,2432);assert.deepEqual(outfit,saved);
 }
 }
});
test('guide appends after every existing reference; legacy body instructions stay identical',()=>{
 const image=Buffer.from('fixture'),base={prompt:'p',portrait:image,outfit:image,identity:image,hair:image,makeupStudioReference:image,outfitDetailReference:image};
 const a=seedreamReviewPayload(base),b=seedreamReviewPayload({...base,adaptiveComposition:image});assert.deepEqual(b.image.slice(0,-1),a.image);
 for(const version of ['thai-one-call-body-geometry-v1','thai-one-call-whole-head-v2','thai-one-call-balanced-head-v3','thai-one-call-unified-proportions-v4'])for(const gender of ['male','female']){const fields={thaiOutfitAiVersion:'th-full-outfit-ai-v1',thaiBodyGeometryVersion:version};assert.equal(current(fields,gender),old(fields,gender));}
});
