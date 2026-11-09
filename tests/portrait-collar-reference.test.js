import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
const root=new URL('..',import.meta.url).pathname;
test('Natural female and male jobs send the actual selected collar without adding AI stages',async()=>{
 const template='/assets/gown-uniforms/kmitl-female.png';
 const expected=await sharp(await readFile(root+'public'+template)).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const input=await sharp({create:{width:64,height:96,channels:3,background:'#b99d87'}}).png().toBuffer();
 const cutout=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:40,height:80,channels:4,background:'#b99d87'}}).png().toBuffer(),left:12,top:8}]).png().toBuffer();
 for(const portraitMode of ['female','male']){
  const calls=[];
  const result=await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:{portraitMode,femaleEyeStyle:'natural',neckOutfitReferencePath:template,...(portraitMode==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION}:{})},root,key:'fixture-not-sent',requestPortrait:async p=>{calls.push(p);return {png:input}},removeBackground:async()=>cutout});
  assert(result.length);assert.equal(calls.length,portraitMode==='female'?2:1);
  const generation=calls.at(-1);assert.deepEqual(generation.outfit,expected);
  const index=2+Number(Boolean(generation.hair))+Number(Boolean(generation.identity));
  assert(generation.prompt.includes(`SELECTED COLLAR ALIGNMENT — IMAGE ${index}`));
  assert.match(generation.prompt,/No inward bow, hourglass waist/);
  assert.match(generation.prompt,/Do not generate this garment into the output/);
  if(portraitMode==='female')assert.equal(calls[0].outfit,undefined);
 }
});
test('rejects external, traversal and unsupported collar paths before generation',()=>{
 for(const neckOutfitReferencePath of ['https://example.com/outfit.png','/assets/../server.js','/assets/gown-uniforms/a.svg'])assert.throws(()=>validateProductionPortrait({buffer:Buffer.from('fixture'),mimetype:'image/png'},{portraitMode:'female',femaleEyeStyle:'natural',neckOutfitReferencePath}),/อ้างอิง/);
});
