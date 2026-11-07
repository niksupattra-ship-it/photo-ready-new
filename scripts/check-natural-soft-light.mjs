import assert from 'node:assert/strict';
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
   assert(body.prompt.includes('NO ADDED MAKEUP'));assert(body.prompt.includes('NATURAL SKIN RETOUCH — EVEN TONE, FINE LINES AND DISCOLOURATION'));assert(body.prompt.includes('small acne/post-acne dark spots'));assert(body.prompt.includes('pore-rim contrast and gritty grain visibly further'));assert(body.prompt.includes('permanent identifying moles'));assert(body.prompt.includes('FINAL SKIN RETOUCH'));assert(body.prompt.includes('FLAT EVEN SKIN LIGHT'));assert(body.prompt.includes('fine wrinkle pattern is no longer conspicuous'));assert(body.prompt.includes('Flatten surface wrinkle microrelief and patchy light, not facial anatomy'));assert(!body.prompt.includes('lip gloss, foundation or concealer. The lip finish'));assert(body.prompt.includes('SUPPRESS OILY SKIN SHEEN MORE STRONGLY'));assert(body.prompt.includes('STRONGER diffuse frontal fill'));assert(body.prompt.includes('NO-MAKEUP ONLY — BRIGHTER, FLATTER FRONTAL FILL'));assert(body.prompt.includes('NOTICEABLY BRIGHTER, FLATTER, LOW-CONTRAST'));assert(body.prompt.includes('Keep only faint soft anatomical shading'));assert(body.prompt.includes('CURVES AND SHADOWS/HIGHLIGHTS EQUIVALENT'));assert(body.prompt.includes('SKIN-LIGHT DIFFUSION'));assert(body.prompt.includes('LOCAL CURVES AND DODGE & BURN'));assert(body.prompt.includes('Only AFTER the skin exposure is even'));assert(body.prompt.includes('Do not flatten all skin lightness differences'));assert(body.prompt.includes('LOCAL COLOUR BALANCE'));assert(body.prompt.includes('VISIBLY BRIGHTER EVEN SKIN'));assert(body.prompt.includes('WHOLE forehead, BOTH cheeks'));assert(body.prompt.includes('no flat white overlay'));assert(!body.prompt.includes('no uniform face brightening'));assert(body.prompt.includes('REMOVE SKIN HOTSPOTS'));assert(body.prompt.includes('Do not remove eye catchlights'));assert(body.prompt.endsWith(NATURAL_SOFT_LIGHT_PRIORITY));assert(!body.prompt.includes('BROWS — REPLACE OLD BROW APPEARANCE'));
  }else{assert(!body.prompt.includes('NATURAL SOFT LIGHT'));assert(body.prompt.startsWith(productionPortraitPrompt({gender:'male'},'natural').split('MALE DEFAULT HAIRSTYLE')[0].slice(0,200)))}
 }
 assert.equal(calls.length,2);console.log('PASS no-makeup sends softer light and skin-glare removal in one request, no makeup instructions; male policy and source pixels preserved; all providers mocked.');
}finally{globalThis.fetch=previous}
