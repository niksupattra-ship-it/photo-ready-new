import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {productionHair} from '../hairstyle-catalog.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {thaiRearHairReference} from '../thai-rear-hair-reference.js';
const root=new URL('..',import.meta.url).pathname;
test('Thai long reference keeps exact real crown pixels without front chest drapes; other cuts bypass',async()=>{
 for(const id of ['seedream-14','seedream-16']){
  const selected=productionHair(id),hair=await loadCatalogueHairGuide(id,root);
  const result=await thaiRearHairReference({selected,hair,root});
  const before=await sharp(hair).metadata(),after=await sharp(result).metadata();
  assert.equal(after.width,before.width);assert(after.height<before.height);
  assert.deepEqual(await sharp(result).raw().toBuffer(),await sharp(hair).extract({left:0,top:0,width:after.width,height:after.height}).raw().toBuffer());
  assert.deepEqual(await loadCatalogueHairGuide(id,root),hair,'Original asset stays unchanged');
 }
 const selected=productionHair('seedream-41'),hair=await loadCatalogueHairGuide(selected.id,root);
 assert.equal(await thaiRearHairReference({selected,hair,root}),hair);
 assert.equal(await thaiRearHairReference({selected:null,hair:null,root}),null);
});
