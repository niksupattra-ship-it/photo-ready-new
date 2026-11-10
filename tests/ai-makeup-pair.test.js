import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createAiMakeupVariant} from '../ai-portrait-makeup.js';
import {finishSharedStudioSkin,copyStudioSkinBlobMetadata} from '../src/shared-studio-skin.js';
import {useAiMakeupPixels} from '../src/ai-makeup-pair.js';
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
test('whole AI image keeps every RGB pixel including eye and jaw boundaries, with only natural cutout alpha',()=>{
 const width=100,height=100,n=width*height,natural=new Uint8ClampedArray(n*4).fill(80),makeup=new Uint8ClampedArray(n*4);
 for(let i=0;i<n;i++){makeup[i*4]=i%256;makeup[i*4+1]=(i*7)%256;makeup[i*4+2]=(i*13)%256;makeup[i*4+3]=255;natural[i*4+3]=i%256;}
 const out=useAiMakeupPixels({natural,makeup,width,height});
 for(let i=0;i<n;i++){for(let c=0;c<3;c++)assert.equal(out[i*4+c],makeup[i*4+c]);assert.equal(out[i*4+3],natural[i*4+3]);}
 assert.notEqual(out,makeup);assert.notEqual(out,natural);
 assert.throws(()=>useAiMakeupPixels({natural,makeup:makeup.slice(4),width,height}),/ขนาด/);
});
test('production pipeline finishes both images before delivery and fails the job if makeup generation fails',async()=>{
 const {processProductionPortrait}=await import('../production-portrait-pipeline.js');
 const {AI_MAKEUP_PAIR_VERSION}=await import('../ai-makeup-pair-policy.js');
 const natural=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await png('tan',40,80),left:12,top:8}]).png().toBuffer();
 for(const [fail,pairVersion] of [[false,AI_MAKEUP_PAIR_VERSION],[false,'ai-makeup-pair-v1'],[true,AI_MAKEUP_PAIR_VERSION]]){
  let variant,makeupCalls=0;const stages=[];
  const operation=()=>processProductionPortrait({input:{buffer:natural,mimetype:'image/png'},fields:{portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishPair:pairVersion},root:new URL('..',import.meta.url).pathname,key:'fixture-not-sent',removeBackground:async()=>natural,onStage:async stage=>stages.push(stage),onMakeupVariant:async png=>{variant=png},requestPortrait:async options=>{
   if(options.prompt.includes('Apply professional peach-rose')){makeupCalls++;if(fail)throw Error('makeup failed');}return {png:natural};
  }});
  if(fail){await assert.rejects(operation(),/makeup failed/);assert.equal(variant,undefined)}else{const result=await operation();assert(result.length);assert(variant?.length);assert.equal(stages.at(-1),'makeup')}
  assert.equal(makeupCalls,1);
 }
});
test('Thai and English AI makeup both request even fair rosy skin with a continuous neck match',async()=>{
 const {AI_MAKEUP_COMPLEXION_POLICY}=await import('../ai-portrait-makeup.js');
 const {AI_MAKEUP_PAIR_VERSION,isAiMakeupPairVersion}=await import('../ai-makeup-pair-policy.js');
 assert.equal(AI_MAKEUP_PAIR_VERSION,'ai-makeup-pair-v9-preserve-face-geometry');assert(isAiMakeupPairVersion('ai-makeup-pair-v7-brow-gap-fill'),'queued older jobs remain valid');
 const natural=await png('tan');
 for(const preserveOutfit of [false,true]){
  let sent;await createAiMakeupVariant(natural,{key:'fixture-not-sent',preserveOutfit,requestPortrait:async p=>{sent=p;return {png:natural}}});
  assert(sent.prompt.endsWith(AI_MAKEUP_COMPLEXION_POLICY));assert.match(sent.prompt,/Preserve the input face width-to-height ratio/);assert.match(sent.prompt,/No face slimming, V-line reshaping/);assert.match(sent.prompt,/Retain dimensional cheek and jaw shading/);assert.match(sent.prompt,/forehead, temples, both cheeks, nose, mouth corners and chin/);assert.match(sent.prompt,/brighter fair-pink makeup finish/);assert.match(sent.prompt,/ears, jawline and all visible neck\/upper-chest skin/);assert.match(sent.prompt,/garment colour, fabric texture, insignia, hair and background untouched/);
  assert.doesNotMatch(sent.prompt,/Do not reshape, whiten|; no whitening,/);
  if(preserveOutfit)assert.match(sent.prompt,/OUTFIT LIGHTING IS THE FIXED AUTHORITY/);
 }
});
