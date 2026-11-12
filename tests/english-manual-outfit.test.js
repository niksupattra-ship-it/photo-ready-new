import test from 'node:test';
import assert from 'node:assert/strict';
import {planEnglishManualOutfit,planEnglishFixedPatternOutfit,ENGLISH_MANUAL_OUTFIT_VERSION,ENGLISH_FIXED_PATTERN_WIDTH} from '../src/english-manual-outfit.js';
import {ENGLISH_BODY_PORTRAIT_VERSION} from '../english-body-portrait.js';
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

test('English AI outfit card overlays the exact native pattern without scaling it from the head',()=>{
 const body={...head,portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION};
 const u=uniform(800,1100),wideFace={152:{x:.5,y:.43},234:{x:.2,y:.28},454:{x:.8,y:.28}};
 const a=planEnglishManualOutfit({uniform:u,head:body,face});
 const b=planEnglishManualOutfit({uniform:u,head:body,face:wideFace});
 const direct=planEnglishFixedPatternOutfit({uniform:u,head:body,face});
 assert.deepEqual(a,direct);
 assert.deepEqual(a,b,'face width cannot change pattern frame, even when the head size changes');
 assert.equal(a.w/a.h,u.width/u.height,'native template aspect is immutable');
 assert(Math.abs(u.bounds.w*a.w/u.width-900*ENGLISH_FIXED_PATTERN_WIDTH)<1e-9,'template opaque width sets the display size');
 assert(a.y>face[152].y*1200,'top of selected pattern remains below the chin');
 assert.match(ENGLISH_MANUAL_OUTFIT_VERSION,/fixed-pattern/);
});
test('English AI overlay follows a moved head by translation only without stretching clothing',()=>{
 const body={...head,portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION};
 const u=uniform(800,1100),before=planEnglishManualOutfit({uniform:u,head:body,face});
 const shifted=planEnglishManualOutfit({uniform:u,head:{...body,x:12,y:19},face});
 assert.equal(shifted.w,before.w);
 assert.equal(shifted.h,before.h);
 assert.equal(shifted.x-before.x,12);
 assert.equal(shifted.y-before.y,19);
});


test('English fixed pattern fills canvas on BOTH sides even when face is off-center',()=>{
 const u=uniform(800,1100),body={...head,portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION};
 for(const dx of [-.075,0,.075]){
  const movedFace={152:{x:.5+dx,y:.43},234:{x:.36+dx,y:.28},454:{x:.64+dx,y:.28}};
  const result=planEnglishManualOutfit({uniform:u,head:body,face:movedFace});
  const left=result.x+u.bounds.l*result.w/u.width;
  const right=left+u.bounds.w*result.w/u.width;
  assert(left<=1e-9,'pattern has no white gap on its left');
  assert(right>=900-1e-9,'pattern has no white gap on its right');
  assert(Math.abs(result.w/result.h-u.width/u.height)<1e-12,'native pattern proportions preserved');
  assert(Math.abs((right-left)/900-ENGLISH_FIXED_PATTERN_WIDTH)<1e-12,'outfit scale is fixed from pattern bounds');
 }
});
test('English full-bleed pattern scale stays unchanged when face width is doubled',()=>{
 const u=uniform(800,1100),body={...head,portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION};
 const narrow=planEnglishManualOutfit({uniform:u,head:body,face});
 const wide=planEnglishManualOutfit({uniform:u,head:body,face:{152:face[152],234:{x:.20,y:.28},454:{x:.80,y:.28}}});
 assert.equal(narrow.w,wide.w);
 assert.equal(narrow.h,wide.h);
 assert(ENGLISH_FIXED_PATTERN_WIDTH>=1,'pattern opaque width must cover the whole canvas');
 assert.match(ENGLISH_MANUAL_OUTFIT_VERSION,/full-bleed/);
});
