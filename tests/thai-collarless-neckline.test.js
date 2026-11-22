import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {usesThaiCollarlessNeckline,addThaiCollarlessReference,thaiCollarlessInstruction,THAI_COLLARLESS_VERSION} from '../thai-collarless-neckline.js';
import {THAI_AI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
import {createEnglishOutfitDetailReference} from '../english-outfit-fidelity.js';
const root=new URL('..',import.meta.url).pathname;
const base={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiCollarlessVersion:THAI_AI_COLLARLESS_VERSION,portraitMode:'female',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};
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
 const {collarlessTemplatePath,THAI_COLLARLESS_PRIMARY_VERSION}=await import('../thai-collarless-version.js');
 const {thaiCollarlessOutfitPath}=await import('../thai-collarless-neckline.js');
 for(const name of ['operational','academic','senior','government-employee']){
  const file=`/assets/government-uniforms/female-${name}.png`,derived=collarlessTemplatePath(file);
  assert.equal(thaiCollarlessOutfitPath({...base,thaiCollarlessVersion:THAI_COLLARLESS_PRIMARY_VERSION,neckOutfitReferencePath:file},file),derived);
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

test('new AI-only jobs use original real references and force rear hair over forward reference placement',async()=>{
 const {usesThaiAiGarmentOnly,thaiAiGarmentInstruction,thaiCollarlessOutfitPath}=await import('../thai-collarless-neckline.js');
 assert(usesThaiAiGarmentOnly(base));assert(usesThaiAiGarmentOnly({...base,portraitMode:'male'}));
 assert(!usesThaiAiGarmentOnly({...base,thaiOutfitAiVersion:undefined}));
 assert.equal(thaiCollarlessOutfitPath(base,base.neckOutfitReferencePath),base.neckOutfitReferencePath);
 const text=thaiAiGarmentInstruction(3,5,true);assert.match(text,/ORIGINAL REAL garment/);assert.match(text,/overrides forward-draped hair/);assert.match(text,/REMOVE both pointed shirt-collar flaps/);assert.match(text,/no post-generation garment overlay/);
 const pipeline=await readFile(root+'production-portrait-pipeline.js','utf8'),native=await readFile(root+'src/studio-source.js','utf8');
 assert(!native.includes('collarlessTemplatePath'));assert(pipeline.includes('const frontShield=!usesThaiAiGarmentOnly(fields)&&requiresThaiNativeFrontShield(fields)'),'AI-only revision cannot enable a legacy garment mask');assert(pipeline.includes('collarless&&!usesThaiAiGarmentOnly(fields)'));
 assert(pipeline.indexOf('if(usesThaiAiGarmentOnly(fields))prompt+=thaiAiGarmentInstruction')>pipeline.indexOf('prompt=applyThaiRealFacePolicy(prompt,fields);',pipeline.indexOf('const collarless=')));
});

test('v4 restores the original shirt collar as one pair of leaves, keeps rear hair and never enables collarless references',async()=>{
 const {thaiAiGarmentInstruction,usesThaiAiGarmentOnly,thaiCollarlessOutfitPath,usesThaiOriginalCollar}=await import('../thai-collarless-neckline.js');
 const fields={...base,thaiCollarlessVersion:THAI_COLLARLESS_VERSION};
 assert(usesThaiAiGarmentOnly(fields));assert(!usesThaiCollarlessNeckline(fields));assert(usesThaiOriginalCollar(fields));assert(!usesThaiOriginalCollar({...fields,neckOutfitReferencePath:'/assets/gown-uniforms/example.png'}));assert(!usesThaiOriginalCollar(base));
 assert.equal(thaiCollarlessOutfitPath(fields,fields.neckOutfitReferencePath),fields.neckOutfitReferencePath);
 const prompt=thaiAiGarmentInstruction(3,5,false,true);
 assert.match(prompt,/ORIGINAL SINGLE SHIRT COLLAR/);assert.match(prompt,/left and right pointed collar leaves/);assert.match(prompt,/not two stacked collars/);assert.match(prompt,/BEHIND BOTH SHOULDERS/);
 assert(!prompt.includes('REMOVE both pointed shirt-collar flaps'));assert(!prompt.includes('WITHOUT inner pointed collar'));
});
test('v5 fixes only the doubled edge touching neck skin and preserves the genuine shirt collar',async()=>{
 const {usesThaiSingleSkinCollarSeam,thaiSingleSkinCollarSeamInstruction,thaiAiGarmentInstruction,usesThaiOriginalCollar,usesThaiAiGarmentOnly}=await import('../thai-collarless-neckline.js');
 const {THAI_ORIGINAL_COLLAR_PREVIOUS_VERSION}=await import('../thai-collarless-version.js');
 const fields={...base,thaiCollarlessVersion:THAI_COLLARLESS_VERSION};
 for(const name of ['operational','academic','senior','government-employee'])assert(usesThaiSingleSkinCollarSeam({...fields,neckOutfitReferencePath:`/assets/government-uniforms/female-${name}.png`}));
 for(const patch of [{thaiCollarlessVersion:THAI_ORIGINAL_COLLAR_PREVIOUS_VERSION},{portraitMode:'male'},{thaiOutfitAiVersion:undefined},{neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'}])assert(!usesThaiSingleSkinCollarSeam({...fields,...patch}));
 const old={...fields,thaiCollarlessVersion:THAI_ORIGINAL_COLLAR_PREVIOUS_VERSION};assert(usesThaiOriginalCollar(old));assert(usesThaiAiGarmentOnly(old));
 const archived=thaiAiGarmentInstruction(3,5,false,true),current=thaiAiGarmentInstruction(3,5,false,true,true);
 assert(archived.includes('including its folded band'));assert(!current.includes('including its folded band'));assert(current.includes('left and right pointed collar leaves'));
 const text=thaiSingleSkinCollarSeamInstruction();assert.match(text,/immediately touching the neck skin/);assert.match(text,/not the shadows under/);assert.match(text,/ONE clean continuous seam/);assert.match(text,/Retain BOTH original pointed/);assert.match(text,/not a separately exposed light band/);assert.match(text,/do not.*whiten the whole garment/);assert(!text.includes('REMOVE both pointed'));
 const pipeline=await readFile(root+'production-portrait-pipeline.js','utf8');assert(pipeline.indexOf('if(usesThaiSingleSkinCollarSeam(fields))prompt+=')>pipeline.indexOf('if(usesThaiAiGarmentOnly(fields))prompt+='));
});
