import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {femaleFinishFor} from '../review-portrait-finish.js';
import {productionPortraitPrompt,processProductionPortrait,checkedOutfitReferencePath} from '../production-portrait-pipeline.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
assert.equal(portraitFinishChoice('korean-rosy-v1','makeup'),'korean-rosy-v1');
assert(!femaleFinishFor('makeup').includes('KOREAN ROSY V1'));
assert(!femaleFinishFor('natural').includes('KOREAN ROSY V1'));
assert(productionPortraitPrompt({gender:'female'},'korean-rosy-v1').includes('KOREAN ROSY V1'));
for(const value of ['/assets/../secret.png','/etc/passwd','https://example.com/a.png'])assert.throws(()=>checkedOutfitReferencePath(value));
const root=await mkdtemp(path.join(tmpdir(),'korean-rosy-'));
const originalFetch=globalThis.fetch;
try{
 const image=await sharp({create:{width:32,height:32,channels:4,background:'#ae8877'}}).png().toBuffer();
 const cutout=await sharp({create:{width:32,height:32,channels:4,background:'#ae8877'}}).extend({top:1,bottom:1,left:1,right:1,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 await mkdir(path.join(root,'public/assets/outfits'),{recursive:true});
 await writeFile(path.join(root,'public/assets/outfits/test.png'),image);
 const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,payload:JSON.parse(options.body)});return {ok:true,json:async()=>({data:[{b64_json:image.toString('base64')}]}),headers:{get:()=>null}}};
 await processProductionPortrait({input:{buffer:image,mimetype:'image/png'},fields:{portraitMode:'female',femaleEyeStyle:'korean-rosy-v1',outfitReferencePath:'/assets/outfits/test.png'},root,key:'mock-only',removeBackground:async()=>cutout});
 assert.equal(calls.length,1);assert.equal(calls[0].payload.image.length,2);
 assert.equal(calls[0].payload.image[0],'data:image/png;base64,'+image.toString('base64'));
 assert(calls[0].payload.prompt.includes('OUTFIT LIGHTING REFERENCE — IMAGE 2'));
 assert(calls[0].payload.prompt.includes('KOREAN ROSY V1'));
}finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true})}
console.log('PASS independent Korean policy, original photo, outfit image, one mocked generation and path validation; no network or paid AI.');
