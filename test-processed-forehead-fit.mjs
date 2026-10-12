import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {eraseDetachedUpperHair,eraseHeadExteriorExcess} from './src/upper-hair-eraser.js';
import {featherLongCrown} from './src/long-upper-hair-eraser.js';
import {shortHairInterior} from './src/short-hair-skin-fill.js';
import {fitProcessedForehead,eraseProcessedUpperHair} from './src/processed-forehead-fit.js';

const browIds=[70,63,105,66,107,55,65,52,53,46,300,293,334,296,336,285,295,282,283,276];
function fixture(angle=0){
 const w=200,h=220,cx=100,cy=105,eye=64,c=Math.cos(angle),s=Math.sin(angle),face=[],original=new Uint8ClampedArray(w*h*4),front=new Uint8ClampedArray(w*h*4),labels={width:w,height:h,data:new Uint8Array(w*h)};
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c});
 for(const [id,u,v] of [[33,-32,0],[263,32,0],[10,0,-49],[234,-50,0],[454,50,0],[152,0,90],[127,-50,-5],[356,50,-5]]){const p=world(u,v);face[id]={x:p.x/w,y:p.y/h}}
 for(let i=0;i<browIds.length;i++){const u=i<10?-39+i*2:21+(i-10)*2,p=world(u,-17);face[browIds[i]]={x:p.x/w,y:p.y/h}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x-cx)*c+(y-cy)*s,v=-(x-cx)*s+(y-cy)*c,n=y*w+x,j=n*4,skinTop=-33+Math.max(0,-u)*.15;
  if(Math.abs(u)<=56&&v>=-84+Math.abs(u)*.20&&v<skinTop){original.set([31,24,19,255],j);labels.data[n]=1}
  if(Math.abs(u)<=44&&v>=skinTop&&v<80){original.set([Math.round(193+u*.3),Math.round(v+85),125,255],j);labels.data[n]=3}
  if(Math.abs(u)<=52&&v>=-74+Math.abs(u)*.15&&v<=-44+Math.abs(u)*.06)front.set([24,18,14,255],j);
 }
 const at=(u,v)=>{const p=world(u,v);return (Math.round(p.y)*w+Math.round(p.x))*4};
 return {w,h,eye,face,original,front,labels,at,world,local:(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c})};
}
const fit=f=>fitProcessedForehead(f.original,f.front,f.w,f.h,f.face,f.labels);
for(const angle of [-.3,0,.3])for(const category of [0,1,3,5])test(`male erasure affects only the upper old hair, angle=${angle}, category=${category}`,()=>{
 const f=fixture(angle);
 for(const [x,y] of [[2,0],[100,0],[197,0],[3,8],[196,8]]){const n=y*f.w+x;f.original.set([28,21,16,140],n*4);f.labels.data[n]=category}
 const original=new Uint8ClampedArray(f.original),front=new Uint8ClampedArray(f.front),out=eraseProcessedUpperHair(f.original,f.front,f.w,f.h,f.face,f.labels);
 assert.equal(out[f.at(0,-82)+3],0,'the old crown above the PNG is gone');
 for(const [x,y] of [[2,0],[100,0],[197,0],[3,8],[196,8]])assert.equal(out[(y*f.w+x)*4+3],0,'erase through the full upper image border');
 let graded=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const j=(y*f.w+x)*4;assert.deepEqual(out.slice(j,j+3),original.slice(j,j+3),'no skin warp, pixel replacement or recolouring');
  if(f.local(x,y).v>=-49-64*.035)assert.deepEqual(out.slice(j,j+4),original.slice(j,j+4),'all inner forehead, brows, eyes, ears, neck and shoulders stay exact');
  if(out[j+3]>0&&out[j+3]<original[j+3])graded++;
 }
 assert.ok(graded>0);assert.deepEqual(f.original,original);assert.deepEqual(f.front,front);
});
test('male upper erasure preserves actual skin above the crown and fails safely on invalid inputs',()=>{
 const f=fixture(),j=f.at(0,-82);f.original.set([193,93,125,255],j);f.labels.data[j/4]=3;
 const original=new Uint8ClampedArray(f.original),out=eraseProcessedUpperHair(f.original,f.front,f.w,f.h,f.face,f.labels);
 assert.deepEqual(out.slice(j,j+4),original.slice(j,j+4));
 assert.deepEqual(eraseProcessedUpperHair(f.original,new Uint8ClampedArray(f.front.length),f.w,f.h,f.face,f.labels),original,'no detected PNG crown leaves the photo intact');
 for(const labels of [null,{width:2,height:2,data:new Uint8Array(1)}])assert.throws(()=>eraseProcessedUpperHair(f.original,f.front,f.w,f.h,f.face,labels));
 assert.throws(()=>eraseProcessedUpperHair(f.original,f.front,f.w,f.h,[],f.labels));assert.deepEqual(f.original,original);
});
for(const angle of [-.3,0,.3])test(`processed upper hair outside the selected FRONT crown is erased softly at ${angle}`,()=>{
 const f=fixture(angle),original=new Uint8ClampedArray(f.original),front=new Uint8ClampedArray(f.front),result=fit(f),j=f.at(0,-82);
 assert.equal(original[j+3],255);assert.equal(result.pixels[j+3],0);assert.ok(result.erasedPixels>0);
 let graded=0;for(let v=-78;v<=-70;v++){const k=f.at(0,v),alpha=result.pixels[k+3];if(alpha>0&&alpha<255)graded++}assert.ok(graded>=3);
 assert.deepEqual(f.original,original);assert.deepEqual(f.front,front);
});
for(const angle of [-.3,0,.3])test(`the original forehead skin moves upwards below front hair at ${angle} without copying a patch`,()=>{
 const f=fixture(angle),result=fit(f),gap=f.at(0,-39),skin=f.at(0,-26);
 assert.ok(result.warpedPixels>0);assert.equal(f.original[gap],31,'this position was original hair');assert.ok(result.pixels[gap]>150);assert.equal(result.pixels[gap+3],255);
 assert.ok(result.pixels[skin+1]>f.original[skin+1],'existing skin below the gap also follows the continuous deformation, rather than staying fixed below a pasted patch');
 // Horizontal forehead texture retains its coordinate, while the vertical
 // texture moves upward. All sampled material belongs to this same portrait.
 assert.ok(Math.abs(result.pixels[skin]-f.original[skin])<=1);
 for(const u of [-20,-10,0,10,20]){const k=f.at(u,-39);assert.ok(result.pixels[k]>150);assert.equal(result.pixels[k+3],255)}
});
test('forehead skin is never erased, including skin above the selected outer crown',()=>{
 const f=fixture(),j=f.at(0,-82);f.original.set([193,93,125,255],j);f.labels.data[j/4]=3;
 const result=fit(f);assert.deepEqual(result.pixels.slice(j,j+4),f.original.slice(j,j+4));
 for(let n=0;n<f.w*f.h;n++)if(f.labels.data[n]===3)assert.equal(result.pixels[n*4+3],f.original[n*4+3]);
});
test('the eyes and actual brows are locked even if detection calls them hair',()=>{
 const f=fixture(),points=[[-32,0],[32,0],[-30,-17],[30,-17],[0,30],[-44,15],[44,15]];
 for(const [u,v] of points){const j=f.at(u,v);f.original.set([255,0,255,255],j);f.labels.data[j/4]=1}
 const result=fit(f);assert.ok(result.warpedPixels>0);
 for(const [u,v] of points){const j=f.at(u,v);assert.deepEqual(result.pixels.slice(j,j+4),f.original.slice(j,j+4))}
 for(let j=0;j<result.pixels.length;j+=4)if(result.pixels[j]>150&&result.pixels[j+1]>0)assert.ok(result.pixels[j+2]<200,'no brow/eye marker enters the forehead warp');
});
test('a higher individual brow makes the identity boundary higher, instead of pushing the brow',()=>{
 const f=fixture(),p=f.world(-30,-28);f.face[70]={x:p.x/f.w,y:p.y/f.h};const j=f.at(-30,-28);f.original.set([20,8,12,255],j);f.labels.data[j/4]=1;
 const result=fit(f);assert.deepEqual(result.pixels.slice(j,j+4),f.original.slice(j,j+4));
 for(let y=74;y<f.h;y++)for(let x=0;x<f.w;x++){const k=(y*f.w+x)*4;assert.deepEqual(result.pixels.slice(k,k+4),f.original.slice(k,k+4))}
});
test('the inverse forehead deformation stays ordered and becomes identity before the brow',()=>{
 const f=fixture(),result=fit(f),values=[];for(let v=-39;v<=-22;v++)values.push(result.pixels[f.at(0,v)+1]);
 assert.ok(values.every((v,i)=>!i||v>=values[i-1]),'forehead texture does not fold or reverse');
 const j=f.at(0,-22);assert.ok(Math.abs(result.pixels[j+1]-f.original[j+1])<=1,'the displacement smoothly reaches zero above the brow');
});
test('skin from another horizontal area or image is never substituted',()=>{
 const f=fixture();for(let n=0;n<f.w*f.h;n++)if(f.labels.data[n]===3)f.original[n*4]=n%f.w;
 const result=fit(f);for(const u of [-15,0,15])for(const v of [-38,-30,-25]){const j=f.at(u,v);assert.equal(result.pixels[j],Math.round(f.world(u,v).x),'forehead skin stays on its original vertical flow line')}
});
test('the lower-face/neck result is preserved exactly and both PNG inputs remain immutable',()=>{
 const f=fixture(),lower=new Uint8ClampedArray(f.original),front=new Uint8ClampedArray(f.front);for(let y=120;y<f.h;y++)for(let x=0;x<f.w;x++)lower.set([7,11,13,100],(y*f.w+x)*4);
 const result=fitProcessedForehead(f.original,f.front,f.w,f.h,f.face,f.labels,lower);
 for(let y=120;y<f.h;y++)for(let x=0;x<f.w;x++){const j=(y*f.w+x)*4;assert.deepEqual(result.pixels.slice(j,j+4),lower.slice(j,j+4))}assert.deepEqual(f.front,front);
});
test('an earlier wrong forehead erasure is restored before using the original skin for the warp',()=>{
 const f=fixture(),lower=new Uint8ClampedArray(f.original);for(let v=-43;v<=-22;v++)for(let u=-25;u<=25;u++)lower[f.at(u,v)+3]=0;
 const result=fitProcessedForehead(f.original,f.front,f.w,f.h,f.face,f.labels,lower),j=f.at(0,-39);assert.equal(result.pixels[j+3],255);assert.ok(result.pixels[j]>150);
});
test('missing safe skin is reported without painting new skin or moving a facial feature',()=>{
 const f=fixture();for(let n=0;n<f.w*f.h;n++)if(f.labels.data[n]===3)f.labels.data[n]=1;
 const result=fit(f),j=f.at(0,-26);assert.equal(result.warpedPixels,0);assert.ok(result.unresolvedColumns>0);assert.deepEqual(result.pixels.slice(j,j+4),f.original.slice(j,j+4));
});
test('the selected front inner contour determines the amount of forehead movement',()=>{
 const f=fixture(),first=fit(f),lowerFront=new Uint8ClampedArray(f.front);for(let v=-44;v<=-38;v++)for(let u=-30;u<=30;u++)lowerFront.set([24,18,14,255],f.at(u,v));
 const second=fitProcessedForehead(f.original,lowerFront,f.w,f.h,f.face,f.labels),j=f.at(0,-37);
 assert.ok(first.pixels[j+1]>second.pixels[j+1],'higher front hairline requires a larger upward skin displacement');
});
test('invalid processed portrait inputs fail without changing the photo',()=>{
 const f=fixture(),before=new Uint8ClampedArray(f.original);
 assert.throws(()=>fitProcessedForehead(f.original,f.front,f.w,f.h,[],f.labels));
 assert.throws(()=>fitProcessedForehead(f.original,f.front,f.w,f.h,f.face,null));
 assert.throws(()=>fitProcessedForehead(f.original,new Uint8Array(4),f.w,f.h,f.face,f.labels));assert.deepEqual(f.original,before);
});

