import {MALE_SIDEBURN_ANCHORS} from './src/male-sideburn-anchors.js';
import {createMaleSideburnGuide,fitMaleSideburns} from './src/male-sideburn-fit.js';
import {pushLongHairRear} from './src/long-hair-two-layer-fit.js';
import {createHash} from 'node:crypto';
import {softHairEraser} from './src/soft-hair-eraser.js';
import {shortHairInterior} from './src/short-hair-skin-fill.js';
import {featherLongCrown,eraseLongUpperPortrait} from './src/long-upper-hair-eraser.js';
import {fitProcessedForehead,eraseProcessedUpperHair} from './src/processed-forehead-fit.js';
import {cleanTemplateForehead} from './src/hair-template-forehead-clean.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {hairPreviewTransform,createTwoLayerHairPreview,eraseHairTemplateSkin,syncHairAttachments,syncHairPairTransforms} from './src/hair-preview-fit.js';
import {eraseHeadExteriorExcess,eraseDetachedUpperHair} from './src/upper-hair-eraser.js';
import {isSingleLayerHair} from './src/short-female-hair.js';
import {HAIR_TEMPLATE_ANCHORS} from './src/hair-template-anchors.js';
import {HAIRSTYLE_RULES} from './hairstyle-rules.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('male picker contains only styles 20–26; archived new 01–10 are unavailable in both entrypoints',()=>{
 for(const file of ['src/main.jsx','main.jsx']){
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8'),start=source.indexOf('const MALE_HAIR_OPTIONS='),end=source.indexOf('const HAIR_OPTIONS=',start),options=vm.runInNewContext(source.slice(start,end)+'\nMALE_HAIR_OPTIONS');
  assert.deepEqual(Array.from(options,item=>item.id),Array.from({length:7},(_,i)=>'manhair-'+(i+23)));assert.ok(options.every(item=>!item.name.startsWith('ทรงใหม่')));
 }
 assert.equal(Object.keys(MALE_SIDEBURN_ANCHORS).length,7);
 for(const value of Object.values(MALE_SIDEBURN_ANCHORS))for(const side of value.sides){assert.equal(side.curve.length,5);assert.ok(side.curve.every((p,i)=>!i||p.inner[1]>side.curve[i-1].inner[1]))}
});
const apply=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
function portrait({w=400,h=500,cx=200,cy=220,width=140,height=200,eye=90,angle=0}={}){
 const face=[],c=Math.cos(angle),s=Math.sin(angle);
 const point=(x,y)=>({x:(cx+x*c-y*s)/w,y:(cy+x*s+y*c)/h});
 for(const [id,x,y] of [[33,-eye/2,0],[263,eye/2,0],[234,-width/2,0],[454,width/2,0],[10,0,-height*.4],[152,0,height*.6],[127,-width/2,-eye*.1],[356,width/2,-eye*.1]])face[id]=point(x,y);
 return {face,w,h,cx,cy,width,height,eye,angle};
}
const fit=(f,t)=>hairPreviewTransform(f.face,f.w,f.h,t.face,t.w,t.h);
const point=(f,id)=>({x:f.face[id].x*f.w,y:f.face[id].y*f.h});
const rigid=m=>{close(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));close(m.a*m.c+m.b*m.d,0);assert.ok(m.a*m.d-m.b*m.c>0)};
for(const scale of [.75,1,1.5])test(`uniform resize ${scale} follows the upper face and eye-axis rotation`,()=>{
 const f=portrait({angle:-.2}),t=portrait({w:600,h:800,cx:330,cy:350,width:f.width*scale,height:f.height*scale,eye:f.eye*scale,angle:.4}),m=fit(f,t);
 rigid(m);close(Math.hypot(m.a,m.b),scale);
 for(const id of [33,263,10,127,356]){const q=apply(m,point(f,id)),p=point(t,id);close(q.x,p.x);close(q.y,p.y)}
});
for(const [width,height] of [[98,240],[210,140],[110,280]])test(`different face proportions ${width}/${height} keep straight strands and equal axes`,()=>{
 const f=portrait({angle:.25}),t=portrait({cx:170,cy:200,width,height,angle:-.35}),m=fit(f,t);rigid(m);
 close(Math.atan2(m.b,m.a),t.angle-f.angle);
 const a={x:80,y:35},b={x:260,y:410},pa=apply(m,a),pb=apply(m,b);
 for(const fraction of [.1,.25,.5,.75,.9]){const p=apply(m,{x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction});close(p.x,pa.x+(pb.x-pa.x)*fraction);close(p.y,pa.y+(pb.y-pa.y)*fraction)}
});
test('a higher forehead changes placement even when eye spacing and face width stay equal',()=>{
 const f=portrait(),t=portrait();t.face[10]={...t.face[10],y:t.face[10].y-.08};
 const m=fit(f,t),old=apply(fit(f,f),point(f,10)),placed=apply(m,point(f,10)),target=point(t,10);
 assert.ok(Math.hypot(placed.x-target.x,placed.y-target.y)<Math.hypot(old.x-target.x,old.y-target.y)*.5);rigid(m);
 assert.notDeepEqual(m,fit(f,f));
});
test('asymmetric temples change the shared position without tilting or squeezing either side',()=>{
 const f=portrait(),t=portrait();for(const id of [127,356])t.face[id]={...t.face[id],x:t.face[id].x+.03};
 const m=fit(f,t);assert.ok(apply(m,{x:f.cx,y:f.cy}).x>t.cx);rigid(m);close(m.b,0);close(m.c,0);
});
test('missing or unreliable upper-face anchors fail instead of placing a deformed hairstyle',()=>{
 const f=portrait(),t=portrait();delete t.face[10];assert.throws(()=>fit(f,t));
 const missing=portrait();delete missing.face[127];assert.throws(()=>fit(f,missing));
 const bad=portrait();bad.face[356]={x:.9,y:.9};assert.throws(()=>fit(f,bad));
 const collapsed=portrait();collapsed.face[152]=collapsed.face[10];assert.throws(()=>fit(f,collapsed));
});
test('fitting never rewrites the person or reference landmarks',()=>{
 const f=portrait(),t=portrait({width:180,height:230}),before=JSON.stringify([f.face,t.face]);fit(f,t);assert.equal(JSON.stringify([f.face,t.face]),before);
});
test('all 59 native calibrations preserve scale, handedness and orthogonal axes',()=>{
 assert.equal(Object.keys(HAIR_TEMPLATE_ANCHORS).length,59);
 for(const calibration of Object.values(HAIR_TEMPLATE_ANCHORS)){const [a,b,c,d]=calibration.sourceToReference;rigid({a,b,c,d})}
});

