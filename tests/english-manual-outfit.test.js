import test from 'node:test';
import assert from 'node:assert/strict';
import {planEnglishManualOutfit} from '../src/english-manual-outfit.js';
const uniform=(w,h)=>({width:w,height:h,bounds:{l:0,r:w-1,t:0,b:h-1,w,h},shoulderWidth:w*.9,centerX:w/2,collarTopY:0});
const face={152:{x:.5,y:.43},234:{x:.36,y:.28},454:{x:.64,y:.28}};
const head={sourceFrame:{x:0,y:0,w:900,h:1200},x:0,y:0,scale:1,rotation:0};
test('native garments keep their own aspect and start below the chin, not at the top of a full-person frame',()=>{
 for(const [w,h] of [[900,1200],[1200,800],[600,1100]]){
  const frame=planEnglishManualOutfit({uniform:uniform(w,h),head,face});
  assert(Math.abs(frame.w/frame.h-w/h)<1e-12);
  assert(frame.y>face[152].y*1200);
  assert(frame.y+frame.h>=1200);
 }
});
test('placement follows the existing portrait without changing its transforms',()=>{
 const moved={...head,x:37,y:40,scale:.9},before=JSON.stringify(moved);
 const frame=planEnglishManualOutfit({uniform:uniform(800,1100),head:moved,face});
 assert.equal(JSON.stringify(moved),before);
 assert.equal(frame.x+frame.w/2,487);
 assert(frame.y>500);
});
test('missing face evidence still uses a native-aspect chest placement',()=>{
 const frame=planEnglishManualOutfit({uniform:uniform(800,1100)});
 assert.equal(frame.y,600);assert(Math.abs(frame.w/frame.h-800/1100)<1e-12);
});
