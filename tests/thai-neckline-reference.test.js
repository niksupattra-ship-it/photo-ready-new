import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {prepareThaiNecklineReference,usesCleanThaiNecklineReference} from '../thai-neckline-reference.js';
import {THAI_COLLARLESS_VERSION,THAI_SKIN_COLLAR_PREVIOUS_VERSION} from '../thai-collarless-version.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
const base={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,portraitMode:'female',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};
test('clean the contaminated real neck-cutout alpha only; all cloth/rank RGB and original files stay exact',async()=>{
 for(const name of ['operational','academic','senior','government-employee']){
  const path=`/assets/government-uniforms/female-${name}.png`,url=new URL('../public'+path,import.meta.url),original=await readFile(url);
  const cleaned=await prepareThaiNecklineReference(original,{...base,neckOutfitReferencePath:path});
  const a=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(cleaned).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(a.info.width,b.info.width);assert.equal(a.info.height,b.info.height);
  let changed=0,rgbChanged=0,outside=0,alphaAdded=0;
  for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++){
   const i=(y*a.info.width+x)*4;
   for(let c=0;c<3;c++)if(a.data[i+c]!==b.data[i+c])rgbChanged++;
   if(b.data[i+3]>a.data[i+3])alphaAdded++;
   if(a.data[i+3]!==b.data[i+3]){changed++;if(x<720||x>1328||y<120||y>=480)outside++}
  }
  assert(changed>1000&&changed<25000,name+' scoped fringe removal');assert.equal(rgbChanged,0,name+' original cloth/insignia RGB');assert.equal(outside,0);assert.equal(alphaAdded,0);
  assert.deepEqual(await readFile(url),original);
 }
});
test('English, archived V5, male and job outfits bypass reference cleanup byte-for-byte',async()=>{
 const original=await readFile(new URL('../public/assets/government-uniforms/female-operational.png',import.meta.url));
 for(const patch of [{thaiOutfitAiVersion:undefined},{thaiCollarlessVersion:THAI_SKIN_COLLAR_PREVIOUS_VERSION},{portraitMode:'male'},{neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'}]){
  const fields={...base,...patch};assert(!usesCleanThaiNecklineReference(fields));assert.equal(await prepareThaiNecklineReference(original,fields),original);
 }
});
test('an unexpected future reference size safely keeps its original bytes rather than failing customer processing',async()=>{
 const tiny=await sharp({create:{width:32,height:32,channels:4,background:'white'}}).png().toBuffer();assert.equal(await prepareThaiNecklineReference(tiny,base),tiny);
});