// CPU raster fixture: applies affine coordinates and alpha compositing. These
// contracts exercise pixels and the real picker code, not browser/ML quality.
const encoded=new Map();let surfaceId=0;
class Surface{
 constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);this.transforms=[];this.matrix=[1,0,0,1,0,0]}
 get naturalWidth(){return this.width}get naturalHeight(){return this.height}
 toDataURL(){const url=`data:image/png;fixture-${++surfaceId}`;encoded.set(url,this);return url}
 getContext(){const surface=this;return {
  setTransform(...matrix){surface.transforms.push(matrix);surface.matrix=matrix},
  drawImage(source){
   const [a,b,c,d,e,f]=surface.matrix,det=a*d-b*c;
   for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++){
    const dx=x+.5-e,dy=y+.5-f,sx=Math.floor((d*dx-c*dy)/det),sy=Math.floor((-b*dx+a*dy)/det);
    if(sx<0||sy<0||sx>=source.width||sy>=source.height)continue;
    const i=(sy*source.width+sx)*4,j=(y*surface.width+x)*4,alpha=source.data[i+3]/255;
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
const canvas=(w,h)=>new Surface(w,h);
const opaque=(w,h)=>{const c=canvas(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)c.data.set([x%255,y%255,77,255],(y*w+x)*4);return c};
function curvedSkin(w,h){
 const skin=canvas(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(((x-w*.5)/(w*.20))**2+((y-h*.54)/(h*.29))**2<1||y>h*.66&&y<h*.91&&Math.abs(x-w*.5)<w*.10)skin.data.set([255,255,255,255],(y*w+x)*4);
 return skin;
}
for(const angle of [-.4,0,.4])for(const singleLayer of [false,true])test(`curved ear/neck erasure angle ${angle}, single=${singleLayer} cannot cut exterior hair or warp rear pixels`,()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28,angle}),placed=opaque(w,h),skin=curvedSkin(w,h),original=new Uint8ClampedArray(placed.data),originalSkin=new Uint8ClampedArray(skin.data);
 const layers=createTwoLayerHairPreview(placed,skin,f.face,w,h,canvas,{singleLayer});
 assert.equal(Boolean(layers.back),!singleLayer);if(layers.back)assert.deepEqual(layers.back.data,original,'the full rear PNG retains its coordinates, RGB and original alpha');
 let erased=0,soft=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;assert.deepEqual(layers.front.data.slice(j,j+3),original.slice(j,j+3));
  const farFromSkin=!skin.data[j+3]&&[[-7,0],[7,0],[0,-7],[0,7],[-7,-7],[-7,7],[7,-7],[7,7]].every(([dx,dy])=>{const xx=x+dx,yy=y+dy;return xx<0||xx>=w||yy<0||yy>=h||!skin.data[(yy*w+xx)*4+3]});
  if((singleLayer?farFromSkin:!skin.data[j+3])||y<15)assert.deepEqual(layers.front.data.slice(j,j+4),original.slice(j,j+4),'no outside expansion, horizontal cut or crown erasure');
  if(layers.front.data[j+3]<255)erased++;if(layers.front.data[j+3]>0&&layers.front.data[j+3]<255)soft++;
 }
 assert.ok(erased>0&&soft>0);assert.deepEqual(placed.data,original);assert.deepEqual(skin.data,originalSkin);
 // Where front hair is removed, opaque portrait skin covers the exact hole.
 const composite=canvas(w,h);if(layers.back)composite.getContext().drawImage(layers.back);composite.getContext().drawImage(skin);composite.getContext().drawImage(layers.front);
 for(let n=0;n<w*h;n++)if(!singleLayer||skin.data[n*4+3]||layers.front.data[n*4+3]===255)assert.equal(composite.data[n*4+3],255,'no cut through visible skin or through exterior hair beyond the feather');
});
test('two full PNG layers overlap with the original rear alpha',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),placed=opaque(w,h),skin=curvedSkin(w,h);
 for(let n=0;n<w*h;n++)placed.data[n*4+3]=40+n%216;
 const {front,back}=createTwoLayerHairPreview(placed,skin,f.face,w,h,canvas),combined=canvas(w,h);
 combined.getContext().drawImage(back);combined.getContext().drawImage(front);
 assert.deepEqual(back.data,placed.data,'the rear remains a full copy, including translucent strands');
 for(let n=0;n<w*h;n++){const j=n*4,expected=Math.round(front.data[j+3]+back.data[j+3]*(1-front.data[j+3]/255));assert.equal(combined.data[j+3],expected,'front and rear alpha stack without complementary splitting')}
 assert.ok(combined.data[3]>placed.data[3],'both copies overlap outside the portrait as before');
});
test('bangs over the forehead and eyebrows are retained, while lower face and neck are exposed',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),placed=opaque(w,h),skin=curvedSkin(w,h),{front}=createTwoLayerHairPreview(placed,skin,f.face,w,h,canvas);
 for(const y of [20,25,30,35,40])assert.equal(front.data[(y*w+48)*4+3],255);
 for(const y of [60,70,80])assert.equal(front.data[(y*w+48)*4+3],0);
});
test('template skin is erased in calibrated coordinates without moving native hair or recoloring it',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),original=opaque(w,h),skin=curvedSkin(w,h),before=new Uint8ClampedArray(original.data);
 const out=eraseHairTemplateSkin(original.data,w,h,skin,f.face,w,h,[1,0,0,1,0,0]);let removed=0;
 for(let j=0;j<out.length;j+=4){assert.deepEqual(out.slice(j,j+3),before.slice(j,j+3));if(!skin.data[j+3])assert.equal(out[j+3],before[j+3]);if(out[j+3]<before[j+3])removed++}
 assert.ok(removed>0);assert.deepEqual(original.data,before);
 // A translated calibration follows reference skin, not native pixel bounds.
 const shifted=eraseHairTemplateSkin(original.data,w,h,skin,f.face,w,h,[1,0,0,1,5,0]);
 assert.equal(shifted[(60*w+43)*4+3],out[(60*w+48)*4+3]);
});
test('invalid or anisotropic template calibration is rejected',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),c=opaque(w,h),skin=curvedSkin(w,h);
 for(const matrix of [[1,0,0,2,0,0],[-1,0,0,1,0,0],[1,0,0,1,NaN,0]])assert.throws(()=>eraseHairTemplateSkin(c.data,w,h,skin,f.face,w,h,matrix));
});
function pickerFixture({angle=0,source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8')}={}){
 const start=source.indexOf('const fittedHairReferenceCache=new Map();'),end=source.indexOf('// Processing and Studio use the same',start);
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28,angle}),target=opaque(w,h),surfaces=[],options=[];let closed=0,cleaned=0;
 const context={Uint8Array,HTMLImageElement:class{},MALE_SIDEBURN_ANCHORS,HAIRSTYLE_RULES,HAIR_TEMPLATE_ANCHORS,isSingleLayerHair,hairPreviewTransform,eraseHeadExteriorExcess,eraseDetachedUpperHair,shortHairInterior,featherLongCrown,eraseLongUpperPortrait,fitProcessedForehead,eraseProcessedUpperHair,createMaleSideburnGuide,fitMaleSideburns,cleanTemplateForehead,pushLongHairRear,
  getLandmarker:async()=>({detect:()=>({faceLandmarks:[f.face]})}),
  getPersonSegmenter:async()=>({segment:(image,callback)=>callback({categoryMask:{width:w,height:h,getAsUint8Array:()=>new Uint8Array(w*h).fill(1),close:()=>closed++}})}),
  semanticClassMask:async(image,w,h)=>curvedSkin(w,h),
  opaqueBounds:c=>c.data.some((v,i)=>i%4===3&&v>20)?{x:0,y:0,w:c.width,h:c.height}:null,
  canvasFor:(w,h)=>{const c=canvas(w,h);surfaces.push(c);return c},
  eraseHairTemplateSkin:(...args)=>{cleaned++;return eraseHairTemplateSkin(...args)},
  createTwoLayerHairPreview:(...args)=>{options.push(args[6]);return createTwoLayerHairPreview(...args)},
  loadImage:async url=>{
   if(encoded.has(url))return encoded.get(url);
   const id=url.match(/([^/]+)\.png$/)[1].replace(/-back$/,''),calibration=HAIR_TEMPLATE_ANCHORS[id],size=url.includes('/hair/')?calibration.sourceSize:calibration.referenceSize;
   return opaque(...size);
  }
 };
 const pipeline=vm.runInNewContext(source.slice(start,end)+'\n({prepareStudioHairOverlay,cache:fittedHairReferenceCache})',context);
 return {pipeline,context,f,target,surfaces,options,closed:()=>closed,cleaned:()=>cleaned};
}
for(const [angle,expected] of [[-.3,'257d2b425ce9603e6e6d62223a0e06723846dc68b24c2a4aa98f20472d10538e'],[0,'d8e8a8a51ac2f7288fc6df946867dcbb5b929e2d10e5dc6c4bd8684946161af0'],[.3,'e7196c46d7fd91cdf91f67e6fab56c0718e0cb1cf38b5df275332119d04207fe']])test(`all 29 female raster outputs match the pre-male-change baseline at ${angle}`,async()=>{
 const f=pickerFixture({angle}),hash=createHash('sha256');
 for(const id of Object.keys(HAIRSTYLE_RULES).filter(id=>id.startsWith('hair-')&&id!=='hair-30')){
  f.pipeline.cache.set(id,{cutout:f.target,face:f.f.face,w:f.f.w,h:f.f.h,calibration:{...HAIR_TEMPLATE_ANCHORS[id],sourceToReference:[1,0,0,1,0,0]},hairGuide:f.target});
  const result=await f.pipeline.prepareStudioHairOverlay(f.target,id);
  for(const key of ['source','backSource','cleanedHeadSource'])if(result[key])hash.update(encoded.get(result[key]).data);
 }
 assert.equal(hash.digest('hex'),expected,'front, rear and processed head remain byte-for-byte identical');
});
test('every male style preserves fine strands, detached pixels, skin remnants and ear edges after rigid placement',async()=>{
 const f=pickerFixture(),png=canvas(f.f.w,f.f.h);
 for(const [x,y,rgba] of [[48,12,[24,18,14,255]],[48,32,[21,17,12,255]],[46,6,[10,9,7,32]],[20,40,[18,15,13,128]],[76,40,[20,16,14,255]],[47,51,[199,143,128,255]],[51,75,[194,140,126,223]]])png.data.set(rgba,(y*png.width+x)*4);
 const before=new Uint8ClampedArray(png.data);
 for(const name of ['semanticClassMask','eraseHairTemplateSkin','cleanTemplateForehead','eraseDetachedUpperHair','eraseHeadExteriorExcess','shortHairInterior','featherLongCrown','fitProcessedForehead','createTwoLayerHairPreview','pushLongHairRear'])f.context[name]=()=>{throw Error(`male placement must not enter ${name}`)};
 for(const id of Object.keys(HAIRSTYLE_RULES).filter(id=>id.startsWith('manhair-'))){
  f.pipeline.cache.set(id,{cutout:png,face:f.f.face,w:f.f.w,h:f.f.h,calibration:{...HAIR_TEMPLATE_ANCHORS[id],sourceToReference:[1,0,0,1,0,0]},hairGuide:null});
  const result=await f.pipeline.prepareStudioHairOverlay(f.target,id);
  assert.equal(result.backSource,null);assert.deepEqual(encoded.get(result.source).data,before,id);
 }
 assert.deepEqual(png.data,before);assert.equal(f.cleaned(),0);assert.equal(f.options.length,0);
});
test('all 59 styles share rigid placement; authored pairs bypass contour cleanup',async()=>{
 const f=pickerFixture(),ids=Object.keys(HAIRSTYLE_RULES);assert.equal(ids.length,59);
 for(const id of ids){
  // Shared raster fixture checks style routing; native asset geometry is
  // covered separately by the calibration and uncached loading tests.
  f.pipeline.cache.set(id,{cutout:f.target,face:f.f.face,w:f.f.w,h:f.f.h,calibration:{...HAIR_TEMPLATE_ANCHORS[id],sourceToReference:[1,0,0,1,0,0]},hairGuide:f.target,...(id==='hair-30'?{backCutout:f.target}:{})});
  const before=f.surfaces.length,result=await f.pipeline.prepareStudioHairOverlay(f.target,id),created=f.surfaces.slice(before),transformed=created.filter(c=>c.transforms.length);
  assert.equal(transformed.length,id.startsWith('manhair-')?1:2);assert.equal(transformed[0].transforms.length,2);
  if(transformed[1])for(let row=0;row<2;row++)for(let k=0;k<6;k++)close(transformed[1].transforms[row][k],transformed[0].transforms[row][k]);
  const [a,b,c,d]=transformed[0].transforms[0];rigid({a,b,c,d});
  assert.deepEqual(Object.keys(result).filter(k=>!['hairGapWarning','maleSideburnWarning','maleSideburnReport'].includes(k)).sort(),['backSource','cleanedHeadSource','source']);assert.equal(Boolean(result.backSource),!isSingleLayerHair(id));
 }
 assert.equal(f.closed(),59);assert.equal(f.options.length,29);
 assert.ok(f.options.every(option=>Object.keys(option).join(',')===(option.singleLayer?'singleLayer,rearHairGuide':'singleLayer,rearHairGuide,portrait,longContour')),'only long upper erasure receives the actual portrait silhouette');
});
for(const id of ['hair-01','hair-18','manhair-01','manhair-13','manhair-22','manhair-23','manhair-24','manhair-29'])test(`uncached ${id} ${id.startsWith('manhair-')?'keeps every native PNG pixel':'cleans foreign forehead skin without painting or recolouring'}`,async()=>{
 const f=pickerFixture(),result=await f.pipeline.prepareStudioHairOverlay(f.target,id);assert.ok(result.source&&result.cleanedHeadSource);const expectedCleaned=!id.startsWith('manhair-')&&isSingleLayerHair(id)?1:0;assert.equal(f.cleaned(),expectedCleaned);
 const ref=await f.pipeline.cache.get(id);assert.equal(ref.cutout.width,HAIR_TEMPLATE_ANCHORS[id].sourceSize[0]);assert.equal(ref.cutout.height,HAIR_TEMPLATE_ANCHORS[id].sourceSize[1]);
 const first=f.surfaces.find(c=>c.transforms.length&&c.width===f.f.w&&c.height===f.f.h).transforms[0];rigid({a:first[0],b:first[1],c:first[2],d:first[3]});
 await f.pipeline.prepareStudioHairOverlay(f.target,id);assert.equal(f.cleaned(),expectedCleaned,'the broad single-layer cleanup runs once; the forehead material check is shared');
 const original=opaque(ref.cutout.width,ref.cutout.height);
 if(id.startsWith('manhair-'))assert.deepEqual(ref.cutout.data,original.data,'male PNG alpha and RGB are exact, including template skin');
 for(let j=0;j<original.data.length;j+=4){assert.deepEqual(ref.cutout.data.slice(j,j+3),original.data.slice(j,j+3),'no foreign skin or new RGB is painted into the native template');assert.ok(ref.cutout.data[j+3]<=original.data[j+3])}
});
test('processing composes the same fitted rear, portrait and front in order',async()=>{
 const source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8'),start=source.indexOf('async function localHairstyleOnCleanMaster'),end=source.indexOf('async function makeCleanHeadMaster',start);
 const w=10,h=10,head=canvas(w,h),front=canvas(w,h),back=opaque(w,h);head.data.set([200,120,110,255],(5*w+5)*4);front.data.set([20,10,5,255],(2*w+5)*4);
 let called=0,revoked=0;
 const render=vm.runInNewContext(source.slice(start,end)+'\nlocalHairstyleOnCleanMaster',{URL:{createObjectURL:()=>head.toDataURL(),revokeObjectURL:()=>revoked++},loadImage:async url=>encoded.get(url),prepareStudioHairOverlay:async()=>{called++;return {cleanedHeadSource:head.toDataURL(),source:front.toDataURL(),backSource:back.toDataURL()}},canvasFor:canvas,canvasPng:async c=>c});
 const output=await render({},'hair-01');assert.equal(called,1);assert.equal(revoked,1);assert.deepEqual(output.data.slice((5*w+5)*4,(5*w+5)*4+4),new Uint8ClampedArray([200,120,110,255]));assert.deepEqual(output.data.slice((2*w+5)*4,(2*w+5)*4+4),new Uint8ClampedArray([20,10,5,255]));
});
function attached(){const pose={x:12,y:-7,scale:1.2,rotation:8},head={id:'head',...pose};return [head,...['front','back'].map(id=>({id,...pose,hairHeadId:'head',hairHeadPose:{...pose},hairId:'hair-01',hairLinked:true}))]}
test('manual whole-hair transforms keep both layers coincident without changing the face',()=>{
 const layers=attached(),head={...layers[0]},next=syncHairAttachments(syncHairPairTransforms(layers,new Map([['front',{x:20,y:30,scale:1.5,rotation:12}]])));
 assert.deepEqual(next[0],head);for(const key of ['x','y','scale','rotation'])assert.equal(next[1][key],next[2][key]);
});
test('moving, scaling and rotating the head carries both hair layers with it',()=>{
 const layers=attached(),next=syncHairAttachments(syncHairPairTransforms(layers,new Map([['head',{x:40,y:50,scale:1.8,rotation:-15}]])));
 for(const layer of next.slice(1))for(const key of ['x','y','scale','rotation'])close(layer[key],next[0][key]);
});

