import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planFemaleResultHeadroom} from '../src/female-result-headroom.js';
function portrait(w,h,top,bottom){const p=new Uint8ClampedArray(w*h*4);for(let y=top;y<bottom;y++)for(let x=w*.3|0;x<w*.7;x++)p[(y*w+x)*4+3]=255;return p;}
test('different source crops get 7% crown clearance and bottom contact with one uniform corner-style scale',()=>{
 for(const [w,h,top,bottom] of [[300,400,8,400],[300,400,90,370],[900,1200,75,1200],[1536,2048,250,2010]]){
  const pixels=portrait(w,h,top,bottom),before=pixels.slice(),p=planFemaleResultHeadroom(pixels,w,h);
  assert(p.applied);assert(Math.abs(p.y+top*p.scale-84)<1e-8);assert(Math.abs(p.y+bottom*p.scale-1200)<1e-8);
  assert(Math.abs(p.x+w*p.scale/2-450)<1e-8);assert(p.scale>0);assert.deepEqual(pixels,before);
  const face=60,neck=20,shoulders=150;assert(Math.abs((face*p.scale)/(shoulders*p.scale)-face/shoulders)<1e-12);assert(Math.abs((neck*p.scale)/(face*p.scale)-neck/face)<1e-12);
 }
});
test('isolated alpha specks do not replace the hair crown; uncertain masks retain a safe placement',()=>{
 const pixels=portrait(300,400,40,400);pixels[(2*300+100)*4+3]=255;const p=planFemaleResultHeadroom(pixels,300,400);assert.equal(p.crown,40);
 assert.equal(planFemaleResultHeadroom(new Uint8Array(300*400*4),300,400).applied,false);
});
test('actual composePortrait returns original pixels and uses headroom metadata without an AI call or landmarks',async()=>{
 const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),start=source.indexOf('async function composePortrait('),end=source.indexOf('\nasync function ',start+30),code=source.slice(start,end);
 const pixels=portrait(300,400,20,400),blob={idpromPortraitComposition:'body',idpromMakeupPolicyVersion:'current'},image={naturalWidth:300,naturalHeight:400};
 const env={ENGLISH_HEAD_PORTRAIT_VERSION:'head',ENGLISH_BODY_PORTRAIT_VERSION:'body',FEMALE_EXACT_PROMPT_VERSION:'current',decodedPortraitImage:async()=>image,canvasFor:()=>({width:300,height:400,getContext:()=>({drawImage(){},getImageData:()=>({data:pixels})})}),planFemaleResultHeadroom};
 const compose=Function('env','with(env){'+code+';return composePortrait}')(env),result=await compose(blob);
 assert.equal(result.blob,blob);assert(Math.abs(result.lock.hY+20*result.lock.scale-84)<1e-8);assert(Math.abs(result.lock.hY+400*result.lock.scale-1200)<1e-8);
});
