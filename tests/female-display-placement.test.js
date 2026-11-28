import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {femaleDisplayPlacement} from '../female-display-placement.js';
test('placement scales the whole image to both sides and shifts down for headroom, retaining source pixels',()=>{
 const w=300,h=400,data=Buffer.alloc(w*h*4);
 for(let y=40;y<390;y++)for(let x=60;x<204;x++)data.set([80,90,100,255],(y*w+x)*4);
 const before=Buffer.from(data),p=femaleDisplayPlacement(data,w,h);
 assert.deepEqual(data,before);assert.equal(p.sourceWidth,w);assert.equal(p.sourceHeight,h);
 assert(Math.abs(144*p.scale-912)<1e-8);assert(Math.abs(132*p.scale+p.x-450)<1e-8);assert(p.headroom>=108);assert(390*p.scale+p.y>1200,'lower garment remains outside viewport instead of being squeezed');
});
test('actual composition returns editable pose and the unchanged source instead of a cropped bitmap',async()=>{
 const s=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const start=s.indexOf(" if(headBlob.idpromPortraitComposition===ENGLISH_BODY_PORTRAIT_VERSION){",s.indexOf('async function composePortrait'));
 const end=s.indexOf(" const [bg,uniformImg]=",start);
 const data=Buffer.alloc(300*400*4);for(let y=40;y<390;y++)for(let x=60;x<204;x++)data.set([80,90,100,255],(y*300+x)*4);
 const blob={idpromPortraitComposition:'body',idpromMakeupPolicyVersion:'current'};
 const env={headBlob:blob,ENGLISH_BODY_PORTRAIT_VERSION:'body',FEMALE_EXACT_PROMPT_VERSION:'current',decodedPortraitImage:async()=>({naturalWidth:300,naturalHeight:400}),canvasFor:()=>({width:300,height:400,getContext:()=>({drawImage:()=>{},getImageData:()=>({data})})}),femaleDisplayPlacement,templatePath:'selected.png',placementOnly:false};
 const run=Function('env','with(env){return (async()=>{'+s.slice(start,end)+'})()}');
 const result=await run(env),pose=femaleDisplayPlacement(data,300,400);
 assert.equal(result.blob,blob);assert.equal(result.lock.headW,300);assert.equal(result.lock.headH,400);
 assert.equal(result.lock.scale,pose.scale);assert.equal(result.lock.hX,pose.x);assert.equal(result.lock.hY,pose.y);
});
