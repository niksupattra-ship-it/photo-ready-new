import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {eraseFemaleHairExterior} from '../src/female-hair-exterior.js';
import {eraseProcessedUpperHair} from '../src/processed-forehead-fit.js';
import {isSingleFemaleHair} from '../src/short-female-hair.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';

// Native pixel fixtures exercise the real eraser, including deliberately dark
// ears and inner hair that an earlier pass has already made transparent.
// The component dispatch check executes the actual extracted function with
// Canvas/provider spies. No customer image, AI request or financial action.
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const copy=value=>new Uint8ClampedArray(value);
let passed=0;async function test(name,run){await run();passed++;console.log('PASS: '+name)}

function fixture(degrees=0){
 const w=240,h=280,n=w*h,eye=60,cx=120,cy=115,angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c});
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c});
 const point=(u,v)=>{const q=world(u,v);return {x:q.x/w,y:q.y/h}};
 const face=Array.from({length:468},()=>point(0,0));
 for(let k=0;k<OVAL.length;k++){const a=k/OVAL.length*Math.PI*2;face[OVAL[k]]=point(60*Math.sin(a),25-75*Math.cos(a))}
 face[33]=point(-eye/2,0);face[263]=point(eye/2,0);face[127]=point(-72,0);face[356]=point(72,0);face[234]=point(-50,30);face[454]=point(50,30);face[152]=point(0,100);
 const original=new Uint8ClampedArray(n*4),overlay=new Uint8ClampedArray(n*4),labels={width:w,height:h,data:new Uint8Array(n)};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=y*w+x,j=at*4,{u,v}=local(x+.5,y+.5);
  if((u/70)**2+((v+5)/90)**2<1){original.set([28,21,18,255],j);labels.data[at]=1}
  if((u/45)**2+((v-25)/65)**2<1){original.set([190,145,125,255],j);labels.data[at]=3}
  for(const sign of [-1,1])if(((u-sign*74)/10)**2+((v-20)/27)**2<1){original.set([30,23,21,255],j);labels.data[at]=1}
  if(Math.abs(u)<30&&v>85&&v<125){original.set([175,131,113,255],j);labels.data[at]=3}
  if((u/75)**2+((v+45)/35)**2<1)overlay.set([38,23,17,255],j);
 }
 const index=(u,v)=>{const q=world(u,v),x=Math.round(q.x),y=Math.round(q.y);return y*w+x};
 const earLeft=index(-74,20),earRight=index(74,20),inner=index(0,-60),partial=index(12,-55),outer=index(0,-91),facePoint=index(0,30),neck=index(0,110),lowerOuter=index(90,85);
 // A background-labelled dark ear must be as safe as a hair-labelled ear.
 labels.data[earRight]=0;
 original.set([31,24,19,137],partial*4);
 // A native loose panel outside ears/face must still be removable by hair21.
 original.set([25,19,17,255],lowerOuter*4);labels.data[lowerOuter]=1;
 const cleaned=copy(original);
 for(const at of [earLeft,earRight,inner,partial])cleaned[at*4+3]=0;
 return {w,h,eye,face,original,overlay,cleaned,labels,local,index,earLeft,earRight,inner,partial,outer,facePoint,neck,lowerOuter};
}
const run=(f,options={})=>eraseFemaleHairExterior({original:f.original,cleaned:f.cleaned,overlay:f.overlay,width:f.w,height:f.h,face:f.face,labels:f.labels,...options});
const rgba=(pixels,at)=>Array.from(pixels.subarray(at*4,at*4+4));
const guarded=f=>run(f,{aboveEarsOnly:true,preserveInterior:true});