function studioFixture({version=46,offset=80,missingBack=false,locked=false,hairId='hair-01',gapWarning=false,sideburnWarning=false}={}){
 const pose={x:12,y:-7,scale:1.2,rotation:8},head={id:'head',kind:'head',source:'old-cleaned-head',hairOriginalSource:'untouched-head',sourceFrame:{x:100,y:120,w:600,h:850},locked,...pose};
 const hair=role=>({id:role,kind:'hair-preview',hairHeadId:head.id,hairId,hairRole:role,hairPreviewVersion:version,hairLinked:true,...pose,x:pose.x+offset});
 const layers=[{id:'background',kind:'background',source:'blue'},...(!missingBack&&!isSingleLayerHair(hairId)?[hair('back')]:[]),head,hair('front'),{id:'suit',kind:'suit',source:'uniform'}];
 const source=fs.readFileSync(new URL('./src/studio-editor.jsx',import.meta.url),'utf8'),start=source.indexOf(' const applyHair=async id=>'),end=source.indexOf(' const commitMakeupSource=',start);
 const context={processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,flushTransforms:()=>{},state:{current:layers},layerKind:l=>l.kind,isSingleLayerHair,
  mounted:{current:true},hairUiFrame:async()=>{},historySnapshot:()=>layers.map(l=>({...l})),assets:{current:new Map([[head.id,{original:opaque(10,10)}]])},
  headPose:l=>Object.fromEntries(['x','y','scale','rotation'].map(k=>[k,l[k]])),surfaceURL:x=>x,
  undo:{current:[]},redo:{current:[]},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},selectedRef:{current:'front'},brushSession:{current:null},drawNow:()=>{},touch:false,
  hydrate:async(next,unchanged)=>{context.state.current=next;context.unchanged=unchanged;return true},fresh:l=>({...l,id:`new-${l.hairRole}`}),
  onPrepareHairOverlay:async(source,id)=>{context.calls++;assert.equal(source,'untouched-head');assert.equal(id,hairId);return {source:'new-front',backSource:isSingleLayerHair(hairId)?null:'new-back',cleanedHeadSource:'new-head',hairGapWarning:gapWarning,...(sideburnWarning?{maleSideburnWarning:true,maleSideburnReport:{adjusted:false,unavailable:true}}:{})}},calls:0,
  setStatus:s=>{context.status=s}
 };
 for(const key of ['setSelected','setAssetBusy','setHairPlacementProgress','setSelectedHair','setHairConfirmed','setHairNotice','setRevision','setTool','setComparing'])context[key]=()=>{};
 context.setSelected=id=>{context.selection=id};
 const run=vm.runInNewContext(source.slice(start,end)+'\napplyHair',context);
 return {run,context,layers};
}
for(const options of [{version:46,offset:0},{version:47,offset:80},{version:47,offset:0,missingBack:true}])test(`Studio rebuilds old, shifted or incomplete hair ${JSON.stringify(options)} from the untouched head`,async()=>{
 const f=studioFixture(options);await f.run('hair-01');assert.equal(f.context.calls,1,f.context.status);
 const next=f.context.state.current;assert.deepEqual(Array.from(next,l=>l.id),['background','new-back','head','new-front','suit']);
 for(const role of ['front','back']){const hair=next.find(l=>l.hairRole===role);assert.equal(hair.hairPreviewVersion,57);assert.equal(hair.hairLinked,true);for(const key of ['x','y','scale','rotation'])assert.equal(hair[key],next[2][key])}
 assert.equal(next[2].source,'new-head');assert.equal(next[2].hairOriginalSource,'untouched-head');
 for(const id of ['background','suit'])assert.deepEqual(next.find(l=>l.id===id),f.layers.find(l=>l.id===id));
 assert.equal(f.context.undo.current.length,1);assert.equal(f.context.processRequestRef.current,false);
});
test('an aligned current hair pair remains selected, and a locked head remains untouched',async()=>{
 for(const options of [{version:57,offset:0},{locked:true}]){const f=studioFixture(options);await f.run('hair-01');assert.equal(f.context.calls,0);assert.equal(f.context.state.current,f.layers)}
});

