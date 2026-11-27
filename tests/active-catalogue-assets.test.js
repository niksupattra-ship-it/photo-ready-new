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
