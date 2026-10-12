import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {eraseDetachedUpperHair} from './src/upper-hair-eraser.js';
import {shortHairInterior,extendShortHairSkin} from './src/short-hair-skin-fill.js';
import {eraseHeadExteriorExcess} from './src/upper-hair-eraser.js';

function fixture(angle=0){
 const w=128,h=140,cx=64,cy=65,eye=48,c=Math.cos(angle),s=Math.sin(angle),portrait=new Uint8ClampedArray(w*h*4),overlay=new Uint8ClampedArray(w*h*4),face=[],labels={data:new Uint8Array(w*h),width:w,height:h};
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c});
 for(const [id,u,v] of [[33,-24,0],[263,24,0],[10,0,-30],[152,0,43],[234,-36,0],[454,36,0],[127,-36,-5],[356,36,-5]]){const p=world(u,v);face[id]={x:p.x/w,y:p.y/h}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x-cx)*c+(y-cy)*s,v=-(x-cx)*s+(y-cy)*c,n=y*w+x,j=n*4;
  if(Math.abs(u)<=40&&v>=-50&&v<=-24){portrait.set([22,17,14,255],j);labels.data[n]=1}
  if(Math.abs(u)<=26&&v>-24&&v<=43){portrait.set([Math.round(178+u*.25),Math.round(122+v*.15),103,255],j);labels.data[n]=3}
  if(Math.abs(u)<=44&&v>=-44&&v<=-30||Math.abs(u)>=28&&Math.abs(u)<=36&&v>-30&&v<=-5)overlay.set([30,22,18,255],j);
 }
 const at=(u,v)=>{const p=world(u,v);return (Math.round(p.y)*w+Math.round(p.x))*4};
 const interior=shortHairInterior(overlay,w,h,face);
 return {w,h,eye,face,portrait,overlay,labels,interior,at,world};
}
const finish=f=>{
 const erased=eraseHeadExteriorExcess(f.portrait,f.overlay,f.w,f.h,f.face,f.labels,{softEdges:true,interior:f.interior});
 return {...extendShortHairSkin(erased,f.overlay,f.w,f.h,f.face,f.labels,f.interior),erased};
};

test('short erasure keeps an enclosed crown opening and the open inner forehead join',()=>{
 const f=fixture();for(let v=-39;v<=-35;v++)for(let u=-2;u<=2;u++){const j=f.at(u,v);f.overlay.fill(0,j,j+4)}
 f.interior=shortHairInterior(f.overlay,f.w,f.h,f.face);
 const before=new Uint8ClampedArray(f.portrait),erased=eraseHeadExteriorExcess(f.portrait,f.overlay,f.w,f.h,f.face,f.labels,{softEdges:true,interior:f.interior});
 for(const [u,v] of [[0,-37],[0,-27],[-12,-27],[12,-27]]){const j=f.at(u,v);assert.equal(f.interior[j/4],1);assert.deepEqual(erased.slice(j,j+4),before.slice(j,j+4),'inner original pixels must never be erased')}
 const outer=f.at(0,-49);assert.ok(erased[outer+3]<before[outer+3],'outer excess is still erased');assert.deepEqual(f.portrait,before);
});

for(const angle of [-.3,0,.3])test(`short skin fills the inner join along this face axis ${angle}`,()=>{
 const f=fixture(angle),before=new Uint8ClampedArray(f.portrait),hairBefore=new Uint8ClampedArray(f.overlay),result=finish(f),j=f.at(0,-27);
 assert.ok(result.filled>0);assert.equal(result.pixels[j+3],255);assert.ok(result.pixels[j]>140&&result.pixels[j+1]>100,'join contains real neighbouring skin, not old dark hair');
 for(let n=0;n<f.labels.data.length;n++)if(f.labels.data[n]===3)assert.deepEqual(result.pixels.slice(n*4,n*4+4),before.slice(n*4,n*4+4),'all existing opaque skin remains exact');
 assert.deepEqual(f.portrait,before);assert.deepEqual(f.overlay,hairBefore);
});

for(const alpha of [0,64,128,239])test(`a short inner hole with alpha ${alpha} is filled with skin without deleting surrounding pixels`,()=>{
 const f=fixture(),j=f.at(0,-27);f.portrait[j+3]=alpha;
 const result=finish(f);assert.equal(result.pixels[j+3],255);assert.ok(result.pixels[j]>140);
 for(const [u,v] of [[0,-18],[0,10],[-24,0],[24,0],[-36,5],[36,5]]){const k=f.at(u,v);assert.deepEqual(result.pixels.slice(k,k+4),f.portrait.slice(k,k+4))}
});