test('current long hair with a missing rear role or wrong stack is rebuilt around the original middle portrait',async()=>{
 for(const invalid of ['duplicate-front','rear-above-head']){const f=studioFixture({version:57,offset:0});if(invalid==='duplicate-front')f.layers.find(l=>l.hairRole==='back').hairRole='front';else{const index=f.layers.findIndex(l=>l.hairRole==='back'),[rear]=f.layers.splice(index,1);f.layers.push(rear)}await f.run('hair-01');assert.equal(f.context.calls,1);const next=f.context.state.current,back=next.findIndex(l=>l.hairRole==='back'),head=next.findIndex(l=>l.id==='head'),front=next.findIndex(l=>l.hairRole==='front');assert.ok(back<head&&head<front);assert.equal(next[head].source,'new-head')}
});

function rearGapFixture(angle=0,{missingEarRows=false}={}){
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28,angle}),placed=canvas(w,h),skin=canvas(w,h),guide=canvas(w,h),c=Math.cos(angle),s=Math.sin(angle);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x-48)*c+(y-40)*s,v=-(x-48)*s+(y-40)*c,j=(y*w+x)*4;
  const crown=Math.abs(u)<=34&&v>=-28&&v<=-10;
  const side=Math.abs(u)>=24&&Math.abs(u)<=38&&v>-10&&v<=55&&!(missingEarRows&&u<0&&v>=0&&v<=4);
  if(crown||side){placed.data.set([x,y,77,255],j);guide.data.set([255,255,255,255],j)}
  if(Math.abs(u)<=18&&v>=-10&&v<=44)skin.data.set([255,255,255,255],j);
 }
 return {w,h,f,placed,skin,guide};
}
for(const angle of [-.3,0,.3])test(`rear gap filling follows the face axis ${angle} and preserves all existing hair pixels`,()=>{
 const f=rearGapFixture(angle),original=new Uint8ClampedArray(f.placed.data),baseline=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas),result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide});
 assert.equal(result.gapAdjusted,true);assert.deepEqual(result.front.data,baseline.front.data,'the front is never shifted or stretched');let added=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const j=(y*f.w+x)*4,u=(x-48)*Math.cos(angle)+(y-40)*Math.sin(angle),v=-(x-48)*Math.sin(angle)+(y-40)*Math.cos(angle);
  if(original[j+3]||v<-5.6||Math.abs(u)>40)assert.deepEqual(result.back.data.slice(j,j+4),original.slice(j,j+4),'crown, outside outline and original strands stay exact');
  if(!original[j+3]&&result.back.data[j+3]){added++;const sourceV=-(result.back.data[j]-48)*Math.sin(angle)+(result.back.data[j+1]-40)*Math.cos(angle);assert.ok(Math.abs(sourceV-v)<2,'ordinary gap fill keeps the vertical face-axis coordinate')}
 }
 assert.ok(added>0);assert.deepEqual(f.placed.data,original);
 if(angle===0){for(const x of [27,69]){const j=(60*f.w+x)*4;assert.equal(result.back.data[j+3],255);assert.ok(x<48?result.back.data[j]<x:result.back.data[j]>x,'each side moves inward independently')}}
});
test('an empty ear row borrows only nearby rear hair, leaving the front and crown intact',()=>{
 const f=rearGapFixture(0,{missingEarRows:true}),baseline=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas),result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide}),j=(42*f.w+27)*4;
 assert.equal(result.gapAdjusted,true);assert.ok(result.back.data[j+3]>200,'the open ear row is filled');assert.ok(Math.abs(result.back.data[j+1]-42)<=f.f.eye*.28+1);
 assert.deepEqual(result.front.data,baseline.front.data);assert.deepEqual(result.back.data.slice(0,28*f.w*4),f.placed.data.slice(0,28*f.w*4));
});
test('template skin cannot become a hair donor and single-layer styles never gain a rear copy',()=>{
 const f=rearGapFixture(),empty=canvas(f.w,f.h),noDonor=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:empty});
 assert.equal(noDonor.gapAdjusted,false);assert.deepEqual(noDonor.back.data,f.placed.data);
 const single=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{singleLayer:true,rearHairGuide:f.guide});assert.equal(single.back,null);assert.equal(single.gapAdjusted,false);
});

