import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMaleSideburnGuide,fitMaleSideburns} from './src/male-sideburn-fit.js';
import {eraseProcessedUpperHair} from './src/processed-forehead-fit.js';

function fixture({angle=0,scale=1,inner=49,left=45,right=44}={}){
 const w=Math.round(180*scale),h=Math.round(210*scale),cx=w/2,cy=90*scale,c=Math.cos(angle),s=Math.sin(angle),face=[];
 const world=(u,v)=>({x:cx+u*scale*c-v*scale*s,y:cy+u*scale*s+v*scale*c});
 for(const [id,u,v] of [[33,-30,0],[263,30,0],[10,0,-50],[234,-50,0],[454,50,0],[127,-50,-7],[356,50,-7],[162,-49,-25],[389,49,-25],[21,-45,-40],[251,45,-40],[93,-48,15],[323,48,15]]){const p=world(u,v);face[id]={x:p.x/w,y:p.y/h}}
 const png=new Uint8ClampedArray(w*h*4),portrait=new Uint8ClampedArray(w*h*4),reference=new Uint8ClampedArray(w*h*4),labels={width:w,height:h,data:new Uint8Array(w*h)};
 const local=(x,y)=>({u:((x-cx)*c+(y-cy)*s)/scale,v:(-(x-cx)*s+(y-cy)*c)/scale});
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const {u,v}=local(x,y),r=Math.abs(u),j=(y*w+x)*4,edge=u<0?left:right;
  if(v>=-40&&v<=85&&r<=edge){portrait.set([205,155,120,255],j);labels.data[j/4]=3}
  else if(v>=-27&&v<=15&&r>edge&&r<=edge+7){portrait.set([24,20,17,255],j);labels.data[j/4]=1}
  if(v>=-40&&v<=85&&r<inner)reference.set([205,155,120,255],j);
  if(v>=-24&&v<=15&&r>=inner&&r<=62){png.set([28+Math.round(v)%5,24,19,255],j);reference.set(png.subarray(j,j+4),j)}
  if(v>=-60&&v<=-27&&r<=64){png.set([29,24,19,255],j);reference.set(png.subarray(j,j+4),j)}
 }
 const guide=createMaleSideburnGuide(png,w,h,reference,w,h,face,[1,0,0,1,0,0]);
 return {w,h,png,portrait,reference,face,labels,guide,local,scale,world};
}
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
for(const angle of [-.3,0,.3])for(const scale of [.75,1,1.5])test(`both male sideburns move independently to the observed skin boundary, angle=${angle}, scale=${scale}`,()=>{
 const f=fixture({angle,scale}),png=new Uint8ClampedArray(f.png),portrait=new Uint8ClampedArray(f.portrait);
 assert.ok(f.guide?.sides.every(Boolean));
 const result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity);
 assert.ok(result.report.adjusted,JSON.stringify(result.report));
 assert.ok(result.report.sides.every(side=>side.adjusted&&side.after<side.before),JSON.stringify(result.report));
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const j=(y*f.w+x)*4,q=f.local(x,y);
  if(q.v<=-24||q.v>=24||Math.abs(q.u)<=32)assert.deepEqual(result.pixels.slice(j,j+4),png.slice(j,j+4),'crown, fringe, forehead centre and lower PNG stay exact');
 }
 assert.deepEqual(f.png,png);assert.deepEqual(f.portrait,portrait,'the head, ears, face, brows, eyes and neck are read-only');
});
test('a sideburn over the face moves outward while retaining its original texture',()=>{
 const f=fixture({inner:42,left:45,right:45}),result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity);
 assert.ok(result.report.adjusted,JSON.stringify(result.report));assert.ok(result.report.sides.every(side=>side.after<side.before));
 for(let j=0;j<result.pixels.length;j+=4)if(result.pixels[j+3]>0){assert.ok(result.pixels[j]>=23&&result.pixels[j]<=32);assert.equal(result.pixels[j+1],24);assert.equal(result.pixels[j+2],19)}
});
test('uncertain left ear leaves that side exact while the right can still fit',()=>{
 const f=fixture();for(let y=0;y<f.h;y++)for(let x=0;x<f.w/2;x++)if(y<110)f.portrait.set([0,130,255,255],(y*f.w+x)*4);
 const result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity);
 assert.equal(result.report.sides[0].adjusted,false);assert.equal(result.report.sides[1].adjusted,true,JSON.stringify(result.report));assert.equal(result.report.unavailable,true);
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w/2;x++){const j=(y*f.w+x)*4;assert.deepEqual(result.pixels.slice(j,j+4),f.png.slice(j,j+4))}
});
test('large displacement, missing landmarks or missing source hair keep the PNG intact',()=>{
 for(const variant of ['large','face','source','labels']){
  const f=fixture({left:variant==='large'?36:45,right:variant==='large'?36:44});
  if(variant==='face')delete f.face[127];if(variant==='source')f.guide.sides=[null,null];if(variant==='labels')f.labels=null;
  const result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity);
  assert.deepEqual(result.pixels,f.png,variant);assert.equal(result.report.adjusted,false);assert.equal(result.report.unavailable,true);
 }
});
test('guide extraction does not treat retained PNG skin as a sideburn or modify any input',()=>{
 const f=fixture(),skin=new Uint8ClampedArray(f.png.length);
 for(let j=0;j<skin.length;j+=4)skin.set([205,155,120,255],j);
 const before=new Uint8ClampedArray(skin),guide=createMaleSideburnGuide(skin,f.w,f.h,f.reference,f.w,f.h,f.face,[1,0,0,1,0,0]);
 assert.ok(guide.sides.every(side=>side===null));assert.deepEqual(skin,before);
 assert.equal(createMaleSideburnGuide(f.png,f.w,f.h,f.reference,f.w,f.h,f.face,[1,0,0,-1,0,0]),null);
});
test('already aligned sideburns require no deformation',()=>{
 const f=fixture({inner:45,left:45,right:45}),result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity);
 assert.deepEqual(result.pixels,f.png);assert.ok(result.report.sides.every(side=>side.reason==='already-aligned'),JSON.stringify(result.report));
});
test('invalid raster lengths fail before writing any pixels',()=>{
 const f=fixture(),before=new Uint8ClampedArray(f.png);assert.throws(()=>fitMaleSideburns(f.png,new Uint8Array(4),f.w,f.h,f.face,f.labels,f.guide,identity));assert.deepEqual(f.png,before);
});
test('partial-alpha sideburn edges are resampled without blending transparent RGB into hair',()=>{
 const f=fixture();
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const j=(y*f.w+x)*4,q=f.local(x,y);if(q.v>-24&&q.v<15&&Math.abs(q.u)>60&&f.png[j+3])f.png[j+3]=128;if(!f.png[j+3])f.png.set([255,0,255,0],j)}
 const result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity);assert.ok(result.report.adjusted);
 let faded=0;for(let j=0;j<result.pixels.length;j+=4)if(result.pixels[j+3]>0){assert.equal(result.pixels[j+1],24);assert.equal(result.pixels[j+2],19);if(result.pixels[j+3]<255)faded++}
 assert.ok(faded>0);
});
test('a reflected or squeezed global transform is rejected without touching the PNG',()=>{
 const f=fixture();for(const matrix of [{...identity,d:-1},{...identity,a:1.3}]){const result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,matrix);assert.deepEqual(result.pixels,f.png);assert.equal(result.report.unavailable,true)}
});
test('radial strand coordinates remain ordered after the local push',()=>{
 const f=fixture();
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const q=f.local(x,y),j=(y*f.w+x)*4;if(q.v>-24&&q.v<15&&f.png[j+3])f.png[j]=Math.round(Math.abs(q.u))}
 const result=fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity);assert.ok(result.report.adjusted);
 for(const sign of [-1,1]){
  const values=[];for(let r=35;r<66;r++){const p=f.world(sign*r,0),j=(Math.round(p.y)*f.w+Math.round(p.x))*4;if(result.pixels[j+3]>=128)values.push(result.pixels[j])}
  assert.ok(values.length>8);assert.ok(values.every((value,i)=>!i||value>=values[i-1]),'existing strand positions cannot fold or reverse');
 }
});
class Surface{
 constructor(w,h,data){this.width=w;this.height=h;this.data=data?new Uint8ClampedArray(data):new Uint8ClampedArray(w*h*4)}
 toDataURL(){return this}
 getContext(){const s=this;return {drawImage:src=>s.data.set(src.data),getImageData:()=>({data:new Uint8ClampedArray(s.data)}),putImageData:image=>s.data.set(image.data)}}
}
test('the real male finishing path fits only its front PNG and returns a checked one-layer result',async()=>{
 const f=fixture(),head=new Surface(f.w,f.h,f.portrait),front=new Surface(f.w,f.h,f.png),source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8');
 const start=source.indexOf('async function finishStudioHairPreview('),end=source.indexOf('async function prepareStudioHairOverlay(',start);let calls=0;
 const context={studioHairLabels:async()=>f.labels,canvasFor:(w,h)=>new Surface(w,h),eraseProcessedUpperHair,fitMaleSideburns:(...args)=>{calls++;return fitMaleSideburns(...args)}};
 for(const name of ['fitProcessedForehead','createTwoLayerHairPreview','eraseDetachedUpperHair','eraseHeadExteriorExcess','shortHairInterior'])context[name]=()=>{throw Error('male sideburn fitting cannot call '+name)};
 const finish=vm.runInNewContext(source.slice(start,end)+'\nfinishStudioHairPreview',context),result=await finish(head,front,null,f.face,'manhair-29',{maleSideburnFit:true,maleGuide:f.guide,matrix:identity});
 assert.equal(calls,1);assert.equal(result.backSource,null);assert.equal(result.maleSideburnReport.adjusted,true);assert.equal(Boolean(result.maleSideburnWarning),false);
 assert.deepEqual(result.source.data,fitMaleSideburns(f.png,f.portrait,f.w,f.h,f.face,f.labels,f.guide,identity).pixels);assert.deepEqual(result.cleanedHeadSource.data,f.portrait);assert.deepEqual(head.data,f.portrait);
});
