import test from 'node:test';
import assert from 'node:assert/strict';
import {planEnglishManualOutfit,planEnglishFixedPatternOutfit,ENGLISH_MANUAL_OUTFIT_VERSION,ENGLISH_FIXED_PATTERN_WIDTH} from '../src/english-manual-outfit.js';
import {ENGLISH_BODY_PORTRAIT_VERSION} from '../english-body-portrait.js';
import {englishHeadCutoutAlpha} from '../src/english-head-cutout.js';
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
 const shifted=planEnglishManualOutfit({uniform:u,head:{...body,x:28,y:19},face});
 assert.equal(shifted.w,before.w);
 assert.equal(shifted.h,before.h);
 assert.equal(shifted.x-before.x,28);
 assert.equal(shifted.y-before.y,19);
});

test('overlay preparation masks baked AI clothing but keeps original head, neck skin and long hair',()=>{
 const width=200,height=250,pixels=new Uint8ClampedArray(width*height*4),labelData=new Uint8Array(width*height).fill(3);
 for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
 for(let y=148;y<height;y++)for(let x=0;x<width;x++)labelData[y*width+x]=4;
 for(let y=148;y<height;y++)for(let x=92;x<=108;x++)labelData[y*width+x]=3;
 for(let y=148;y<height;y++)for(let x=18;x<=27;x++)labelData[y*width+x]=1;
 const points=[];for(const [id,x,y]of [[10,100,65],[152,100,125],[234,68,105],[454,132,105]])points[id]={x:x/width,y:y/height};
 const alpha=englishHeadCutoutAlpha(pixels,width,height,points,{data:labelData,width,height}),at=(x,y)=>alpha[y*width+x];
 assert.equal(at(100,95),255,'original face is unchanged');
 assert.equal(at(100,140),255,'neck skin directly below the chin remains visible');
 assert.equal(at(80,200),0,'old AI garment is removed beneath the new PNG');
 assert.equal(at(22,180),255,'legitimate rear hair is preserved');
});
