import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {hairPreviewTransform,hairSideFit,compressHairSidePixels,createTwoLayerHairPreview} from './src/hair-preview-fit.js';
import {eraseUpperHairExcess,eraseDetachedUpperHair} from './src/upper-hair-eraser.js';
import {isSingleLayerHair} from './src/short-female-hair.js';
import {HAIR_TEMPLATE_ANCHORS} from './src/hair-template-anchors.js';
import {HAIRSTYLE_RULES} from './hairstyle-rules.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const apply=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
function portrait({w=400,h=500,cx=200,cy=220,width=140,height=200,eye=90,angle=0}={}){
 const face=[],c=Math.cos(angle),s=Math.sin(angle);
 const point=(x,y)=>({x:(cx+x*c-y*s)/w,y:(cy+x*s+y*c)/h});
 for(const [id,x,y] of [[33,-eye/2,0],[263,eye/2,0],[234,-width/2,0],[454,width/2,0],[10,0,-height*.4],[152,0,height*.6],[127,-width/2,-eye*.1],[356,width/2,-eye*.1]])face[id]=point(x,y);
 return {face,w,h,cx,cy,width,height,eye,angle};
}
const fit=(f,t)=>hairPreviewTransform(f.face,f.w,f.h,t.face,t.w,t.h);
const sourcePoint=(f,id)=>({x:f.face[id].x*f.w,y:f.face[id].y*f.h});

for(const [name,width,height,eye] of [['enlarge',210,300,135],['shrink',105,150,67.5],['keep the crown for a narrow face',98,240,90],['keep the crown for a short face',210,140,90]])test(`the whole PNG can ${name} without unequal-axis squeezing`,()=>{
 const f=portrait(),t=portrait({width,height,eye}),m=fit(f,t);
 close(m.a,eye/f.eye);close(m.d,eye/f.eye);close(m.b,0);close(m.c,0);
 for(const id of [33,263]){
  const q=apply(m,sourcePoint(f,id)),expected=sourcePoint(t,id);close(q.x,expected.x);close(q.y,expected.y);
 }
});

test('the eye midpoint stays attached while the target face moves and tilts',()=>{
 const f=portrait({angle:-.2}),t=portrait({w:600,h:800,cx:330,cy:350,width:180,height:250,angle:.4}),m=fit(f,t);
 const center=apply(m,{x:f.cx,y:f.cy});close(center.x,t.cx);close(center.y,t.cy);
 for(const id of [33,263]){
  const q=apply(m,sourcePoint(f,id)),expected=sourcePoint(t,id);close(q.x,expected.x);close(q.y,expected.y);
 }
});

test('different face proportions retain straight strands and equal global width/height scale',()=>{
 const f=portrait({angle:.25}),t=portrait({cx:170,cy:200,width:100,height:280,angle:-.35}),m=fit(f,t);
 const a={x:80,y:35},b={x:260,y:410},pa=apply(m,a),pb=apply(m,b);
 for(const fraction of [.1,.25,.5,.75,.9]){
  const p=apply(m,{x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction});
  close(p.x,pa.x+(pb.x-pa.x)*fraction);close(p.y,pa.y+(pb.y-pa.y)*fraction);
 }
 assert.ok(m.a*m.d-m.b*m.c>0,'no mirror or folded PNG');
 close(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));close(m.a*m.c+m.b*m.d,0);
});

test('changing local ear/temple landmarks does not bend the fitted PNG',()=>{
 const f=portrait(),t=portrait({width:110,height:250}),before=fit(f,t);
 t.face[127]={x:.1,y:.1};t.face[356]={x:.8,y:.8};t.face[109]={x:.1,y:.7};
 assert.deepEqual(fit(f,t),before);
});

test('fitting never rewrites the person or reference landmarks',()=>{
 const f=portrait(),t=portrait({width:180,height:230}),before=JSON.stringify([f.face,t.face]);fit(f,t);
 assert.equal(JSON.stringify([f.face,t.face]),before);
});

test('incomplete or collapsed face measurements fail instead of deforming the hair',()=>{
 const f=portrait(),t=portrait();delete t.face[10];assert.throws(()=>fit(f,t));
 const collapsed=portrait();collapsed.face[152]=collapsed.face[10];assert.throws(()=>fit(f,collapsed));
});

