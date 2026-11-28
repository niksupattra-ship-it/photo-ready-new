import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {PRODUCTION_HAIR_CATALOG,productionHair} from '../hairstyle-catalog.js';
import {buildProLabCatalogue} from '../scripts/build-pro-lab-catalogue.mjs';
const root=new URL('..',import.meta.url);
test('every selectable Thai/English hairstyle has a preview and its native/verified-guide dependency',async()=>{
 for(const hair of PRODUCTION_HAIR_CATALOG){
  assert(!hair.hidden);await access(new URL('public'+hair.src,root));
  if(hair.file){
   try{await access(new URL('public/assets/seedream-hairstyles/references/'+hair.file,root))}
   catch(error){if(error.code!=='ENOENT')throw error;await access(new URL('public/assets/catalogue-hair-guides/v1/'+hair.id+'.png',root))}
  }
 }
 const catalogue=await buildProLabCatalogue();assert(catalogue.outfits.length>0&&catalogue.hairs.length>0);
});
test('removed menu styles are rejected before trying to load their deleted references',()=>{
 for(const id of ['seedream-41','seedream-25','seedream-26','seedream-27','seedream-19','seedream-01','seedream-35','seedream-38','female-default-reference'])assert.equal(productionHair(id),null);
});
test('display lookup maps never point at a missing preview or native source',async()=>{
 for(const name of ['studio-thumbnail-map','hair-picker-thumbnails']){
  const map=JSON.parse(await readFile(new URL('src/'+name+'.json',root),'utf8'));
  for(const [source,preview]of Object.entries(map)){await access(new URL('public'+source,root));await access(new URL('public'+preview,root))}
 }
});

test('new uploads occupy the first two free slots and the unchanged old cuts become premium',async()=>{
 const {THAI_FREE_FEMALE_HAIR_IDS,firstGenerationHairFor,selectedHairDesign}=await import('../hairstyle-catalog.js');
 const {basicThaiHairRequestAllowed}=await import('../thai-basic-ai-policy.js');
 const {createHash}=await import('node:crypto');
 assert.deepEqual(THAI_FREE_FEMALE_HAIR_IDS,['seedream-80','seedream-81','seedream-79']);
 assert.equal(firstGenerationHairFor('female'),'seedream-80');
 const hashes={80:'c16f9d8c92cc5c9129d753a795ee5bf76d3a6939f2862531426df0c2c38882d7',81:'6ce45686690e403c2b282058d45808abb779aaff1095e91b9939796d1d1e06be',14:'2afd9404fcd8a8984afab608684eda6a4c123b16bc434f1eef2ac5cb461319a4',42:'e2c387d11602ed48ca7be766782f4235a9390b4053c47d5c20dfa335ac0ac474'};
 for(const number of [80,81,14,42]){
  const hair=productionHair('seedream-'+number);assert(hair);
  const bytes=await readFile(new URL('public/assets/seedream-hairstyles/references/'+hair.file,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hashes[number]);
  assert.equal(basicThaiHairRequestAllowed({hairId:hair.id,neckOutfitReferencePath:'/same.png'},'hairstyle',['/same.png']),number>=80);
 }
 assert.equal(selectedHairDesign(productionHair('seedream-80')).kind,'long');
 assert.equal(selectedHairDesign(productionHair('seedream-81')).kind,'gathered');
 const lab=await buildProLabCatalogue();const visible=lab.hairs.filter(h=>h.gender==='female').map(h=>h.id);assert.deepEqual(visible.slice(0,2),THAI_FREE_FEMALE_HAIR_IDS.filter(id=>id!=='seedream-81'));assert(!visible.includes('seedream-81'));assert.equal(visible[2],'seedream-14');
});