test('eyes and brows remain pixel-exact even if they are wrongly labelled hair',()=>{
 const f=fixture(),points=[[-24,0],[24,0],[-24,-13],[24,-13],[-36,3],[36,3],[0,20]];
 for(const [u,v] of points){const j=f.at(u,v);f.portrait.set([90,7,210,255],j);f.labels.data[j/4]=1}
 const result=finish(f);assert.ok(result.filled>0);
 for(const [u,v] of points){const j=f.at(u,v);assert.deepEqual(result.pixels.slice(j,j+4),f.portrait.slice(j,j+4))}
});

test('individual eyebrow landmarks protect high asymmetric brows from skin copies',()=>{
 const f=fixture(),groups=[[70,63,105,66,107,55,65,52,53,46],[300,293,334,296,336,285,295,282,283,276]];
 for(let side=0;side<2;side++)for(let i=0;i<groups[side].length;i++){
  const u=(side?1:-1)*(12+i),v=side?-20:-23,p=f.world(u,v),j=f.at(u,v);f.face[groups[side][i]]={x:p.x/f.w,y:p.y/f.h};f.portrait.set([15,10,5,255],j);f.labels.data[j/4]=1;
 }
 const result=finish(f);assert.ok(result.filled>0);
 for(const group of groups)for(const id of group){const p=f.face[id],j=(Math.round(p.y*f.h)*f.w+Math.round(p.x*f.w))*4;assert.deepEqual(result.pixels.slice(j,j+4),f.portrait.slice(j,j+4),'the actual high brow wins over generic protection')}
});

test('skin donors never sample eyebrow or eye texture',()=>{
 const f=fixture();for(let v=-17;v<=8;v++)for(let u=-36;u<=36;u++)if(Math.abs(u)>=10){const j=f.at(u,v);f.portrait.set([255,0,255,255],j);f.labels.data[j/4]=3}
 const result=finish(f);assert.ok(result.filled>0);
 for(let j=0;j<result.pixels.length;j+=4)if(!result.pixels.slice(j,j+4).every((v,k)=>v===result.erased[j+k]))assert.ok(result.pixels[j+1]>50&&result.pixels[j+2]<140,'protected magenta feature texture cannot become a donor');
});

test('no safe neighbouring skin leaves the inner hair intact instead of opening a hole',()=>{
 const f=fixture();f.labels.data.fill(1);const result=finish(f),j=f.at(0,-27);
 assert.equal(result.filled,0);assert.ok(result.remaining>0);assert.deepEqual(result.pixels.slice(j,j+4),f.portrait.slice(j,j+4));
});

test('skin filling is restricted to the small inner join, never the exterior, lower face or opaque new hair',()=>{
 const f=fixture(),result=finish(f);let changed=0;
 for(let n=0;n<f.w*f.h;n++)if(!result.pixels.slice(n*4,n*4+4).every((v,k)=>v===result.erased[n*4+k])){
  changed++;assert.equal(f.interior[n],1);assert.ok(f.overlay[n*4+3]<248);assert.ok(f.labels.data[n]===1||f.labels.data[n]===0&&result.erased[n*4+3]<248);
 }
 assert.ok(changed>0);
 for(const [u,v] of [[0,-50],[0,-40],[-30,-10],[0,5],[0,25],[0,43]]){const j=f.at(u,v);assert.deepEqual(result.pixels.slice(j,j+4),result.erased.slice(j,j+4))}
});

test('invalid skin or interior data fails before changing the portrait',()=>{
 const f=fixture(),before=new Uint8ClampedArray(f.portrait);
 assert.throws(()=>extendShortHairSkin(f.portrait,f.overlay,f.w,f.h,f.face,null,f.interior));
 assert.throws(()=>extendShortHairSkin(f.portrait,f.overlay,f.w,f.h,f.face,f.labels,new Uint8Array(3)));
 assert.throws(()=>shortHairInterior(f.overlay,f.w,f.h,[]));
 assert.deepEqual(f.portrait,before);
});

for(const tone of [[65,43,36],[120,90,70],[220,180,145]])test(`skin extension preserves this portrait's own tone ${tone}`,()=>{
 const f=fixture();for(let n=0;n<f.labels.data.length;n++)if(f.labels.data[n]===3)f.portrait.set([...tone,255],n*4);
 const result=finish(f),j=f.at(0,-27);assert.deepEqual([...result.pixels.slice(j,j+4)],[...tone,255]);
});
test('skin extension retains local skin texture instead of painting a flat colour',()=>{
 const f=fixture(),result=finish(f),left=f.at(-8,-27),right=f.at(8,-27);
 assert.ok(result.pixels[left]>140&&result.pixels[right]>140);assert.ok(result.pixels[right]-result.pixels[left]>=3,'translated forehead gradient remains visible');
});

