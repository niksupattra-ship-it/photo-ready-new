import assert from 'node:assert/strict';
import {PRODUCTION_HAIR_CATALOG,productionHair,selectedHairDesign,selectedHairInstruction,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {replaceHairstyleLayer} from '../src/replace-hairstyle-layer.js';
for(const style of PRODUCTION_HAIR_CATALOG){
 const prompt=productionPortraitPrompt(style);
 assert(prompt.includes(style.id));
 assert(prompt.includes(selectedHairInstruction(style)));
 assert(!prompt.includes('Keep every selected style\'s hanging side lengths'));
 const kind=selectedHairDesign(style).kind;
 if(kind!=='long')assert(prompt.includes('never authorizes extra hair below the selected cut'));
}
for(const id of ['seedream-09','seedream-13','seedream-20','seedream-27']){
 assert.equal(selectedHairDesign(productionHair(id)).kind,'gathered');
 assert(productionPortraitPrompt(productionHair(id)).includes('NO loose long hair'));
}
for(const id of ['seedream-05','seedream-10','seedream-12','seedream-24'])assert(productionPortraitPrompt(productionHair(id)).includes('NO additional rear curtain'));
assert.equal(selectedHairDesign(productionHair('seedream-07')).kind,'long');
const layers=[{id:'bg',source:'bg'},{id:'tail-child',hairHeadId:'tail',source:'old'},{id:'tail',kind:'hair-back',hairHeadId:'head',source:'long'},{id:'head',source:'old-head',mask:'old-mask'},{id:'suit',source:'suit'},{id:'other-hair',hairHeadId:'other',source:'other'}];
const result=replaceHairstyleLayer(layers,'head',{source:'new-short',kind:'head',hairId:'seedream-20',x:123,scale:1.2,hairPolicyVersion:HAIR_DESIGN_VERSION});
assert.deepEqual(result.map(l=>l.id),['bg','head','suit','other-hair']);
const head=result.find(l=>l.id==='head');assert.equal(head.processedOriginalSource,'new-short');assert.equal(head.mask,null);assert.equal(head.warpSource,null);assert.equal(head.x,123);assert.equal(head.scale,1.2);
assert.equal(layers[3].source,'old-head'); // undo snapshot is untouched
assert.equal(result[2],layers[4]);assert.equal(result[0],layers[0]);
const request=seedreamReviewPayload({portrait:Buffer.from('original-upload'),hair:Buffer.from('selected-reference'),prompt:productionPortraitPrompt(productionHair('seedream-20'))});
assert(request.image[0].endsWith(Buffer.from('original-upload').toString('base64')));assert(request.image[1].endsWith(Buffer.from('selected-reference').toString('base64')));
console.log(`PASS: ${PRODUCTION_HAIR_CATALOG.length} style prompts; compact/long policies; linked rear-hair removal; pose and head ID; undo and other layers; portrait/reference order.`);
const {default:sharp}=await import('sharp');
const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');
const {tmpdir}=await import('node:os');
const {join}=await import('node:path');
const {processProductionPortrait}=await import('../production-portrait-pipeline.js');
const root=await mkdtemp(join(tmpdir(),'idprom-hair-'));
const originalFetch=globalThis.fetch;let calls=0;
try{
 await mkdir(join(root,'public/assets/seedream-hairstyles/references'),{recursive:true});
 const reference=Buffer.from('selected-style-20-reference');
 await writeFile(join(root,'public/assets/seedream-hairstyles/references/20.png'),reference);
 const pixels=Buffer.alloc(64*96*4);for(let y=10;y<85;y++)for(let x=15;x<50;x++){const i=(y*64+x)*4;pixels[i]=190;pixels[i+1]=150;pixels[i+2]=120;pixels[i+3]=255}
 const png=await sharp(pixels,{raw:{width:64,height:96,channels:4}}).png().toBuffer();
 globalThis.fetch=async(url,options)=>{
  calls++;const body=JSON.parse(options.body);
  assert.equal(body.image[0],'data:image/png;base64,'+Buffer.from('untouched-original').toString('base64'));
  assert.equal(body.image[1],'data:image/png;base64,'+reference.toString('base64'));
  assert(body.prompt.includes('seedream-20'));assert(body.prompt.includes('NO loose long hair'));
  return {ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]}),headers:{get:()=>null}};
 };
 const output=await processProductionPortrait({input:{buffer:Buffer.from('untouched-original'),mimetype:'image/png'},fields:{hairId:'seedream-20',portraitMode:'female'},root,key:'test-only-placeholder',removeBackground:async image=>image});
 assert(output.length>8);assert.equal(calls,1);
 console.log('PASS: actual production path sends original + selected reference + compact policy in ONE mocked generation; matting/alpha path completes.');
}finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true})}