// Minimal raster surface for a pixel-contract test; browser filters are not
// modeled here. Tests check which hair pixels the rear adjustment may change.
class Surface{
 constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);this.transforms=[]}
 toDataURL(){return 'data:image/png;test-surface'}
 getContext(){const surface=this;return {
  setTransform(...matrix){surface.transforms.push(matrix)},
  drawImage(source,dx=0,dy=0){
   for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    const xx=Math.round(x+dx),yy=Math.round(y+dy);if(xx<0||yy<0||xx>=surface.width||yy>=surface.height)continue;
    const i=(y*source.width+x)*4,j=(yy*surface.width+xx)*4,alpha=source.data[i+3]/255;
    if(!alpha)continue;
    const previous=surface.data[j+3]/255,next=alpha+previous*(1-alpha);
    for(let k=0;k<3;k++)surface.data[j+k]=Math.round((source.data[i+k]*alpha+surface.data[j+k]*previous*(1-alpha))/next);
    surface.data[j+3]=Math.round(next*255);
   }
  },
  getImageData(){return {data:new Uint8ClampedArray(surface.data)}},
  createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},
  putImageData(image){surface.data.set(image.data)}
 }}
}
for(const id of ['hair-01','hair-19'])test(`long ${id} restores inward rear fitting while keeping its crown and outside edge`,()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),placed=new Surface(w,h),skin=new Surface(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)placed.data.set([x,y,(x+y)%255,255],(y*w+x)*4);
 for(let y=30;y<75;y++)for(let x=30;x<66;x++)skin.data.set([255,255,255,255],(y*w+x)*4);
 const original=new Uint8ClampedArray(placed.data);
 const layers=createTwoLayerHairPreview(placed,skin,f.face,w,h,(w,h)=>new Surface(w,h),{fitLongBack:true,longStyle:id,preserveShape:false});
 assert.notDeepEqual(layers.back.data,original,'inner rear hair must move');assert.deepEqual(placed.data,original);
 for(let y=0;y<h;y++)for(const x of [0,w-1]){
  const j=(y*w+x)*4;assert.deepEqual(layers.back.data.slice(j,j+4),original.slice(j,j+4),'outside silhouette stays pinned');
 }
 assert.deepEqual(layers.back.data.slice(0,w*4),original.slice(0,w*4),'upper crown is unchanged');
 for(let i=0;i<original.length;i+=4)assert.deepEqual(layers.front.data.slice(i,i+3),original.slice(i,i+3));
 assert.ok(layers.front.data.some((v,i)=>i%4===3&&v<255),'front overlap erasure is still applied');
});

test('a compact single-layer preview stays single-layer with no rear warp',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),placed=new Surface(w,h),skin=new Surface(w,h);
 placed.data.fill(255);
 const result=createTwoLayerHairPreview(placed,skin,f.face,w,h,(w,h)=>new Surface(w,h),{singleLayer:true,preserveShape:true});
 assert.equal(result.back,null);assert.deepEqual(result.front.data,placed.data);
});

test('the live picker handles all 41 styles with one affine placement and no retained eraser mask',async()=>{
 const source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8');
 const start=source.indexOf('const fittedHairReferenceCache=new Map();'),end=source.indexOf('const localHairAnchorCache=new Map();',start);
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),target=new Surface(w,h);
 target.data.fill(255);
 const surfaces=[],layerOptions=[];let closed=0;
 const context={Uint8Array,HTMLImageElement:class{},HAIRSTYLE_RULES,HAIR_TEMPLATE_ANCHORS,isSingleLayerHair,hairPreviewTransform,hairSideFit,compressHairSidePixels,eraseUpperHairExcess,eraseDetachedUpperHair,
  getLandmarker:async()=>({detect:()=>({faceLandmarks:[f.face]})}),
  getPersonSegmenter:async()=>({segment:(image,callback)=>callback({categoryMask:{width:w,height:h,getAsUint8Array:()=>new Uint8Array(w*h).fill(1),close:()=>closed++}})}),
  semanticClassMask:async()=>new Surface(w,h),
  opaqueBounds:()=>({x:0,y:0,w,h}),
  canvasFor:(w,h)=>{const surface=new Surface(w,h);surfaces.push(surface);return surface},
  createTwoLayerHairPreview:(...args)=>{layerOptions.push(args[6]);return createTwoLayerHairPreview(...args)}
 };
 const pipeline=vm.runInNewContext(source.slice(start,end)+'\n({prepareStudioHairOverlay,cache:fittedHairReferenceCache})',context);
 const ids=Object.keys(HAIRSTYLE_RULES);assert.equal(ids.length,41);
 for(const id of ids){
  pipeline.cache.set(id,{cutout:target,face:f.face,w,h,calibration:HAIR_TEMPLATE_ANCHORS[id],embeddedEars:false});
  const before=surfaces.length,result=await pipeline.prepareStudioHairOverlay(target,id),created=surfaces.slice(before);
  const transformed=created.filter(surface=>surface.transforms.length);
  assert.equal(transformed.length,1,`${id} must be placed once as a complete PNG`);
  assert.equal(transformed[0].transforms.length,2,`${id} uses one fit followed by identity reset`);
  assert.ok(result.source&&result.cleanedHeadSource);
  assert.deepEqual(Object.keys(result).sort(),['backSource','cleanedHeadSource','source']);
  assert.equal(Boolean(result.backSource),!isSingleLayerHair(id));
 }
 assert.equal(closed,41,'the detection buffers are always released');
 assert.ok(layerOptions.length>0&&layerOptions.every(option=>option.fitLongBack&&option.preserveShape===false),'only long hair takes the restored rear-fitting path');
});