const upperScopeBaselines=[
  {
    "angle": -0.3,
    "missingEarRows": false,
    "short": "27155d5bbff7829eb5d6050a361d2de54c17a0c7609187a4b053a5629b0cb663",
    "lowerFront": "7d2aa2fadf9c3a4ea598ec6e57ea619e377c682b21dd051a59e29d311ed21a9c",
    "back": "d2f2802adb49b9b064246c816f8cce343b9dfee68106155eec7f78984445a8aa"
  },
  {
    "angle": -0.3,
    "missingEarRows": true,
    "short": "3a25c08ca0be77a1ff5cb8a8c7766cf93fa9048814404bb0750c350e0331ee1b",
    "lowerFront": "7d2aa2fadf9c3a4ea598ec6e57ea619e377c682b21dd051a59e29d311ed21a9c",
    "back": "718eb64a81fac6eff75b17531d8b948266de97c30431dfa3010341d1214960a1"
  },
  {
    "angle": 0,
    "missingEarRows": false,
    "short": "ca6bb0be9cf07221e7f968cf4236968a9091f8809a00832f4ecc88400ef7681d",
    "lowerFront": "38ba68c9157289b8f36b3451bdc257d9dc29d4f64f0dd8bbc23113c98e1e9569",
    "back": "0d82c261c2e38256436880f258bbcebc2f9734071888e8edaf5c7abf0a3eae95"
  },
  {
    "angle": 0,
    "missingEarRows": true,
    "short": "449f67399a5b3b3affd730f18a4ae93c7f063b2b9e8232025c746ae6ce55a0da",
    "lowerFront": "38ba68c9157289b8f36b3451bdc257d9dc29d4f64f0dd8bbc23113c98e1e9569",
    "back": "9d61ba246192c1e5883093341299d4ecd139087c92e5ad9281fb3b61eb5bb73a"
  },
  {
    "angle": 0.3,
    "missingEarRows": false,
    "short": "840d932494eb235fefcd01caf7c118e4f94dcc9615361642a5064f3d5afe9114",
    "lowerFront": "88d886995cf3365dc5ab26fc48cba79eefcdd084cdfe65ddf7193b4d37e117b5",
    "back": "3b437682c53ea7bb8c17c4331a7c8cd631ac9254c64b7e5170eca812b6364ced"
  },
  {
    "angle": 0.3,
    "missingEarRows": true,
    "short": "c5376ebee76fe54a48837c3b4a6652f54c3e1ceb751f6c823dc02e322452fbee",
    "lowerFront": "88d886995cf3365dc5ab26fc48cba79eefcdd084cdfe65ddf7193b4d37e117b5",
    "back": "92cc85ce1cb467248933fc5bea0b7f7cf5792ecafb1b9958a30e7e658dbfc2e8"
  }
];
for(const baseline of upperScopeBaselines)test(`long upper erasure preserves short output, lower front and the rear at ${baseline.angle}, missing ear=${baseline.missingEarRows}`,()=>{
 const f=rearGapFixture(baseline.angle,{missingEarRows:baseline.missingEarRows}),long=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide}),short=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{singleLayer:true,rearHairGuide:f.guide});
 const lower=[];for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(-(x-48)*Math.sin(baseline.angle)+(y-40)*Math.cos(baseline.angle)>f.f.eye*.22)lower.push(...long.front.data.slice((y*f.w+x)*4,(y*f.w+x)*4+4));
 assert.equal(createHash('sha256').update(short.front.data).digest('hex'),baseline.short);
 assert.equal(createHash('sha256').update(new Uint8Array(lower)).digest('hex'),baseline.lowerFront);
 assert.equal(createHash('sha256').update(long.back.data).digest('hex'),baseline.back);
});
test('short hair leaves inner joins to the skin fill and retains native PNG texture',()=>{
 const f=rearGapFixture(),original=new Uint8ClampedArray(f.placed.data),result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{singleLayer:true,rearHairGuide:f.guide});
 assert.equal(result.back,null);assert.equal(result.gapAdjusted,false);
 for(const x of [27,69])assert.equal(result.front.data[(60*f.w+x)*4+3],0,'the only hair PNG does not copy hair into an inner join');
 for(let j=0;j<original.length;j+=4)if(original[j+3])assert.deepEqual(result.front.data.slice(j,j+3),original.slice(j,j+3),'existing strands are neither blurred nor resampled');
 assert.deepEqual(f.placed.data,original);
});
test('short skin joins fade continuously across a stepped detection boundary',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),placed=opaque(w,h),skin=canvas(w,h);
 for(let y=30;y<90;y++)for(let x=30+Math.floor(y/5)%2*3;x<66;x++)skin.data.set([255,255,255,255],(y*w+x)*4);
 const result=createTwoLayerHairPreview(placed,skin,f.face,w,h,canvas,{singleLayer:true});let maximumJump=0,faded=0;
 for(let x=20;x<44;x++){const a=result.front.data[(60*w+x)*4+3],b=result.front.data[(60*w+x+1)*4+3];maximumJump=Math.max(maximumJump,Math.abs(a-b));if(a>0&&a<255)faded++}
 assert.ok(maximumJump<80,`abrupt alpha jump: ${maximumJump}`);assert.ok(faded>=6,'the eraser grades opacity rather than clipping a binary detection edge');
 assert.equal(result.front.data[(15*w+48)*4+3],255,'the crown remains opaque');assert.equal(result.back,null);
});
test('short template cleanup feathers the deletion edge without recoloring the PNG',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),placed=opaque(w,h),skin=canvas(w,h);
 for(let y=30;y<90;y++)for(let x=30;x<66;x++)skin.data.set([255,255,255,255],(y*w+x)*4);
 const out=eraseHairTemplateSkin(placed.data,w,h,skin,f.face,w,h,[1,0,0,1,0,0],{softEdges:true});
 for(let x=20;x<44;x++)assert.ok(Math.abs(out[(60*w+x)*4+3]-out[(60*w+x+1)*4+3])<80);
 for(let j=0;j<out.length;j+=4)assert.deepEqual(out.slice(j,j+3),placed.data.slice(j,j+3));
 assert.equal(out[(60*w+48)*4+3],0);assert.equal(out[(15*w+48)*4+3],255);
});
test('the soft eraser only grades its local deletion field and keeps original colors and partial alpha',()=>{
 const w=30,h=12,pixels=opaque(w,h).data,strength=new Float32Array(w*h),limit=new Float32Array(w*h).fill(1);for(let n=0;n<w*h;n++){pixels[n*4+3]=128;if(n%w>=15)strength[n]=1}
 limit[6*w+16]=0;const out=softHairEraser(pixels,w,h,strength,1,limit);
 for(let j=0;j<out.length;j+=4)assert.deepEqual(out.slice(j,j+3),pixels.slice(j,j+3));
 assert.equal(out[(6*w+5)*4+3],128);assert.equal(out[(6*w+25)*4+3],0);assert.equal(out[(6*w+16)*4+3],128,'protected pixels stay exact');
 const fade=[12,13,14,15].map(x=>out[(5*w+x)*4+3]);assert.ok(fade.every(a=>a>0&&a<128));assert.ok(fade.every((a,i)=>!i||a<fade[i-1]));
});
test('single-layer caches refit to male version 60 or unchanged female version 57',async()=>{
 for(const id of Object.keys(HAIR_TEMPLATE_ANCHORS).filter(isSingleLayerHair))for(const version of [47,48,50,53,55,56]){
  const f=studioFixture({hairId:id,version,offset:0});await f.run(id);assert.equal(f.context.calls,1);
  const hair=f.context.state.current.filter(l=>l.kind==='hair-preview');assert.equal(hair.length,1);assert.equal(hair[0].hairRole,'front');assert.equal(hair[0].hairPreviewVersion,id.startsWith('manhair-')?60:57);assert.equal(hair[0].hairLinked,false);
 }
 const short=studioFixture({hairId:'manhair-01',version:60,offset:0});await short.run('manhair-01');assert.equal(short.context.calls,0);
 const long=studioFixture({version:57,offset:0});await long.run('hair-01');assert.equal(long.context.calls,0);
});
test('male version 57 refits; female version 57 stays selected without regeneration',async()=>{
 for(const id of ['manhair-01','manhair-13','manhair-23','hair-18','hair-26','hair-29']){
  const f=studioFixture({hairId:id,version:57,offset:0});await f.run(id);
  assert.equal(f.context.calls,id.startsWith('manhair-')?1:0,id);
  if(f.context.calls)assert.equal(f.context.state.current.find(l=>l.kind==='hair-preview').hairPreviewVersion,60);
 }
});
test('male version 58 refreshes its sideburn fit while female output and status stay unchanged',async()=>{
 const male=studioFixture({hairId:'manhair-29',version:58,offset:0,sideburnWarning:true});await male.run('manhair-29');
 assert.equal(male.context.calls,1);assert.equal(male.context.state.current.filter(l=>l.kind==='hair-preview').length,1);assert.equal(male.context.state.current.find(l=>l.kind==='hair-preview').maleSideburnReport.unavailable,true);assert.match(male.context.status,/จอนบางข้าง/);
 const female=studioFixture({hairId:'hair-26',version:56,offset:0,sideburnWarning:true});await female.run('hair-26');
 assert.equal(female.context.status,'ปรับทรงผมและเก็บขอบแล้ว · ไม่ใช้เครดิต');assert.equal(female.context.state.current.find(l=>l.kind==='hair-preview').maleSideburnReport,undefined);
});

