import assert from 'node:assert/strict';
import sharp from 'sharp';
import {femaleFinishFor} from '../review-portrait-finish.js';
import {productionPortraitPrompt,processProductionPortrait} from '../production-portrait-pipeline.js';
import {NATURAL_SOFT_LIGHT_FINISH,NATURAL_SOFT_LIGHT_PRIORITY} from '../natural-soft-light-finish.js';
import {portraitFinishIsCurrent,NATURAL_FINISH_VERSION} from '../src/portrait-finish-choice.js';
assert.equal(femaleFinishFor('natural'),NATURAL_SOFT_LIGHT_FINISH);
assert(!femaleFinishFor('natural').includes('BROWS — REPLACE OLD BROW APPEARANCE'));
assert(portraitFinishIsCurrent({portraitMode:'female',naturalFinishVersion:NATURAL_FINISH_VERSION},'natural'));
assert(!portraitFinishIsCurrent({portraitMode:'female'},'natural'));
assert(portraitFinishIsCurrent({portraitMode:'male'},'natural'));
const png=await sharp({create:{width:64,height:96,channels:4,background:'#ae8877'}}).png().toBuffer();
const cutout=await sharp(png).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const calls=[],previous=globalThis.fetch;
globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]}),headers:{get:()=>null}}};
try{
 for(const portraitMode of ['female','male']){
  const stages=[],out=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{portraitMode,femaleEyeStyle:'natural'},root:'.',key:'offline-only',removeBackground:async()=>cutout,onStage:async x=>stages.push(x)});
  assert(out.length>8);assert.deepEqual(stages,['generation','matting','edges']);const body=calls.at(-1);
  assert.equal(body.image,'data:image/png;base64,'+png.toString('base64'));
  if(portraitMode==='female'){
   assert(body.prompt.includes('NO ADDED MAKEUP'));assert(body.prompt.includes('REMOVE SKIN HOTSPOTS'));assert(body.prompt.includes('Do not remove eye catchlights'));assert(body.prompt.endsWith(NATURAL_SOFT_LIGHT_PRIORITY));assert(!body.prompt.includes('BROWS — REPLACE OLD BROW APPEARANCE'));
  }else{assert(!body.prompt.includes('NATURAL SOFT LIGHT V2'));assert(body.prompt.startsWith(productionPortraitPrompt({gender:'male'},'natural').split('MALE DEFAULT HAIRSTYLE')[0].slice(0,200)))}
 }
 assert.equal(calls.length,2);console.log('PASS no-makeup sends softer light and skin-glare removal in one request, no makeup instructions; male policy and source pixels preserved; all providers mocked.');
}finally{globalThis.fetch=previous}
