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