for(const angle of [-.3,0,.3])for(const missingEarRows of [false,true])test(`short PNG avoids copying or stretching hair at ${angle}, missing ear=${missingEarRows}`,()=>{
 const f=rearGapFixture(angle,{missingEarRows}),baseline=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{singleLayer:true}),result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{singleLayer:true,rearHairGuide:f.guide});
 assert.equal(result.back,null);assert.equal(result.gapAdjusted,false);assert.deepEqual(result.front.data,baseline.front.data);
});
for(const alpha of [1,32,128,223,239])for(const hairResidue of [false,true])test(`long rear closes partial-alpha ${alpha}, hair residue=${hairResidue}`,()=>{
 const f=rearGapFixture(),j=(60*f.w+27)*4;
 f.placed.data.set([120,90,80,alpha],j);if(hairResidue)f.guide.data[j+3]=255;
 const before=new Uint8ClampedArray(f.placed.data),skinBefore=new Uint8ClampedArray(f.skin.data),baseline=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas);
 const result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide});
 assert.equal(result.back.data[j+3],255);assert.deepEqual(result.front.data,baseline.front.data);
 assert.deepEqual(f.placed.data,before);assert.deepEqual(f.skin.data,skinBefore);assert.equal(result.gapReport.remaining,0);assert.ok(result.gapReport.filled>0);
});
test('long rear selects thick hair behind a thin inner wisp',()=>{
 const f=rearGapFixture();
 for(let y=30;y<96;y++)for(let x=10;x<=24;x++){const j=(y*f.w+x)*4;if(f.placed.data[j+3])f.placed.data.set(x===24?[255,0,0,255]:[0,200,0,255],j)}
 const result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide}),j=(60*f.w+27)*4;
 assert.deepEqual([...result.back.data.slice(j,j+4)],[0,200,0,255],'the opaque patch comes from the thick strip, not the red inner edge');
});
test('long rear lifts lower thick hair into a wide missing ear band',()=>{
 const f=rearGapFixture();for(let y=32;y<=52;y++)for(let x=10;x<=24;x++){const j=(y*f.w+x)*4;f.placed.data.fill(0,j,j+4);f.guide.data.fill(0,j,j+4)}
 const baseline=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas),result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide}),j=(46*f.w+27)*4;
 assert.equal(result.back.data[j+3],255);assert.ok(result.back.data[j+1]>52,'texture is lifted from the lower mass');assert.deepEqual(result.front.data,baseline.front.data);assert.equal(result.gapReport.remaining,0);
});
test('long joins adapt to different left and right skin/ear outlines',()=>{
 const f=rearGapFixture();f.skin.data.fill(0);for(let y=30;y<=84;y++)for(let x=33;x<=68;x++)f.skin.data.set([255,255,255,255],(y*f.w+x)*4);
 const before=new Uint8ClampedArray(f.skin.data),result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide}),left=(60*f.w+31)*4,right=(60*f.w+69)*4;
 assert.equal(result.back.data[left+3],255);assert.equal(result.back.data[right+3],255);
 assert.ok(31-result.back.data[left]>result.back.data[right]-69,'the wider left join receives a larger inward translation');assert.deepEqual(f.skin.data,before);
});
test('unfillable long gaps are reported rather than painted with skin or thin strands',()=>{
 const f=rearGapFixture();for(let y=30;y<96;y++)for(let x=0;x<f.w;x++)if(x<22||x>74){const j=(y*f.w+x)*4;f.placed.data.fill(0,j,j+4);f.guide.data.fill(0,j,j+4)}
 const result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide});
 assert.ok(result.gapReport.detected>0);assert.ok(result.gapReport.remaining>0);assert.equal(result.gapAdjusted,false);
});
test('native long donor guide uses the PNG calibration, short guide keeps preview coordinates',async()=>{
 for(const id of ['hair-01','hair-18']){
  const f=pickerFixture();await f.pipeline.prepareStudioHairOverlay(f.target,id);const ref=await f.pipeline.cache.get(id),placed=f.surfaces.filter(c=>c.width===f.f.w&&c.height===f.f.h&&c.transforms.length);
  assert.equal(Boolean(ref.hairGuideNative),!isSingleLayerHair(id));
  assert.equal(ref.hairGuide.width,isSingleLayerHair(id)?ref.w:ref.cutout.width);
  if(ref.hairGuideNative)assert.deepEqual(placed[0].transforms[0],placed[1].transforms[0]);
 }
});

