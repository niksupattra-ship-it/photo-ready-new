import assert from 'node:assert/strict';
import sharp from 'sharp';
import {productionPortraitPrompt,processProductionPortrait} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';

function check(prompt){
 for(const phrase of ['BOTH complete clavicles','deep and wide enough','small hidden overlap','UPPER-CHEST BASE BELOW the clavicles','shoulder contour lines','detached sloping strokes','WIDE ROUND-NECK GUIDE','ONE broad rounded U','curve must stop ABOVE any breast fullness or cleavage groove','Remove the guide top completely','keep its pattern, collar dimensions and placement unchanged'])assert(prompt.includes(phrase),phrase);
 assert(!/one eighth|SHALLOW ROUND U|SHALLOW U|shallow rounded|shallow coverage limit|shallow round clavicle-base|immediately below the clavicles/i.test(prompt),'Conflicting shallow cutout restriction');
 assert(prompt.includes('no cleavage, breast contours or lower torso'));
}
let count=0;
for(const selected of PRODUCTION_HAIR_CATALOG)for(const finish of ['natural','makeup','korean-rosy-v1']){check(productionPortraitPrompt(selected,finish));count++}

// Exercise final request assembly too: female default appends its own policy.
// All requests are intercepted; no provider or customer endpoint is contacted.
const pixels=Buffer.alloc(64*96*4);
for(let y=8;y<90;y++)for(let x=16;x<48;x++){const i=(y*64+x)*4;pixels[i]=180;pixels[i+1]=140;pixels[i+2]=110;pixels[i+3]=255}
const png=await sharp(pixels,{raw:{width:64,height:96,channels:4}}).png().toBuffer();
const requests=[],oldFetch=globalThis.fetch;
globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]}),headers:{get:()=>null}}};
try{
 for(const portraitMode of ['female','male'])for(const femaleEyeStyle of ['natural','makeup','korean-rosy-v1']){
  const stages=[];const out=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{hairId:'original',portraitMode,femaleEyeStyle},root:'.',key:'mock-only',removeBackground:async image=>image,onStage:async stage=>stages.push(stage)});
  check(requests.at(-1).prompt);assert.deepEqual(stages,['generation','matting','edges']);assert.equal(requests.length,++count-PRODUCTION_HAIR_CATALOG.length*3);
  assert.deepEqual(await sharp(out).raw().toBuffer(),pixels,'Matting cleanup must not stretch skin, face or change native pixels');
 }
}finally{globalThis.fetch=oldFetch}
console.log(`PASS ${count} hairstyle/finish policies including 6 intercepted final default requests: deep wide upper-chest coverage, no conflicting shallow cap, explicit shoulder-line removal, native geometry unchanged; no paid AI.`);