function sideFixture(angle=0,width=44){
 const w=96,h=100,reference=portrait({w,h,cx:48,cy:40,width:64,height:60,eye:28,angle}),target=portrait({w,h,cx:48,cy:40,width,height:60,eye:28,angle});
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels.set([x,y,77,255],(y*w+x)*4);
 const fit=hairSideFit(reference.face,w,h,target.face,w,h);
 return {w,h,pixels,fit,reference,target};
}

test('side compression keeps the complete crown and middle pixel-identical',()=>{
 const f=sideFixture(),original=new Uint8ClampedArray(f.pixels),out=compressHairSidePixels(f.pixels,f.w,f.h,f.fit);
 let changed=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const j=(y*f.w+x)*4,locked=y-f.fit.y<=f.fit.start||Math.abs(x-f.fit.x)<=f.fit.inner;
  if(locked)assert.deepEqual(out.slice(j,j+4),original.slice(j,j+4));
  else if(out[j]!==original[j]||out[j+3]!==original[j+3])changed++;
 }
 assert.ok(changed>0,'only the side sections need resizing');assert.deepEqual(f.pixels,original);
});

test('both side edges meet the measured face width without vertical squeezing',()=>{
 const f=sideFixture(),out=compressHairSidePixels(f.pixels,f.w,f.h,f.fit);
 // Reference cheek edges x=16/80 fit target edges x=26/70 at the same height.
 for(const [dest,source] of [[26,16],[70,80]]){
  const j=(60*f.w+dest)*4;assert.equal(out[j],source);assert.equal(out[j+1],60);assert.equal(out[j+3],255);
 }
 for(let y=50;y<f.h;y++)for(let x=0;x<f.w;x++){
  const j=(y*f.w+x)*4;if(out[j+3])assert.equal(out[j+1],y,'the side squeeze never raises or shortens hair');
 }
});

for(const angle of [-.4,.4])test(`side-only compression follows the tilted head axis ${angle}`,()=>{
 const f=sideFixture(angle),out=compressHairSidePixels(f.pixels,f.w,f.h,f.fit);let changed=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const j=(y*f.w+x)*4,dx=x-f.fit.x,dy=y-f.fit.y,u=dx*f.fit.cos+dy*f.fit.sin,v=-dx*f.fit.sin+dy*f.fit.cos;
  if(v<=f.fit.start||Math.abs(u)<=f.fit.inner)assert.deepEqual(out.slice(j,j+4),f.pixels.slice(j,j+4),'the rotated crown remains untouched');
  else if(out[j+3]&&out[j]!==f.pixels[j]){
   changed++;const sourceV=-(out[j]-f.fit.x)*f.fit.sin+(out[j+1]-f.fit.y)*f.fit.cos;
   assert.ok(Math.abs(sourceV-v)<1,'only the horizontal face-axis coordinate may move');
  }
 }
 assert.ok(changed>0);
});

test('a wider face never expands or squeezes the top through the side operation',()=>{
 const f=sideFixture(0,80);assert.equal(f.fit.sideScale,1);assert.deepEqual(compressHairSidePixels(f.pixels,f.w,f.h,f.fit),f.pixels);
});

test('uniform object resize can enlarge a crown while side width still fits separately',()=>{
 const f=portrait(),t=portrait({width:150,height:280,eye:135}),m=fit(f,t),side=hairSideFit(f.face,f.w,f.h,t.face,t.w,t.h);
 close(Math.hypot(m.a,m.b),1.5);close(Math.hypot(m.c,m.d),1.5);assert.ok(side.sideScale<1);
 const refHalf=f.width*1.5/2;
 close(side.inner+(refHalf-side.inner)*side.sideScale,t.width/2);
});

test('invalid side-fit data fails before changing source pixels',()=>{
 const f=sideFixture(),original=new Uint8ClampedArray(f.pixels);
 assert.throws(()=>compressHairSidePixels(f.pixels,f.w,f.h,{...f.fit,sideScale:0}));
 assert.throws(()=>compressHairSidePixels(f.pixels,f.w,f.h,{...f.fit,sideScale:NaN}));
 assert.deepEqual(f.pixels,original);
});