test('Studio reports an unresolved long join while keeping the complete two-layer result',async()=>{
 const f=studioFixture({version:47,offset:0,gapWarning:true});await f.run('hair-01');
 assert.equal(f.context.calls,1);assert.equal(f.context.status,'วางทรงแล้ว แต่บางช่องยังเก็บไม่ครบ');assert.equal(f.context.state.current.filter(l=>l.kind==='hair-preview').length,2);
});
test('each long side starts filling at its own ear height',()=>{
 const f=rearGapFixture();f.f.face[356]={...f.f.face[356],y:.49};const before=new Uint8ClampedArray(f.placed.data),result=createTwoLayerHairPreview(f.placed,f.skin,f.f.face,f.w,f.h,canvas,{rearHairGuide:f.guide});
 const left=(42*f.w+27)*4,right=(42*f.w+69)*4;
 assert.ok(result.back.data[left+3]>0);assert.deepEqual(result.back.data.slice(right,right+4),before.slice(right,right+4));assert.equal(result.back.data[(60*f.w+69)*4+3],255);
});

test('original hair restores the first processed head and clears later pixel edits',async()=>{
 const f=studioFixture(),head=f.layers.find(l=>l.id==='head');Object.assign(head,{processedOriginalSource:'first-processed-head',mask:'later-mask',warpSource:'later-warp',eraseRestoreSource:'later-erase',makeupBaseSource:'later-makeup',makeupStyles:{look:'later'},x:145,y:-92,scale:1.43,rotation:-17,squeezeX:.72,squeezeY:.84,opacity:.81,visible:true});
 await f.run('');const restored=f.context.state.current.find(l=>l.id==='head');assert.equal(restored.source,'first-processed-head');assert.equal(restored.mask,null);assert.equal(restored.warpSource,null);assert.equal(restored.eraseRestoreSource,null);assert.equal(restored.makeupBaseSource,null);for(const key of ['id','x','y','scale','rotation','squeezeX','squeezeY','sourceFrame','opacity','visible'])assert.deepEqual(restored[key],head[key],key);assert.equal(f.context.calls,0);assert.equal(f.context.state.current.filter(l=>l.kind==='hair-preview').length,0);assert.equal(f.context.selectedRef.current,'head');assert.equal(f.context.undo.current.length,1);for(const id of ['background','suit'])assert.deepEqual(f.context.state.current.find(l=>l.id===id),f.layers.find(l=>l.id===id));
});
test('original hair restores without the PNG preparation callback and keeps the latest queued head placement',async()=>{
 const f=studioFixture(),head=f.layers.find(l=>l.id==='head'),pose={x:-46,y:71,scale:.87,rotation:23,squeezeX:.91,squeezeY:1.12};head.processedOriginalSource='first-processed-head';f.context.onPrepareHairOverlay=undefined;f.context.flushTransforms=()=>Object.assign(head,pose);
 await f.run('');const restored=f.context.state.current.find(l=>l.id==='head');assert.equal(restored.source,'first-processed-head');for(const [key,value] of Object.entries(pose))assert.equal(restored[key],value,key);assert.deepEqual(restored.sourceFrame,head.sourceFrame);assert.equal(f.context.selectedRef.current,'head');assert.equal(f.context.calls,0);assert.equal(f.context.undo.current.length,1);
});
for(const tool of ['erase','warp'])test(`original hair keeps an active ${tool} session on the restored head after removing its hair layer`,async()=>{
 const f=studioFixture(),head=f.layers.find(l=>l.id==='head');head.processedOriginalSource='first-processed-head';f.context.brushSession.current={tool,layerId:'front',awaitingLayer:false};f.context.tool=tool;f.context.setTool=id=>{if(f.context.brushSession.current&&id!==f.context.brushSession.current.tool)return;f.context.tool=id};
 await f.run('');assert.equal(f.context.state.current.find(l=>l.id==='head').source,'first-processed-head');assert.equal(f.context.selectedRef.current,'head');assert.equal(f.context.brushSession.current.layerId,'head');assert.equal(f.context.brushSession.current.awaitingLayer,false);assert.equal(f.context.tool,tool);assert.equal(f.context.state.current.some(l=>l.id==='front'),false);
});
test('original hair keeps the selected layer consistent with a brush session on an unrelated existing layer',async()=>{
 const f=studioFixture();f.context.brushSession.current={tool:'erase',layerId:'suit',awaitingLayer:false};await f.run('');assert.equal(f.context.brushSession.current.layerId,'suit');assert.equal(f.context.selectedRef.current,'suit');assert.equal(f.context.selection,'suit');assert.deepEqual(f.context.state.current.find(l=>l.id==='suit'),f.layers.find(l=>l.id==='suit'));
});
test('original hair does not confirm a brush session still awaiting mandatory layer selection',async()=>{
 const f=studioFixture();f.context.brushSession.current={tool:'erase',layerId:null,awaitingLayer:true};await f.run('');assert.equal(f.context.brushSession.current.layerId,null);assert.equal(f.context.brushSession.current.awaitingLayer,true);assert.equal(f.context.selectedRef.current,'head');assert.equal(f.context.state.current.find(l=>l.id==='head').source,'untouched-head');
});
test('old projects use their stored original head when no first-processing snapshot exists',async()=>{
 const f=studioFixture();await f.run('');assert.equal(f.context.state.current.find(l=>l.id==='head').source,'untouched-head');assert.equal(f.context.calls,0);
});