class Surface{
 constructor(w,h,data){this.width=w;this.height=h;this.data=data?new Uint8ClampedArray(data):new Uint8ClampedArray(w*h*4)}
 toDataURL(){return this}
 getContext(){const s=this;return {
  drawImage(src){for(let j=0;j<s.data.length;j+=4){const a=src.data[j+3]/255,b=s.data[j+3]/255*(1-a),next=a+b;if(!next)continue;for(let k=0;k<3;k++)s.data[j+k]=Math.round((src.data[j+k]*a+s.data[j+k]*b)/next);s.data[j+3]=Math.round(next*255)}},
  getImageData(){return {data:new Uint8ClampedArray(s.data)}},putImageData(image){s.data.set(image.data)}
 }}
}
test('all 23 live male finishers keep the PNG intact and never run forehead or ear/neck editing',async()=>{
 const {HAIRSTYLE_RULES}=await import('./hairstyle-rules.js'),source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8');
 const start=source.indexOf('async function finishStudioHairPreview('),end=source.indexOf('async function prepareStudioHairOverlay(',start);
 for(const id of Object.keys(HAIRSTYLE_RULES).filter(id=>id.startsWith('manhair-'))){
  const f=fixture(),head=new Surface(f.w,f.h,f.original),front=new Surface(f.w,f.h,f.front),expected=eraseProcessedUpperHair(f.original,f.front,f.w,f.h,f.face,f.labels);
  const context={studioHairLabels:async()=>f.labels,canvasFor:(w,h)=>new Surface(w,h),eraseProcessedUpperHair};
  for(const name of ['fitProcessedForehead','eraseDetachedUpperHair','eraseHeadExteriorExcess','featherLongCrown','shortHairInterior','pushLongHairRear'])context[name]=()=>{throw Error(`male finisher must not call ${name}`)};
  const run=vm.runInNewContext(source.slice(start,end)+'\nfinishStudioHairPreview',context),result=await run(head,front,null,f.face,id);
  assert.deepEqual(result.source.data,f.front,id);assert.equal(result.backSource,null);assert.deepEqual(result.cleanedHeadSource.data,expected,id);assert.deepEqual(head.data,f.original);
 }
});
test('the live long-hair path edits only the processed head using the FRONT contour, regardless of rear coverage',async()=>{
 const f=fixture(),head=new Surface(f.w,f.h,f.original),front=new Surface(f.w,f.h,f.front),back=new Surface(f.w,f.h,f.original),source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8');
 const start=source.indexOf('async function finishStudioHairPreview('),end=source.indexOf('async function prepareStudioHairOverlay(',start);let calls=0,frontSnapshot,backSnapshot;
 const context={Uint8ClampedArray,studioHairLabels:async()=>f.labels,isSingleLayerHair:()=>false,canvasFor:(w,h)=>new Surface(w,h),eraseDetachedUpperHair,eraseHeadExteriorExcess,featherLongCrown,
  shortHairInterior:()=>{throw Error('long hair cannot use short geometry')},
  fitProcessedForehead:(original,guide,...args)=>{calls++;assert.deepEqual([...original],[...f.original]);assert.deepEqual(guide,front.data);frontSnapshot=new Uint8ClampedArray(front.data);backSnapshot=new Uint8ClampedArray(back.data);return fitProcessedForehead(original,guide,...args)}
 };
 const run=vm.runInNewContext(source.slice(start,end)+'\nfinishStudioHairPreview',context),result=await run(head,front,back,f.face,'hair-01'),excess=f.at(0,-82),gap=f.at(0,-39);
 assert.equal(calls,1);assert.ok(backSnapshot[excess+3]>0,'the lower hair layer still covers this point, so combined coverage would wrongly protect old hair');
 assert.equal(result.cleanedHeadSource.data[excess+3],0);assert.ok(result.cleanedHeadSource.data[gap]>150);assert.equal(result.cleanedHeadSource.data[gap+3],255);
 assert.deepEqual(result.source.data,frontSnapshot);assert.deepEqual(result.backSource.data,backSnapshot);assert.deepEqual(head.data,f.original);
 for(const [u,v] of [[-32,0],[32,0],[-30,-17],[30,-17],[0,30]]){const j=f.at(u,v);assert.deepEqual(result.cleanedHeadSource.data.slice(j,j+4),f.original.slice(j,j+4))}
});