await test('regression fixture exposes old ear and opaque-interior holes before the free-only guards',()=>{
 const f=fixture(),legacy=run(f),earOnly=run(f,{aboveEarsOnly:true});
 assert.equal(f.original[f.earLeft*4+3],255);assert.equal(legacy[f.earLeft*4+3],0);
 assert.equal(earOnly[f.earLeft*4+3],255);assert.equal(earOnly[f.inner*4+3],0);
 assert.equal(f.overlay[f.inner*4+3],255);assert.equal(f.original[f.inner*4+3],255);
});
await test('free guard restores both dark ears despite incorrect hair/background labels',()=>{
 const f=fixture(),output=guarded(f);
 for(const at of [f.earLeft,f.earRight])assert.deepEqual(rgba(output,at),rgba(f.original,at));
});
await test('free whole-ear and inner-hair protection works without a global lower-plane restore',()=>{
 for(const degrees of [0,-25,18,31]){
  const f=fixture(degrees),output=run(f,{preserveInterior:true,aboveEarsOnly:false});
  for(const at of [f.earLeft,f.earRight,f.inner,f.partial])assert.deepEqual(rgba(output,at),rgba(f.original,at),`tilt ${degrees}`);
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
   const {u,v}=f.local(x+.5,y+.5),ear=[-1,1].some(sign=>((u-sign*74)/10)**2+((v-20)/27)**2<1);
   if(ear)assert.deepEqual(rgba(output,y*f.w+x),rgba(f.original,y*f.w+x),`whole ear, tilt ${degrees}`);
  }
 }
});
await test('hair21 still removes detached lower hair outside the ear and face guard',()=>{
 const f=fixture(),output=run(f,{preserveInterior:true,aboveEarsOnly:false});
 assert.equal(f.original[f.lowerOuter*4+3],255);assert.equal(f.overlay[f.lowerOuter*4+3],0);
 assert.equal(output[f.lowerOuter*4+3],0,'preserve ears without retaining an old lower curtain');
 const plane=run(f,{preserveInterior:true,aboveEarsOnly:true});assert.deepEqual(rgba(plane,f.lowerOuter),rgba(f.original,f.lowerOuter),'short-style lower-plane behavior remains available');
});
await test('free guard restores inner native hair already erased beneath opaque replacement pixels',()=>{
 const f=fixture(),output=guarded(f);
 assert.equal(f.cleaned[f.inner*4+3],0);assert.equal(f.overlay[f.inner*4+3],255);
 assert.deepEqual(rgba(output,f.inner),rgba(f.original,f.inner));
});
await test('restoration retains original partial alpha instead of making hair opaque',()=>{
 const f=fixture(),output=guarded(f);
 assert.equal(f.original[f.partial*4+3],137);assert.equal(f.cleaned[f.partial*4+3],0);
 assert.deepEqual(rgba(output,f.partial),rgba(f.original,f.partial));
});
await test('ear protection follows rotated eye axes and retains the entire original lower portrait',()=>{
 for(const degrees of [-25,18,31]){
  const f=fixture(degrees),output=guarded(f),cutoff=-Math.max(2,f.eye*.26);
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(f.local(x+.5,y+.5).v>=cutoff){
   const j=(y*f.w+x)*4;assert.deepEqual(Array.from(output.subarray(j,j+4)),Array.from(f.original.subarray(j,j+4)),`tilt ${degrees}: ${x},${y}`);
  }
  for(const at of [f.earLeft,f.earRight,f.inner,f.partial])assert.deepEqual(rgba(output,at),rgba(f.original,at),`tilt ${degrees}`);
 }
});
await test('confirmed original hair beyond the selected upper crown remains removable',()=>{
 for(const degrees of [0,-25,18]){
  const f=fixture(degrees),output=guarded(f);
  assert.equal(f.original[f.outer*4+3],255);assert.equal(f.overlay[f.outer*4+3],0);
  assert(output[f.outer*4+3]<f.original[f.outer*4+3],'outer crown must still be erased');
 }
});
await test('guard never changes RGB, known skin, face, neck or any input buffer',()=>{
 const f=fixture(),before={original:copy(f.original),cleaned:copy(f.cleaned),overlay:copy(f.overlay),labels:new Uint8Array(f.labels.data)},output=guarded(f);
 for(let at=0;at<f.w*f.h;at++){
  const j=at*4;for(let k=0;k<3;k++)assert.equal(output[j+k],f.original[j+k]);
  if([2,3,4].includes(f.labels.data[at]))assert.deepEqual(rgba(output,at),rgba(f.original,at));
 }
 for(const at of [f.facePoint,f.neck])assert.deepEqual(rgba(output,at),rgba(f.original,at));
 assert.deepEqual(f.original,before.original);assert.deepEqual(f.cleaned,before.cleaned);assert.deepEqual(f.overlay,before.overlay);assert.deepEqual(f.labels.data,before.labels);
});
await test('native upper-crown pass followed by free guard preserves the same ears and inner hair',()=>{
 const f=fixture();f.cleaned=eraseProcessedUpperHair(f.original,f.overlay,f.w,f.h,f.face,f.labels);
 const output=guarded(f);for(const at of [f.earLeft,f.earRight,f.inner,f.partial])assert.deepEqual(rgba(output,at),rgba(f.original,at));
 assert(output[f.outer*4+3]<f.original[f.outer*4+3]);
});
await test('omitted and explicit false preserveInterior retain the same legacy eraser result',()=>{
 for(const aboveEarsOnly of [false,true]){
  const f=fixture();assert.deepEqual(run(f,{aboveEarsOnly}),run(f,{aboveEarsOnly,preserveInterior:false}));
 }
});

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const start=main.indexOf('async function finishStudioHairPreview('),end=main.indexOf('\nasync function prepareStudioHairOverlay(',start);
assert(start>=0&&end>start,'actual finishStudioHairPreview must exist');
const makeFinish=new Function('env','with(env){'+main.slice(start,end)+';return finishStudioHairPreview}');
function canvas(w,h,pixels=new Uint8ClampedArray(w*h*4)){
 const value={width:w,height:h,pixels:copy(pixels)};
 value.getContext=()=>({drawImage:source=>value.pixels.set(source.pixels),getImageData:()=>({data:copy(value.pixels)}),putImageData:image=>value.pixels.set(image.data)});
 value.toDataURL=()=>JSON.stringify(Array.from(value.pixels));return value;
}
async function route(id){
 const calls=[],f=fixture(),target=canvas(f.w,f.h,f.original),front=canvas(f.w,f.h,f.overlay),pngBefore=copy(front.pixels);
 const env={canvasFor:canvas,studioHairLabels:async()=>f.labels,isSingleFemaleHair,isFreeFemaleHair,
  eraseProcessedUpperHair:pixels=>{calls.push({kind:'upper'});return copy(pixels)},
  eraseMaleTempleExcess:pixels=>{calls.push({kind:'male'});return copy(pixels)},
  eraseFemaleHairExterior:options=>{calls.push({kind:'female',aboveEarsOnly:options.aboveEarsOnly,preserveInterior:options.preserveInterior});return copy(options.cleaned)}
 };
 const result=await makeFinish(env)(target,front,null,f.face,id);assert.deepEqual(front.pixels,pngBefore,'selected PNG is unchanged');assert.equal(result.backSource,null);
 return {calls,result};
}
await test('actual finishing dispatch protects all three free IDs and never invokes male cleanup',async()=>{
 for(const id of ['hair-21','hair-25','hair-26']){
  const {calls}=await route(id);assert.deepEqual(calls,[{kind:'upper'},{kind:'female',aboveEarsOnly:id!=='hair-21',preserveInterior:true}],id);
 }
});
await test('other female local routes retain their legacy cleanup and do not opt into free guards',async()=>{
 for(const id of ['hair-18','hair-22','hair-23','hair-24','hair-27','hair-28','hair-29']){
  const {calls}=await route(id),short=['hair-22','hair-24'].includes(id);
  assert.deepEqual(calls,[{kind:'upper'},...(!short?[{kind:'male'}]:[]),{kind:'female',aboveEarsOnly:short,preserveInterior:false}],id);
 }
});
await test('male local routes keep upper and male cleanup without female restoration',async()=>{
 for(const id of ['manhair-01','manhair-15','manhair-40'])assert.deepEqual((await route(id)).calls,[{kind:'upper'},{kind:'male'}],id);
});

console.log(`PASS: ${passed} free PNG ear/interior regression scenarios; real pixel erasers, native fixtures, component dispatch spies; no AI or billing.`);
