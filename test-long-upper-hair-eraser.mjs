import test from 'node:test';
import assert from 'node:assert/strict';
import {eraseLongUpperFront,featherLongCrown,eraseLongUpperPortrait} from './src/long-upper-hair-eraser.js';

function fixture(angle=0){
 const w=160,h=180,cx=80,cy=80,eye=52,c=Math.cos(angle),s=Math.sin(angle),face=[],original=new Uint8ClampedArray(w*h*4),skin=new Uint8ClampedArray(w*h*4),portrait=new Uint8ClampedArray(w*h*4);
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c});
 for(const [id,u,v] of [[33,-26,0],[263,26,0],[10,0,-37],[234,-38,0],[454,38,0],[127,-38,-4],[356,38,2]]){const p=world(u,v);face[id]={x:p.x/w,y:p.y/h}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x-cx)*c+(y-cy)*s,v=-(x-cx)*s+(y-cy)*c,j=(y*w+x)*4;
  const top=-58+(Math.floor((u+60)/3)%2?3:0);
  if(Math.abs(u)<=58&&v>=top&&v<=-18||Math.abs(u)>=40&&Math.abs(u)<=58&&v>-18&&v<=90||Math.abs(u)>=26&&Math.abs(u)<=34&&v>=-22&&v<=2)original.set([31,20,18,255],j);
  if(Math.abs(u)<=34&&v>=-25&&v<=75){skin.set([255,255,255,255],j);portrait.set([201,148,126,255],j)}
 }
 const at=(u,v)=>{const p=world(u,v);return (Math.round(p.y)*w+Math.round(p.x))*4};
 return {w,h,eye,face,original,skin,portrait,at,local:(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c})};
}
const combined=(a,b)=>Math.round(a+b*(1-a/255));
for(const angle of [-.3,0,.3])test(`long front hair stays intact while only the actual outer ear edge is erased at ${angle}`,()=>{
 const f=fixture(angle),before=new Uint8ClampedArray(f.original);
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const q=f.local(x,y);if(Math.abs(q.u)>=26&&Math.abs(q.u)<=38&&q.v>=-22&&q.v<=18)f.original.set([31,20,18,255],(y*f.w+x)*4)}
 const original=new Uint8ClampedArray(f.original),front=new Uint8ClampedArray(original);for(let j=0;j<front.length;j+=4)if(f.skin[j+3])front[j+3]=0;
 const out=eraseLongUpperFront(front,original,f.skin,f.w,f.h,f.face,f.portrait);
 for(const [u,v] of [[-30,-7],[30,-7],[-30,2],[30,2],[-36,2],[36,2]]){const j=f.at(u,v);assert.equal(out[j+3],original[j+3],'front strands and hair outside the ear contour are restored exactly '+JSON.stringify([u,v]))}
 let erased=0;for(let j=0;j<out.length;j+=4){assert.deepEqual(out.slice(j,j+3),front.slice(j,j+3));if(out[j+3]<original[j+3]&&original[j+3])erased++}assert.ok(erased>0);
 assert.deepEqual(f.original,original);assert.equal(before.length,original.length);
});
test('a mistaken skin label outside the portrait cannot carve an ear notch',()=>{
 const f=fixture(),front=new Uint8ClampedArray(f.original),j=f.at(30,-7);front[j+3]=0;f.portrait[j+3]=0;
 const out=eraseLongUpperFront(front,f.original,f.skin,f.w,f.h,f.face,f.portrait);assert.equal(out[j+3],f.original[j+3]);
});
test('outer ear erasure has a graded alpha edge rather than a wide binary face cut',()=>{
 const f=fixture();f.original.fill(0);f.skin.fill(0);f.portrait.fill(0);
 for(let y=80;y<94;y++)for(let x=100;x<125;x++){const j=(y*f.w+x)*4;f.original.set([31,20,18,255],j);f.portrait.set([201,148,126,255],j);if(x<=114)f.skin.set([255,255,255,255],j)}
 const out=eraseLongUpperFront(f.original,f.original,f.skin,f.w,f.h,f.face,f.portrait),alpha=[];for(let x=108;x<120;x++)alpha.push(out[(85*f.w+x)*4+3]);
 assert.ok(alpha.some(a=>a>0&&a<255));assert.equal(alpha[0],255,'inner front hair is never erased');assert.equal(alpha.at(-1),255,'outer selected hair is never erased');
});
test('each outer ear edge uses its own height',()=>{
 const f=fixture();for(const u of [-34,34]){const j=f.at(u,-7);f.original.set([31,20,18,255],j)}
 const out=eraseLongUpperFront(f.original,f.original,f.skin,f.w,f.h,f.face,f.portrait);assert.ok(out[f.at(-34,-7)+3]<out[f.at(34,-7)+3]);
});
test('ear-only erasure changes neither the central fringe nor the existing lower face/neck result',()=>{
 const f=fixture();for(let y=15;y<160;y++)for(let x=45;x<115;x++)f.original.set([31,20,18,255],(y*f.w+x)*4);
 const front=new Uint8ClampedArray(f.original);front[f.at(30,25)+3]=67;
 const out=eraseLongUpperFront(front,f.original,f.skin,f.w,f.h,f.face,f.portrait);
 for(const [u,v] of [[0,-30],[0,-10],[0,0],[0,20],[-30,25],[30,25],[-45,60],[45,60]]){const j=f.at(u,v);assert.deepEqual(out.slice(j,j+4),front.slice(j,j+4))}
});
for(const angle of [-.3,0,.3])test(`stacked crown has a visible alpha ramp at ${angle} without changing RGB or lower rear strands`,()=>{
 const f=fixture(angle),result=featherLongCrown(f.original,f.original,f.w,f.h,f.face);let graded=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const j=(y*f.w+x)*4,q=f.local(x,y),alpha=combined(result.front[j+3],result.back[j+3]);
  if(alpha>0&&alpha<250)graded++;
  for(const role of ['front','back']){assert.deepEqual(result[role].slice(j,j+3),f.original.slice(j,j+3));assert.ok(result[role][j+3]<=f.original[j+3]);if(q.v>=-38.82)assert.deepEqual(result[role].slice(j,j+4),f.original.slice(j,j+4))}
 }
 assert.ok(graded>100,'the combined visible crown is feathered, rather than just one hidden PNG');
});
test('two overlaid opaque crowns have the same visible feather as a single crown',()=>{
 const f=fixture(),empty=new Uint8ClampedArray(f.original.length),one=featherLongCrown(f.original,empty,f.w,f.h,f.face),two=featherLongCrown(f.original,f.original,f.w,f.h,f.face);
 for(let j=0;j<f.original.length;j+=4)assert.ok(Math.abs(combined(two.front[j+3],two.back[j+3])-one.front[j+3])<=2,'stacking must not fill the feather back to full opacity');
 const ramp=[];for(let v=-58;v<=-50;v++){const j=f.at(0,v);ramp.push(combined(two.front[j+3],two.back[j+3]))}
 assert.ok(ramp.filter(a=>a>0&&a<255).length>=4);assert.ok(ramp.every((a,i)=>!i||a>=ramp[i-1]));
});
for(const alpha of [64,128,224])test(`partial crown alpha ${alpha} stays transparent after the two layers are feathered`,()=>{
 const f=fixture();for(let v=-58;v<-54;v++)for(let u=-30;u<=30;u++){const j=f.at(u,v);if(f.original[j+3])f.original[j+3]=alpha}
 const result=featherLongCrown(f.original,f.original,f.w,f.h,f.face);
 for(let j=0;j<f.original.length;j+=4){assert.ok(result.front[j+3]<=f.original[j+3]);assert.ok(result.back[j+3]<=f.original[j+3]);if(!f.original[j+3])assert.equal(combined(result.front[j+3],result.back[j+3]),0)}
});
test('the original head cannot make the feathered upper edge opaque again',()=>{
 const f=fixture(),portrait=new Uint8ClampedArray(f.original.length);for(let j=0;j<portrait.length;j+=4)portrait.set([31,20,18,255],j);
 const labels={width:f.w,height:f.h,data:new Uint8Array(f.w*f.h).fill(1)},crown=featherLongCrown(f.original,f.original,f.w,f.h,f.face),head=eraseLongUpperPortrait(portrait,f.w,f.h,f.face,labels,crown.headStrength),j=f.at(0,-58),alpha=combined(crown.front[j+3],crown.back[j+3]);
 assert.ok(alpha>0&&alpha<200);assert.equal(head[j+3],0);assert.equal(combined(alpha,head[j+3]),alpha);
 for(let k=0;k<head.length;k+=4)assert.deepEqual(head.slice(k,k+3),portrait.slice(k,k+3));
});
test('upper portrait cleanup protects actual skin and every forehead/eye/ear/neck pixel even if labelled hair',()=>{
 const f=fixture(),portrait=new Uint8ClampedArray(f.original.length);for(let j=0;j<portrait.length;j+=4)portrait.set([201,148,126,255],j);
 const labels={width:f.w,height:f.h,data:new Uint8Array(f.w*f.h).fill(1)},strength=new Float32Array(f.w*f.h).fill(1),protectedPixel=f.at(0,-49);labels.data[protectedPixel/4]=3;
 const head=eraseLongUpperPortrait(portrait,f.w,f.h,f.face,labels,strength);
 assert.deepEqual(head.slice(protectedPixel,protectedPixel+4),portrait.slice(protectedPixel,protectedPixel+4));
 for(let y=43;y<f.h;y++)for(let x=0;x<f.w;x++){const j=(y*f.w+x)*4;assert.deepEqual(head.slice(j,j+4),portrait.slice(j,j+4))}
});
test('invalid upper hair data fails without changing input pixels',()=>{
 const f=fixture(),before=new Uint8ClampedArray(f.original);
 assert.throws(()=>eraseLongUpperFront(f.original,new Uint8Array(3),f.skin,f.w,f.h,f.face));
 assert.throws(()=>featherLongCrown(f.original,f.original,f.w,f.h,[]));
 assert.throws(()=>eraseLongUpperPortrait(f.original,f.w,f.h,f.face,null,new Float32Array(f.w*f.h)));
 assert.deepEqual(f.original,before);
});

function fullOval(f){
 const ids=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 for(let i=0;i<ids.length;i++){const angle=i*2*Math.PI/ids.length,u=38*Math.sin(angle),v=14-51*Math.cos(angle);f.face[ids[i]]={x:(80+u)/f.w,y:(80+v)/f.h}}
}
test('face landmarks alone cannot erase selected hair when actual ear skin is missing',()=>{
 const f=fixture();fullOval(f);f.skin.fill(0);const out=eraseLongUpperFront(f.original,f.original,f.skin,f.w,f.h,f.face,f.portrait);assert.deepEqual(out,f.original);
});
test('different face contours cannot carve the front temple hair',()=>{
 const f=fixture();fullOval(f);for(const id of [338,297,332,284,251,389,356,454])f.face[id]={...f.face[id],x:(80+(f.face[id].x*f.w-80)*.55)/f.w};
 const out=eraseLongUpperFront(f.original,f.original,f.skin,f.w,f.h,f.face,f.portrait);for(const u of [-30,30]){const j=f.at(u,-7);assert.equal(out[j+3],f.original[j+3])}
});