test('all 29 female styles retain their original-forehead warp without a skin-fill callback',async()=>{
 const {HAIRSTYLE_RULES}=await import('./hairstyle-rules.js'),{isSingleLayerHair}=await import('./src/short-female-hair.js');
 const source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8'),start=source.indexOf('async function finishStudioHairPreview('),end=source.indexOf('async function prepareStudioHairOverlay(',start);let calls=0;
 for(const id of Object.keys(HAIRSTYLE_RULES).filter(id=>id.startsWith('hair-'))){
  const f=fixture(),head=new Surface(f.w,f.h,f.original),front=new Surface(f.w,f.h,f.front),back=isSingleLayerHair(id)?null:new Surface(f.w,f.h,f.front);
  const context={Uint8ClampedArray,studioHairLabels:async()=>f.labels,isSingleLayerHair,canvasFor:(w,h)=>new Surface(w,h),eraseDetachedUpperHair,eraseHeadExteriorExcess,featherLongCrown,shortHairInterior,
   fitProcessedForehead:(original,...args)=>{calls++;assert.deepEqual(original,f.original);return fitProcessedForehead(original,...args)},
   extendShortHairSkin:()=>{throw Error('copying/pasting skin is forbidden for every hairstyle')}
  };
  const run=vm.runInNewContext(source.slice(start,end)+'\nfinishStudioHairPreview',context),result=await run(head,front,back,f.face,id),j=f.at(0,-39);
  assert.ok(result.cleanedHeadSource.data[j]>150,id);assert.equal(result.cleanedHeadSource.data[j+3],255,id);assert.equal(Boolean(result.backSource),!isSingleLayerHair(id),id);
  for(const [u,v] of [[-32,0],[32,0],[-30,-17],[30,-17]]){const k=f.at(u,v);assert.deepEqual(result.cleanedHeadSource.data.slice(k,k+4),f.original.slice(k,k+4),id)}
 }
 assert.equal(calls,29);
});

for(const angle of [-.3,0,.3])for(const category of [0,1])test(`original stray hair is erased through the complete top image edge, angle=${angle}, category=${category}`,()=>{
 const f=fixture(angle),points=[[2,0],[100,0],[197,0],[3,8],[196,8]];
 for(const [x,y] of points){const n=y*f.w+x;f.original.set([28,21,16,140],n*4);f.labels.data[n]=category}
 const original=new Uint8ClampedArray(f.original),front=new Uint8ClampedArray(f.front),out=fit(f).pixels;
 for(const [x,y] of points){const j=(y*f.w+x)*4;assert.equal(out[j+3],0,'isolated hair and dust are fully removed, including far columns');assert.deepEqual(out.slice(j,j+3),original.slice(j,j+3))}
 assert.deepEqual(f.original,original);assert.deepEqual(f.front,front);
});
test('a one-pixel old strand reaches the top border without surviving as a blurred dark halo',()=>{
 const f=fixture();for(let y=0;y<50;y++){const n=y*f.w+100;f.original.set([24,18,14,255],n*4);f.labels.data[n]=y<20?0:1}
 const out=fit(f).pixels;for(let y=0;y<24;y++)assert.equal(out[(y*f.w+100)*4+3],0);
 const edge=[25,26,27,28,29,30].map(y=>out[(y*f.w+100)*4+3]);assert.ok(edge.some(a=>a>0&&a<255));assert.ok(edge.every((a,i)=>!i||a>=edge[i-1]));
});
for(const category of [2,3,4,5])test(`wrong category ${category} cannot shield old hair at the top image border`,()=>{
 const f=fixture(),n=2;f.original.set([28,21,16,255],n*4);f.labels.data[n]=category;const out=fit(f).pixels;assert.equal(out[n*4+3],0);assert.deepEqual(out.slice(n*4,n*4+3),f.original.slice(n*4,n*4+3));
});
test('upper head pixels are erased by the outside geometry, without a colour threshold or repainting',()=>{
 const f=fixture();for(const [x,rgb] of [[2,[20,100,220]],[197,[240,230,220]]]){f.original.set([...rgb,255],x*4);f.labels.data[x]=0}
 const out=fit(f).pixels;for(const x of [2,197]){assert.equal(out[x*4+3],0);assert.deepEqual(out.slice(x*4,x*4+3),f.original.slice(x*4,x*4+3))}
});
for(const {angle,hash} of [{angle:-.3,hash:'653e3f6d8661d8264b75ca6183ac0dba109eca35f8f6003d7877fe8d3a5e0cc1'},{angle:0,hash:'51cd997f3587fbe01190c6a28ee8ca1370838a92350b5238fd938d033025e0f4'},{angle:.3,hash:'5d5164e19fdaad5476a558fd1757c69631aea09d3f6263bccaef5a4f9ec7cfee'}])test(`all forehead, face, ears, neck and lower pixels retain the previous result exactly at ${angle}`,()=>{
 const f=fixture(angle),out=fit(f).pixels,bytes=[];for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(f.local(x,y).v>=-49-Math.max(2,f.eye*.035)){const j=(y*f.w+x)*4;bytes.push(...out.subarray(j,j+4))}
 assert.equal(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),hash);
});

for(const angle of [-.3,0,.3])for(const category of [2,3,4,5])test(`a thick original hair cap above the PNG is cleared even with wrong label ${category}, angle=${angle}`,()=>{
 const f=fixture(angle),cap=[];
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const q=f.local(x,y);if(Math.abs(q.u)>44||q.v<-96+Math.abs(q.u)*.2||q.v>-86+Math.abs(q.u)*.2)continue;
  const n=y*f.w+x;f.original.set([25,19,15,255],n*4);f.labels.data[n]=category;cap.push(n);
 }
 assert.ok(cap.length>200,'reproduces a substantial cap, not just isolated dust');
 const before=new Uint8ClampedArray(f.original),front=new Uint8ClampedArray(f.front),out=fit(f).pixels;
 for(const n of cap){assert.equal(out[n*4+3],0);assert.deepEqual(out.slice(n*4,n*4+3),before.slice(n*4,n*4+3))}
 assert.deepEqual(f.original,before);assert.deepEqual(f.front,front);
});
for(const category of [0,3,5])test(`the live head cleanup removes the cap and reveals the unchanged background, category=${category}`,async()=>{
 const f=fixture(),cap=[];for(let y=6;y<=16;y++)for(let x=72;x<=128;x++){const n=y*f.w+x;f.original.set([25,19,15,255],n*4);f.labels.data[n]=category;cap.push(n)}
 const head=new Surface(f.w,f.h,f.original),front=new Surface(f.w,f.h,f.front),background=new Surface(f.w,f.h);
 for(let n=0;n<f.w*f.h;n++)background.data.set([17,115,225,255],n*4);const backgroundBefore=new Uint8ClampedArray(background.data);
 const source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8'),start=source.indexOf('async function finishStudioHairPreview('),end=source.indexOf('async function prepareStudioHairOverlay(',start);
 const context={Uint8ClampedArray,studioHairLabels:async()=>f.labels,isSingleLayerHair:()=>true,canvasFor:(w,h)=>new Surface(w,h),eraseDetachedUpperHair,eraseHeadExteriorExcess,featherLongCrown,shortHairInterior,fitProcessedForehead};
 const finish=vm.runInNewContext(source.slice(start,end)+'\nfinishStudioHairPreview',context),result=await finish(head,front,null,f.face,'hair-27'),composite=new Surface(f.w,f.h);
 composite.getContext().drawImage(background);composite.getContext().drawImage(result.cleanedHeadSource);composite.getContext().drawImage(result.source);
 for(const n of cap){assert.equal(result.cleanedHeadSource.data[n*4+3],0);assert.deepEqual(composite.data.slice(n*4,n*4+4),background.data.slice(n*4,n*4+4))}
 assert.deepEqual(background.data,backgroundBefore);assert.deepEqual(head.data,f.original);assert.deepEqual(result.source.data,f.front);
});

for(const rgb of [[180,180,180],[235,235,235],[245,165,50]])test(`geometry erases upper hair with colour ${rgb}, even when classified as skin`,()=>{
 const f=fixture(),j=f.at(0,-88);f.original.set([...rgb,255],j);f.labels.data[j/4]=3;const out=fit(f).pixels;assert.equal(out[j+3],0);assert.deepEqual(out.slice(j,j+3),new Uint8ClampedArray(rgb));
});
for(const factor of [.25,.5,1])test(`actual forehead skin stays intact while the false skin-labelled old cap is erased, complexion factor=${factor}`,()=>{
 const f=fixture();for(let n=0;n<f.w*f.h;n++)if(f.labels.data[n]===3)for(let k=0;k<3;k++)f.original[n*4+k]=Math.round(f.original[n*4+k]*factor);
 const skin=f.at(0,-82),cap=f.at(20,-88);f.original.set([Math.round(193*factor),Math.round(93*factor),Math.round(125*factor),255],skin);f.labels.data[skin/4]=3;f.original.set([25,19,15,255],cap);f.labels.data[cap/4]=3;
 const out=fit(f).pixels;assert.deepEqual(out.slice(skin,skin+4),f.original.slice(skin,skin+4));assert.equal(out[cap+3],0);
});
