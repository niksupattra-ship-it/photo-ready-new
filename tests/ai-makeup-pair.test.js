import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createAiMakeupVariant} from '../ai-portrait-makeup.js';
import {finishSharedStudioSkin,copyStudioSkinBlobMetadata} from '../src/shared-studio-skin.js';
import {mergeAiMakeupPixels} from '../src/ai-makeup-pair.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,originalPortraitAiMetadata} from '../original-portrait-ai.js';
import {SHARED_PORTRAIT_BASE_VERSION} from '../shared-portrait-policy.js';
import {packSavedProjectTransfer,unpackSavedProjectTransfer} from '../src/saved-work-transfer.js';
import {assertSavedProjectResources} from '../src/saved-project.js';
const png=(colour,w=16,h=24)=>sharp({create:{width:w,height:h,channels:4,background:colour}}).png().toBuffer();
const source=b=>'data:image/png;base64,'+b.toString('base64');
test('AI edit uses the finished natural portrait and retains its exact alpha',async()=>{
 const natural=await png({r:90,g:80,b:70,alpha:.5}),made=await png({r:120,g:70,b:80,alpha:1});let calls=0;
 const result=await createAiMakeupVariant(natural,{key:'test-not-sent',requestPortrait:async options=>{calls++;assert(options.portrait.length);assert.match(options.prompt,/Only cosmetics/);return {png:made}}});
 assert.equal(calls,1);const out=await sharp(result).raw().toBuffer(),base=await sharp(natural).raw().toBuffer();
 for(let i=3;i<out.length;i+=4)assert.equal(out[i],base[i]);assert.notEqual(out[0],base[0]);
 await assert.rejects(createAiMakeupVariant(natural,{requestPortrait:async()=>({png:await png('red',30,16)})}),/สัดส่วน/);
 await assert.rejects(createAiMakeupVariant(natural,{requestPortrait:async()=>{throw Error('provider failed')}}),/provider failed/);
});
test('both finishes switch repeatedly using stored AI pixels without preparing or rendering local makeup',async()=>{
 const natural=await png('tan'),made=await png('pink'),base=new Blob([natural],{type:'image/png'});
 Object.assign(base,{idpromStudioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,idpromSharedPortraitBaseVersion:SHARED_PORTRAIT_BASE_VERSION,idpromStudioSkinBaseSource:source(natural),idpromAiMakeupSource:source(made),idpromJobId:'same-job'});
 let current=base;
 for(const style of ['makeup','natural','makeup','natural']){
  current=await finishSharedStudioSkin(current,{style,prepare:()=>{throw Error('local cosmetics must not run')}});
  assert.deepEqual(Buffer.from(await current.arrayBuffer()),style==='natural'?natural:made);assert.equal(current.idpromJobId,'same-job');
 }
 const makeup=await finishSharedStudioSkin(current,{style:'makeup'}),metadata=originalPortraitAiMetadata(makeup);
 assert.equal(metadata.aiMakeupSource,source(made));
 const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{id:'head',kind:'head',x:0,y:0,scale:1,rotation:0,opacity:1,name:'หัว · คอ · ผม',source:source(made),...metadata}]};
 assertSavedProjectResources(project);
 const restored=unpackSavedProjectTransfer(JSON.parse(JSON.stringify(packSavedProjectTransfer(project))));
 assert.equal(restored.layers[0].aiMakeupSource,source(made));
 const reopened=copyStudioSkinBlobMetadata(base,new Blob([made],{type:'image/png'}));
 assert.equal((await finishSharedStudioSkin(reopened,{style:'natural'})).size,natural.length);
 await assert.rejects(finishSharedStudioSkin(base,{style:'makeup',signal:{aborted:true}}),/ยกเลิก/);
});
test('cosmetic merge leaves hair, eyes, neck, outside-face pixels and alpha unchanged',()=>{
 const width=100,height=100,n=width*height,natural=new Uint8ClampedArray(n*4).fill(80),makeup=new Uint8ClampedArray(n*4).fill(180),hair=new Uint8ClampedArray(n*4),face=Array.from({length:468},()=>({x:.5,y:.5}));
 const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 oval.forEach((id,j)=>{const a=j/oval.length*Math.PI*2;face[id]={x:.5+.35*Math.cos(a),y:.45+.35*Math.sin(a)}});
 for(const ids of [[33,160,158,133,153,144],[362,385,387,263,373,380]])ids.forEach((id,j)=>{const a=j/ids.length*Math.PI*2;face[id]={x:(ids[0]===33?.36:.64)+.06*Math.cos(a),y:.4+.03*Math.sin(a)}});
 hair[(30*width+50)*4+3]=255;
 const out=mergeAiMakeupPixels({natural,makeup,width,height,face,hair});
 for(let i=3;i<out.length;i+=4)assert.equal(out[i],natural[i]);
 for(const [x,y] of [[0,0],[50,90],[50,30],[36,40],[64,40]])assert.equal(out[(y*width+x)*4],80);
 assert.equal(out[(55*width+50)*4],180);assert.deepEqual(natural,new Uint8ClampedArray(n*4).fill(80));
});
test('production pipeline finishes both images before delivery and fails the job if makeup generation fails',async()=>{
 const {processProductionPortrait}=await import('../production-portrait-pipeline.js');
 const {AI_MAKEUP_PAIR_VERSION}=await import('../ai-makeup-pair-policy.js');
 const natural=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await png('tan',40,80),left:12,top:8}]).png().toBuffer();
 for(const fail of [false,true]){
  let variant,makeupCalls=0;const stages=[];
  const operation=()=>processProductionPortrait({input:{buffer:natural,mimetype:'image/png'},fields:{portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishPair:AI_MAKEUP_PAIR_VERSION},root:new URL('..',import.meta.url).pathname,key:'fixture-not-sent',removeBackground:async()=>natural,onStage:async stage=>stages.push(stage),onMakeupVariant:async png=>{variant=png},requestPortrait:async options=>{
   if(options.prompt.includes('Apply professional peach-rose')){makeupCalls++;if(fail)throw Error('makeup failed');}return {png:natural};
  }});
  if(fail){await assert.rejects(operation(),/makeup failed/);assert.equal(variant,undefined)}else{const result=await operation();assert(result.length);assert(variant?.length);assert.equal(stages.at(-1),'makeup')}
  assert.equal(makeupCalls,1);
 }
});
