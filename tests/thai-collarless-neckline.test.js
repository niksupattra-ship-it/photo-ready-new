import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {usesThaiCollarlessNeckline,addThaiCollarlessReference,thaiCollarlessInstruction,THAI_COLLARLESS_VERSION} from '../thai-collarless-neckline.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
import {createEnglishOutfitDetailReference} from '../english-outfit-fidelity.js';
const root=new URL('..',import.meta.url).pathname;
const base={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,portraitMode:'female',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};
test('collarless inner shirt is explicit new Thai female government styling, never English/archived/male/job outfits',()=>{
 for(const name of ['operational','academic','senior','government-employee'])assert(usesThaiCollarlessNeckline({...base,neckOutfitReferencePath:`/assets/government-uniforms/female-${name}.png`}));
 for(const patch of [{thaiOutfitAiVersion:undefined},{thaiCollarlessVersion:undefined},{thaiCollarlessVersion:'unknown'},{portraitMode:'male'},{neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'}])assert(!usesThaiCollarlessNeckline({...base,...patch}));
 assert.match(thaiCollarlessInstruction(4,7),/Image 7 has THREE panels/);assert.match(thaiCollarlessInstruction(4,7),/REMOVE both pointed shirt-collar flaps/);assert.match(thaiCollarlessInstruction(4,7),/Keep the black tie knot/);
});
test('third neckline panel preserves both selected-outfit colour/rank detail panels with unchanged opaque colours and alpha',async()=>{
 const source=await readFile(root+'public/assets/government-uniforms/female-operational.png');
 const details=await createEnglishOutfitDetailReference(source),extended=await addThaiCollarlessReference(details,root);
 const m=await sharp(extended).metadata();assert.equal(m.width,2304);assert.equal(m.height,768);
 const left=await sharp(extended).extract({left:0,top:0,width:1536,height:768}).raw().toBuffer();
 const original=await sharp(details).raw().toBuffer();let worstOpaque=0,alphaChanges=0;
 for(let i=0;i<left.length;i+=4){if(left[i+3]!==original[i+3])alphaChanges++;if(original[i+3]===255)for(let c=0;c<3;c++)worstOpaque=Math.max(worstOpaque,Math.abs(left[i+c]-original[i+c]));}
 assert.equal(alphaChanges,0);assert(worstOpaque<=1,`Selected opaque fabric/art colour drift ${worstOpaque}`);
 const third=await sharp(extended).extract({left:1536,top:0,width:768,height:768}).stats();assert(third.channels[3].max===255&&third.channels[3].min===0);
 assert.deepEqual(await readFile(root+'public/assets/government-uniforms/female-operational.png'),source,'Native original remains unchanged');
 await assert.rejects(addThaiCollarlessReference(null,root));
});
test('real garment v2 preserves alpha and every visible pixel outside local inner-collar edit, including original insignia',async()=>{
 const {collarlessTemplatePath}=await import('../thai-collarless-version.js');
 const {thaiCollarlessOutfitPath}=await import('../thai-collarless-neckline.js');
 for(const name of ['operational','academic','senior','government-employee']){
  const file=`/assets/government-uniforms/female-${name}.png`,derived=collarlessTemplatePath(file);
  assert.equal(thaiCollarlessOutfitPath({...base,neckOutfitReferencePath:file},file),derived);
  assert.equal(thaiCollarlessOutfitPath({...base,thaiOutfitAiVersion:undefined},file),file);
  const a=await sharp(root+'public'+file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b=await sharp(root+'public'+derived).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(a.info.width,b.info.width);assert.equal(a.info.height,b.info.height);
  let alphaChanges=0,outsideChanges=0,insideChanges=0;
  for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++){
   const i=(y*a.info.width+x)*4;if(a.data[i+3]!==b.data[i+3])alphaChanges++;
   if(!a.data[i+3])continue;
   const changed=[0,1,2].some(c=>a.data[i+c]!==b.data[i+c]);
   if(changed){if(x<710||x>=1340||y<180||y>=941)outsideChanges++;else insideChanges++;}
  }
  assert.equal(alphaChanges,0,name+' alpha');assert.equal(outsideChanges,0,name+' real insignia and cloth');assert(insideChanges>10000);
  const details=await createEnglishOutfitDetailReference(await readFile(root+'public'+derived));
  const extended=await addThaiCollarlessReference(details,'/nonexistent-no-generated-guide',await readFile(root+'public'+derived));
  assert.equal((await sharp(extended).metadata()).width,2304);
 }
});