class Surface{
 constructor(w,h,data){this.width=w;this.height=h;this.data=data?new Uint8ClampedArray(data):new Uint8ClampedArray(w*h*4)}
 toDataURL(){return this}
 getContext(){const s=this;return {
  drawImage(src){for(let j=0;j<s.data.length;j+=4){const a=src.data[j+3]/255,b=s.data[j+3]/255*(1-a),out=a+b;if(!out)continue;for(let k=0;k<3;k++)s.data[j+k]=Math.round((src.data[j+k]*a+s.data[j+k]*b)/out);s.data[j+3]=Math.round(out*255)}},
  getImageData(){return {data:new Uint8ClampedArray(s.data)}},putImageData(image){s.data.set(image.data)}
 }}
}
function liveFinish(f,single){
 const source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8'),start=source.indexOf('async function finishStudioHairPreview('),end=source.indexOf('async function prepareStudioHairOverlay(',start);
 const context={studioHairLabels:async()=>f.labels,isSingleLayerHair:()=>single,canvasFor:(w,h)=>new Surface(w,h),eraseDetachedUpperHair,eraseHeadExteriorExcess,
  shortHairInterior:single?shortHairInterior:()=>{throw Error('long hair must not run short interior geometry')},
  extendShortHairSkin:single?extendShortHairSkin:()=>{throw Error('long hair must not copy skin')}
 };
 return vm.runInNewContext(source.slice(start,end)+'\nfinishStudioHairPreview',context);
}
test('the live short finish fills portrait skin below one unchanged hair layer',async()=>{
 const f=fixture(),head=new Surface(f.w,f.h,f.portrait),front=new Surface(f.w,f.h,f.overlay),before=new Uint8ClampedArray(front.data),run=liveFinish(f,true),result=await run(head,front,null,f.face,'manhair-01'),j=f.at(0,-27);
 assert.equal(result.backSource,null);assert.ok(result.cleanedHeadSource.data[j]>140);assert.equal(result.cleanedHeadSource.data[j+3],255);assert.deepEqual(result.source.data,before);
 const eye=f.at(-24,0);assert.deepEqual(result.cleanedHeadSource.data.slice(eye,eye+4),f.portrait.slice(eye,eye+4));assert.deepEqual(head.data,f.portrait);
});
test('the live long finish skips all new short geometry and skin extension',async()=>{
 const f=fixture(),head=new Surface(f.w,f.h,f.portrait),front=new Surface(f.w,f.h,f.overlay),back=new Surface(f.w,f.h,f.overlay),run=liveFinish(f,false),result=await run(head,front,back,f.face,'hair-01');
 const coverage=new Surface(f.w,f.h);coverage.getContext().drawImage(back);coverage.getContext().drawImage(front);
 const expected=eraseHeadExteriorExcess(f.portrait,coverage.data,f.w,f.h,f.face,f.labels);
 assert.deepEqual(result.cleanedHeadSource.data,expected);assert.deepEqual(result.source.data,f.overlay);assert.deepEqual(result.backSource.data,f.overlay);assert.equal(result.hairGapWarning,undefined);
});

test('explicit brow protection also blocks erasure outside an approximate face oval',()=>{
 const f=fixture(),ids=[70,63,105,66,107,55,65,52,53,46];
 for(let n=0;n<f.w*f.h;n++){const x=n%f.w,y=Math.floor(n/f.w);if(y>35)f.overlay.fill(0,n*4,n*4+4)}
 for(let i=0;i<ids.length;i++){const u=-34+i*.5,v=-26,p=f.world(u,v),j=f.at(u,v);f.face[ids[i]]={x:p.x/f.w,y:p.y/f.h};f.portrait.set([10,3,6,255],j);f.labels.data[j/4]=1}
 f.interior=shortHairInterior(f.overlay,f.w,f.h,f.face);const result=finish(f);
 for(const id of ids){const p=f.face[id],j=(Math.round(p.y*f.h)*f.w+Math.round(p.x*f.w))*4;assert.deepEqual(result.pixels.slice(j,j+4),f.portrait.slice(j,j+4),'actual brow landmarks protect alpha and RGB before erasing or filling')}
});

for(const originalAlpha of [0,255])test(`copying opaque skin never reduces interior alpha ${originalAlpha}`,()=>{
 const f=fixture(),j=f.at(0,-27);f.portrait[j+3]=originalAlpha;
 for(let n=0;n<f.labels.data.length;n++)if(f.labels.data[n]===3)f.portrait[n*4+3]=248;
 const result=finish(f);assert.equal(result.pixels[j+3],255);assert.ok(result.pixels[j]>140);
 for(let n=0;n<f.w*f.h;n++)if(f.interior[n])assert.ok(result.pixels[n*4+3]>=result.erased[n*4+3],'there is no alpha erasure inside the head');
});
