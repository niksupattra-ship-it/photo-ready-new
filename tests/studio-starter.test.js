import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import catalog from '../src/studio-starters.json' with {type:'json'};
import previews from '../src/uniform-quick-previews.json' with {type:'json'};
import {measureStarterUniform} from '../scripts/build-studio-starters.mjs';
import {studioStarterPlan,prepareStudioStarter} from '../src/studio-starter.js';

test('every native catalog outfit has source-bound starter geometry and the original template identity',async()=>{
 assert.deepEqual(Object.keys(catalog.uniforms),Object.keys(previews));
 for(const [template,item] of Object.entries(catalog.uniforms)){
  const bytes=await readFile(new URL('../public'+template,import.meta.url));
  assert.equal(item.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  const plan=studioStarterPlan(template,{src:'/assets/background.jpg',id:'default'});
  assert.equal(plan.placement.templatePath,template);assert.equal(plan.preview,previews[template]);
  assert(Object.values(plan.placement).filter(value=>typeof value==='number').every(Number.isFinite));
 }
});

test('starter geometry retains legacy alpha and central collar socket thresholds',()=>{
 const width=100,height=100,data=new Uint8Array(width*height*4);
 for(let y=10;y<90;y++)for(let x=10;x<90;x++)data[(y*width+x)*4+3]=255;
 for(let y=10;y<30;y++)for(let x=46;x<54;x++)data[(y*width+x)*4+3]=0;
 assert.deepEqual(measureStarterUniform(data,width,height),{width,height,left:10,top:10,opaqueWidth:80,socketY:30});
});

test('starter preparation fetches only the 512px garment and unchanged background, without PNG re-encoding',async()=>{
 const template=Object.keys(previews)[0],plan=studioStarterPlan(template,{src:'/assets/background.jpg',id:'default'}),calls=[];
 const prepared=await prepareStudioStarter(plan,{fetchImage:async source=>{calls.push(source);return {ok:true,blob:async()=>new Blob([source],{type:'image/webp'})}},encode:async blob=>'data:image/webp;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64')});
 assert.deepEqual(calls,[plan.background,plan.preview]);assert(!calls.includes(template));
 assert.equal(prepared.layers[1].templatePath,template);assert.equal(prepared.layers[1].suitPreviewOnly,true);
 assert.equal(prepared.layers[0].assetId,'default');assert.deepEqual(prepared.placement,plan.placement);
 assert.equal(studioStarterPlan('/unknown.png',{src:'/assets/background.jpg'}),null);
});

test('failed or cancelled preparation never produces a partial starter project',async()=>{
 const plan=studioStarterPlan(Object.keys(previews)[0],{src:'/assets/background.jpg',id:'default'});
 await assert.rejects(prepareStudioStarter(plan,{fetchImage:async()=>({ok:false})}),/โหลดภาพตัวอย่างไม่สำเร็จ/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(prepareStudioStarter(plan,{signal:controller.signal,fetchImage:async()=>({ok:true,blob:async()=>new Blob(['test'])}),encode:async()=>''}),error=>error.name==='AbortError');
});
