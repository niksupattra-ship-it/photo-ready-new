import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {hairPreviewTransform,createTwoLayerHairPreview,eraseHairTemplateSkin,syncHairAttachments,syncHairPairTransforms} from './src/hair-preview-fit.js';
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
test('all 41 native calibrations preserve scale, handedness and orthogonal axes',()=>{
 assert.equal(Object.keys(HAIR_TEMPLATE_ANCHORS).length,41);
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
 assert.equal(Boolean(layers.back),!singleLayer);if(layers.back)for(let j=0;j<original.length;j+=4)assert.deepEqual(layers.back.data.slice(j,j+3),original.slice(j,j+3),'rear texture stays registered without borrowing rows');
 let erased=0,soft=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;assert.deepEqual(layers.front.data.slice(j,j+3),original.slice(j,j+3));
  if(!skin.data[j+3]||y<15)assert.deepEqual(layers.front.data.slice(j,j+4),original.slice(j,j+4),'no outside expansion, horizontal cut or crown erasure');
  if(layers.front.data[j+3]<255)erased++;if(layers.front.data[j+3]>0&&layers.front.data[j+3]<255)soft++;
 }
 assert.ok(erased>0&&soft>0);assert.deepEqual(placed.data,original);assert.deepEqual(skin.data,originalSkin);
 // Where front hair is removed, opaque portrait skin covers the exact hole.
 const composite=canvas(w,h);if(layers.back)composite.getContext().drawImage(layers.back);composite.getContext().drawImage(skin);composite.getContext().drawImage(layers.front);
 for(let n=0;n<w*h;n++)assert.equal(composite.data[n*4+3],255,'no notch exposing the background');
});
test('front and rear preserve fine-strand alpha instead of double-painting the PNG',()=>{
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),placed=opaque(w,h),skin=curvedSkin(w,h);
 for(let n=0;n<w*h;n++)placed.data[n*4+3]=40+n%216;
 const {front,back}=createTwoLayerHairPreview(placed,skin,f.face,w,h,canvas),combined=canvas(w,h);
 combined.getContext().drawImage(back);combined.getContext().drawImage(front);
 for(let n=0;n<w*h;n++)assert.ok(Math.abs(combined.data[n*4+3]-placed.data[n*4+3])<=1,'split layers reconstruct the input alpha at every pixel');
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
function pickerFixture(){
 const source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8');
 const start=source.indexOf('const fittedHairReferenceCache=new Map();'),end=source.indexOf('// Processing and Studio use the same',start);
 const w=96,h=100,f=portrait({w,h,cx:48,cy:40,width:44,height:60,eye:28}),target=opaque(w,h),surfaces=[],options=[];let closed=0,cleaned=0;
 const context={Uint8Array,HTMLImageElement:class{},HAIRSTYLE_RULES,HAIR_TEMPLATE_ANCHORS,isSingleLayerHair,hairPreviewTransform,eraseUpperHairExcess,eraseDetachedUpperHair,
  getLandmarker:async()=>({detect:()=>({faceLandmarks:[f.face]})}),
  getPersonSegmenter:async()=>({segment:(image,callback)=>callback({categoryMask:{width:w,height:h,getAsUint8Array:()=>new Uint8Array(w*h).fill(1),close:()=>closed++}})}),
  semanticClassMask:async(image,w,h)=>curvedSkin(w,h),
  opaqueBounds:c=>c.data.some((v,i)=>i%4===3&&v>20)?{x:0,y:0,w:c.width,h:c.height}:null,
  canvasFor:(w,h)=>{const c=canvas(w,h);surfaces.push(c);return c},
  eraseHairTemplateSkin:(...args)=>{cleaned++;return eraseHairTemplateSkin(...args)},
  createTwoLayerHairPreview:(...args)=>{options.push(args[6]);return createTwoLayerHairPreview(...args)},
  loadImage:async url=>{
   if(encoded.has(url))return encoded.get(url);
   const id=url.match(/([^/]+)\.png$/)[1],calibration=HAIR_TEMPLATE_ANCHORS[id],size=url.includes('/hair/')?calibration.sourceSize:calibration.referenceSize;
   return opaque(...size);
  }
 };
 const pipeline=vm.runInNewContext(source.slice(start,end)+'\n({prepareStudioHairOverlay,cache:fittedHairReferenceCache})',context);
 return {pipeline,context,f,target,surfaces,options,closed:()=>closed,cleaned:()=>cleaned};
}
test('the picker applies one rigid placement and skin-contour policy to all 41 style IDs',async()=>{
 const f=pickerFixture(),ids=Object.keys(HAIRSTYLE_RULES);assert.equal(ids.length,41);
 for(const id of ids){
  // Shared raster fixture checks style routing; native asset geometry is
  // covered separately by the calibration and uncached loading tests.
  f.pipeline.cache.set(id,{cutout:f.target,face:f.f.face,w:f.f.w,h:f.f.h,calibration:{...HAIR_TEMPLATE_ANCHORS[id],sourceToReference:[1,0,0,1,0,0]}});
  const before=f.surfaces.length,result=await f.pipeline.prepareStudioHairOverlay(f.target,id),created=f.surfaces.slice(before),transformed=created.filter(c=>c.transforms.length);
  assert.equal(transformed.length,1);assert.equal(transformed[0].transforms.length,2);
  const [a,b,c,d]=transformed[0].transforms[0];rigid({a,b,c,d});
  assert.deepEqual(Object.keys(result).sort(),['backSource','cleanedHeadSource','source']);assert.equal(Boolean(result.backSource),!isSingleLayerHair(id));
 }
 assert.equal(f.closed(),41);assert.equal(f.options.length,41);
 assert.ok(f.options.every(option=>Object.keys(option).join(',')==='singleLayer'),'no local warp or side squeeze enters the live picker');
});
for(const id of ['hair-01','hair-18','manhair-01'])test(`uncached ${id} cleans native template skin before calibrated placement`,async()=>{
 const f=pickerFixture(),result=await f.pipeline.prepareStudioHairOverlay(f.target,id);assert.ok(result.source&&result.cleanedHeadSource);assert.equal(f.cleaned(),1);
 const ref=await f.pipeline.cache.get(id);assert.equal(ref.cutout.width,HAIR_TEMPLATE_ANCHORS[id].sourceSize[0]);assert.equal(ref.cutout.height,HAIR_TEMPLATE_ANCHORS[id].sourceSize[1]);
 const first=f.surfaces.find(c=>c.transforms.length).transforms[0];rigid({a:first[0],b:first[1],c:first[2],d:first[3]});
 await f.pipeline.prepareStudioHairOverlay(f.target,id);assert.equal(f.cleaned(),1,'immutable template is cleaned only once');
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

function studioFixture({version=44,offset=80,missingBack=false,locked=false}={}){
 const pose={x:12,y:-7,scale:1.2,rotation:8},head={id:'head',kind:'head',source:'old-cleaned-head',hairOriginalSource:'untouched-head',sourceFrame:{x:100,y:120,w:600,h:850},locked,...pose};
 const hair=role=>({id:role,kind:'hair-preview',hairHeadId:head.id,hairId:'hair-01',hairRole:role,hairPreviewVersion:version,hairLinked:true,...pose,x:pose.x+offset});
 const layers=[{id:'background',kind:'background',source:'blue'},...(!missingBack?[hair('back')]:[]),head,hair('front'),{id:'suit',kind:'suit',source:'uniform'}];
 const source=fs.readFileSync(new URL('./src/studio-editor.jsx',import.meta.url),'utf8'),start=source.indexOf(' const applyHair=async id=>'),end=source.indexOf(' const commitMakeupSource=',start);
 const context={processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,flushTransforms:()=>{},state:{current:layers},layerKind:l=>l.kind,isSingleLayerHair,
  mounted:{current:true},hairUiFrame:async()=>{},historySnapshot:()=>layers.map(l=>({...l})),assets:{current:new Map([[head.id,{original:opaque(10,10)}]])},
  headPose:l=>Object.fromEntries(['x','y','scale','rotation'].map(k=>[k,l[k]])),surfaceURL:x=>x,
  undo:{current:[]},redo:{current:[]},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},drawNow:()=>{},touch:false,
  hydrate:async(next,unchanged)=>{context.state.current=next;context.unchanged=unchanged;return true},fresh:l=>({...l,id:`new-${l.hairRole}`}),
  onPrepareHairOverlay:async(source,id)=>{context.calls++;assert.equal(source,'untouched-head');assert.equal(id,'hair-01');return {source:'new-front',backSource:'new-back',cleanedHeadSource:'new-head'}},calls:0,
  setStatus:s=>{context.status=s}
 };
 for(const key of ['setSelected','setAssetBusy','setHairPlacementProgress','setSelectedHair','setHairConfirmed','setHairNotice','setRevision','setTool','setComparing'])context[key]=()=>{};
 const run=vm.runInNewContext(source.slice(start,end)+'\napplyHair',context);
 return {run,context,layers};
}
for(const options of [{version:44,offset:0},{version:45,offset:80},{version:45,offset:0,missingBack:true}])test(`Studio rebuilds old, shifted or incomplete hair ${JSON.stringify(options)} from the untouched head`,async()=>{
 const f=studioFixture(options);await f.run('hair-01');assert.equal(f.context.calls,1,f.context.status);
 const next=f.context.state.current;assert.deepEqual(Array.from(next,l=>l.id),['background','new-back','head','new-front','suit']);
 for(const role of ['front','back']){const hair=next.find(l=>l.hairRole===role);assert.equal(hair.hairPreviewVersion,45);assert.equal(hair.hairLinked,true);for(const key of ['x','y','scale','rotation'])assert.equal(hair[key],next[2][key])}
 assert.equal(next[2].source,'new-head');assert.equal(next[2].hairOriginalSource,'untouched-head');
 for(const id of ['background','suit'])assert.deepEqual(next.find(l=>l.id===id),f.layers.find(l=>l.id===id));
 assert.equal(f.context.undo.current.length,1);assert.equal(f.context.processRequestRef.current,false);
});
test('an aligned current hair pair remains selected, and a locked head remains untouched',async()=>{
 for(const options of [{version:45,offset:0},{locked:true}]){const f=studioFixture(options);await f.run('hair-01');assert.equal(f.context.calls,0);assert.equal(f.context.state.current,f.layers)}
});
