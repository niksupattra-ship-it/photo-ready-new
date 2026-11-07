import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import sharp from 'sharp';
import {femaleFinishFor} from '../review-portrait-finish.js';
import {productionPortraitPrompt,processProductionPortrait} from '../production-portrait-pipeline.js';
import {NATURAL_SOFT_LIGHT_FINISH,NATURAL_SOFT_LIGHT_PRIORITY} from '../natural-soft-light-finish.js';
import {portraitFinishIsCurrent,NATURAL_FINISH_VERSION} from '../src/portrait-finish-choice.js';
assert.equal(femaleFinishFor('natural'),NATURAL_SOFT_LIGHT_FINISH);
assert(!femaleFinishFor('natural').includes('BROWS — REPLACE OLD BROW APPEARANCE'));
assert(portraitFinishIsCurrent({portraitMode:'female',naturalFinishVersion:NATURAL_FINISH_VERSION},'natural'));
assert(!portraitFinishIsCurrent({portraitMode:'female'},'natural'));assert(!portraitFinishIsCurrent({portraitMode:'female',naturalFinishVersion:'natural-soft-light-v2'},'natural'));
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
   assert(body.prompt.includes(NATURAL_SOFT_LIGHT_FINISH));assert(body.prompt.endsWith(NATURAL_SOFT_LIGHT_PRIORITY));
   for(const phrase of ['SURFACE RETOUCH','ordinary freckles','age/sun spots','FLAT DIFFUSE LIGHT','fair-luminous','Retain clearly identifiable moles only','COSMETICS: Keep the original brow design','NATURAL RETOUCHED SKIN'])assert(body.prompt.includes(phrase));
   for(const phrase of ['ไม่ฟอกผิว','skin whitening or feature replacement','not whitening the complexion','permanent identifying marks','8–10%','5–7%','Do not flatten all skin lightness differences','LIGHTING ONLY ADDENDUM','BROWS — REPLACE OLD BROW APPEARANCE'])assert(!body.prompt.includes(phrase),phrase);

  }else{assert(!body.prompt.includes('NATURAL SOFT LIGHT'));assert(body.prompt.startsWith(productionPortraitPrompt({gender:'male'},'natural').split('MALE DEFAULT HAIRSTYLE')[0].slice(0,200)))}
 }
 assert.equal(calls.length,2);console.log('PASS no-makeup sends softer light and skin-glare removal in one request, no makeup instructions; male policy and source pixels preserved; all providers mocked.');
}finally{globalThis.fetch=previous}

const otherPrompts=PRODUCTION_HAIR_CATALOG.flatMap(h=>(h.gender==='female'?['makeup','korean-rosy-v1','soft-rosy-v1']:['natural']).map(style=>({id:h.id,style,prompt:productionPortraitPrompt(h,style)})));
assert.equal(createHash('sha256').update(JSON.stringify(otherPrompts)).digest('hex'),'0189ceaf9d1e41824bebbe431bd6df06523c8ff0b2a63f14787c12643e025ea5','other finish prompts must remain unchanged');
console.log('PASS '+otherPrompts.length+' makeup/hidden/male prompts unchanged byte-for-byte.');
