import assert from 'node:assert/strict';
import sharp from 'sharp';
import {REFERENCE_SKIN_FINISH,REFERENCE_SKIN_PRIORITY} from '../reference-skin-finish.js';
import {femaleFinishFor} from '../review-portrait-finish.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
const image=await sharp({create:{width:64,height:96,channels:4,background:'#ae8877'}}).png().toBuffer();
const cutout=await sharp(image).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const previous=globalThis.fetch,calls=[];
globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:[{b64_json:image.toString('base64')}]}),headers:{get:()=>null}}};
try{
 for(const style of ['natural','korean-rosy-v1']){
  await processProductionPortrait({input:{buffer:image,mimetype:'image/png'},fields:{portraitMode:'female',femaleEyeStyle:style},root:'.',key:'offline-only',removeBackground:async()=>cutout});
  const body=calls.at(-1);assert(body.prompt.includes(REFERENCE_SKIN_FINISH));assert(body.prompt.includes(REFERENCE_SKIN_PRIORITY));
  for(const old of ['Reduce skin-only clarity and texture strongly','substantially further','NO-MAKEUP ONLY — BRIGHTER, FLATTER FRONTAL FILL','SKIN MICROCONTRAST ONLY — LESS CRISP SKIN'])assert(!body.prompt.includes(old),old);
  assert(body.prompt.includes('SHARED HEAD GEOMETRY'));assert.equal(body.image,'data:image/png;base64,'+image.toString('base64'));
 }
 assert(femaleFinishFor('korean-rosy-v1').includes('eyeliner tightly along the upper lash line'));
 assert(!femaleFinishFor('natural').includes('eyeliner tightly along the upper lash line'));
 assert.equal(calls.length,2);
 console.log('PASS candidate provider prompts use accepted example skin wording, preserve selected cosmetics/hair/input, remove aggressive competing skin rules. Provider mocked: visual result NOT validated.');
}finally{globalThis.fetch=previous}
