import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {productionHair,PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS,selectedHairDesign,downloadHairAllowed} from '../hairstyle-catalog.js';
import {catalogueHairInstruction} from '../catalogue-hair-policy.js';
import {basicThaiHairRequestAllowed} from '../thai-basic-ai-policy.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';

const root=new URL('..',import.meta.url).pathname;
const binary=asset=>readFile(new URL('../public'+asset,import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uploaded=productionHair('seedream-79');
test('uploaded sleek hair replaces only the third Thai free choice, is unique, and works on a paid 89 photo',()=>{
 assert.deepEqual(THAI_FREE_FEMALE_HAIR_IDS,['seedream-14','seedream-42','seedream-79']);
 assert.equal(PRODUCTION_HAIR_CATALOG.filter(h=>h.id===uploaded.id).length,1);
 assert(!uploaded.hidden);assert.equal(uploaded.gender,'female');
 assert.equal(selectedHairDesign(uploaded).kind,'gathered');
 assert.equal(productionHair('seedream-41').hidden,true);assert(downloadHairAllowed('seedream-41'),'Old saved work remains readable');
 assert.equal(basicThaiHairRequestAllowed({hairId:uploaded.id,neckOutfitReferencePath:'/paid.png'},'hairstyle',['/paid.png']),true);
 assert.equal(basicThaiHairRequestAllowed({hairId:'seedream-41',neckOutfitReferencePath:'/paid.png'},'hairstyle',['/paid.png']),false);
 const prompt=catalogueHairInstruction(uploaded,'gathered');assert.match(prompt,/gentle diagonal crown sweep/);assert.match(prompt,/completely clear neck/);assert.match(prompt,/Keep the customer's own face/);
});
test('both uploaded originals and the archived former free guide remain byte-for-byte intact',async()=>{
 assert.equal(hash(await binary('/assets/seedream-hairstyles/references/79-upload.png')),'a0927117e43471749d4b22f57e549b20e89f64adbb254a0312e915f302b7c0a4');
 assert.equal(hash(await binary('/assets/seedream-hairstyles/references/79-portrait.png')),'d0aaa2d9032980360646eed7246ff935b7592cf328fe813d5c824ababcf25b9c');
 assert.equal(hash(await loadCatalogueHairGuide('seedream-41',root)),'b5ed03d07dadb2d6a397776fb7f44d53d35e364c98e8668f081470173d5dde5b');
});
test('new AI guide contains only actual picker hair pixels and excludes donor face, neck, clothing and ZIP cutout artifacts',async()=>{
 const manifest=JSON.parse(await binary('/assets/catalogue-hair-guides/v1/manifest.json'));
 const entry=manifest.entries[uploaded.id],preview=await binary(uploaded.src),guide=await loadCatalogueHairGuide(uploaded.id,root);
 assert.equal(hash(preview),entry.previewSha256);assert.equal(hash(guide),entry.guideSha256);
 assert(guide.equals(await binary('/assets/seedream-hairstyles/references/79.png')),'Legacy reference also uses the clean isolated hair');
 const {data,info}=await sharp(guide).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const original=await sharp(preview).ensureAlpha().raw().toBuffer();let count=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const i=(y*info.width+x)*4;if(!data[i+3])continue;
  count++;assert(y<info.height*.42,'No hair or cutout residue below the ears');
  assert.deepEqual(data.subarray(i,i+3),original.subarray(i,i+3),'No hair redraw or donor-face blending');
 }
 assert.equal(count,entry.hairPixels);assert(count>10000);
 for(const id of [33,263,1,0,152]){const p=entry.face[id],i=(Math.floor(p.y*info.height)*info.width+Math.floor(p.x*info.width))*4;assert.equal(data[i+3],0,'Donor feature '+id)}
});
