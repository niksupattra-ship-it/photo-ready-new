import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {HAIRSTYLE_RULES} from './hairstyle-rules.js';
import {HAIR_TEMPLATE_ANCHORS} from './src/hair-template-anchors.js';
import {hairPreviewTransform} from './src/hair-preview-fit.js';
import {isSingleLayerHair} from './src/short-female-hair.js';
import {eraseHeadExteriorExcess} from './src/upper-hair-eraser.js';
import {fitProcessedForehead} from './src/processed-forehead-fit.js';

// CPU rasterization exercises the actual picker/finishing functions without a
// browser or a downloaded face model. It does not measure ML landmark quality.
class Surface{
 constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);this.matrix=[1,0,0,1,0,0];this.transforms=[]}
 get naturalWidth(){return this.width}get naturalHeight(){return this.height}
 toDataURL(){return this}
 getContext(){const surface=this;return {
  setTransform(...matrix){surface.matrix=matrix;surface.transforms.push(matrix)},
  drawImage(source){
   const [a,b,c,d,e,f]=surface.matrix,det=a*d-b*c;
   // Native authored PNGs enter an empty surface at their original resolution.
   if(a===1&&b===0&&c===0&&d===1&&e===0&&f===0&&source.width===surface.width&&source.height===surface.height&&!surface.data.some(value=>value!==0)){surface.data.set(source.data);return}
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
  putImageData(image){surface.data.set(image.data)},
  createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}}
 }}
}
function faceFrame({w=96,h=100,cx=48,cy=40,eye=28,width=44,height=60,angle=0}={}){
 const face=[],c=Math.cos(angle),s=Math.sin(angle);
 const p=(x,y)=>({x:(cx+x*c-y*s)/w,y:(cy+x*s+y*c)/h});
 for(const [id,x,y] of [[33,-eye/2,0],[263,eye/2,0],[234,-width/2,0],[454,width/2,0],[10,0,-height*.4],[152,0,height*.6],[127,-width/2,-eye*.1],[356,width/2,-eye*.1]])face[id]=p(x,y);
 return {face,w,h};
}
function portrait(w,h){
 const result=new Surface(w,h);for(let n=0;n<w*h;n++)result.data.set([185,126,107,255],n*4);return result;
}
function authored(w,h,back=false){
 const result=new Surface(w,h);
 for(let y=5;y<31;y++)for(let x=20;x<76;x++)result.data.set([22+x%8,15+y%5,10,255],(y*w+x)*4);
 // Fine strands, a detached fragment and source skin are authored pixels too.
 for(const [x,y,rgba] of [[18,4,[15,12,10,40]],[78,7,[18,13,10,127]],[24,36,[194,141,122,191]],[74,44,[18,12,8,255]]])result.data.set(rgba,(y*w+x)*4);
 if(back)for(let y=30;y<90;y++)for(const x of [22,23,24,72,73,74])result.data.set([31,22,16,255],(y*w+x)*4);
 return result;
}
const bytesEqual=(a,b,message)=>assert.equal(Buffer.from(a).equals(Buffer.from(b)),true,message);
function fixture({file='src/main.jsx',targetFrame=faceFrame(),referenceFrame=faceFrame(),native=false,badBack=false}={}){
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 const start=source.indexOf('const fittedHairReferenceCache=new Map();'),end=source.indexOf('// Processing and Studio use the same',start);
 assert.ok(start>=0&&end>start);
 const target=portrait(targetFrame.w,targetFrame.h),surfaces=[],loaded=[],eraseCalls=[],foreheadCalls=[];
 const labels={data:new Uint8Array(targetFrame.w*targetFrame.h).fill(1),width:targetFrame.w,height:targetFrame.h};
 const calibration=HAIR_TEMPLATE_ANCHORS['hair-30'];
 const front=authored(...(native?calibration.sourceSize:[96,100]));
 const back=authored(...(native?calibration.sourceSize:[96,100]),true);
 const preview=new Surface(...(native?calibration.referenceSize:[96,100]));
 const forbidden=name=>()=>{throw Error('authored pair must not enter '+name)};
 const context={Uint8Array,Uint8ClampedArray,HTMLImageElement:class{},HAIRSTYLE_RULES,HAIR_TEMPLATE_ANCHORS,isSingleLayerHair,hairPreviewTransform,
  getLandmarker:async()=>({detect:image=>({faceLandmarks:[image===target?targetFrame.face:referenceFrame.face]})}),
  getPersonSegmenter:async()=>({segment:(image,callback)=>callback({categoryMask:{...labels,getAsUint8Array:()=>labels.data,close(){}}})}),
  canvasFor:(w,h)=>{const result=new Surface(w,h);surfaces.push(result);return result},
  opaqueBounds:surface=>surface.data.some((value,index)=>index%4===3&&value>20)?{x:0,y:0,w:surface.width,h:surface.height}:null,
  loadImage:async url=>{loaded.push(url);if(url==='/assets/hairstyle-previews/hair-30.png')return preview;if(url==='/assets/hair/hair-30.png')return front;if(url==='/assets/hair/hair-30-back.png')return badBack?new Surface(80,100):back;throw Error('unexpected asset '+url)},
  eraseHeadExteriorExcess:(...args)=>{eraseCalls.push(args.map(value=>value instanceof Uint8ClampedArray?new Uint8ClampedArray(value):value));return eraseHeadExteriorExcess(...args)},
  fitProcessedForehead:(...args)=>{foreheadCalls.push(args.map(value=>value instanceof Uint8ClampedArray?new Uint8ClampedArray(value):value));return fitProcessedForehead(...args)},
  semanticClassMask:forbidden('semanticClassMask'),eraseHairTemplateSkin:forbidden('eraseHairTemplateSkin'),cleanTemplateForehead:forbidden('cleanTemplateForehead'),
  eraseDetachedUpperHair:forbidden('eraseDetachedUpperHair'),featherLongCrown:forbidden('featherLongCrown'),createTwoLayerHairPreview:forbidden('createTwoLayerHairPreview'),
  shortHairInterior:forbidden('shortHairInterior'),pushLongHairRear:forbidden('pushLongHairRear')
 };
 const pipeline=vm.runInNewContext(source.slice(start,end)+'\n({prepareStudioHairOverlay,finishStudioHairPreview,cache:fittedHairReferenceCache})',context);
 if(!native)pipeline.cache.set('hair-30',{cutout:front,backCutout:back,face:referenceFrame.face,w:referenceFrame.w,h:referenceFrame.h,calibration:{...calibration,sourceToReference:[1,0,0,1,0,0]},hairGuide:null});
 return {pipeline,context,target,front,back,preview,surfaces,loaded,labels,eraseCalls,foreheadCalls,targetFrame,referenceFrame};
}
function pngMetadata(path){
 const bytes=fs.readFileSync(new URL(path,import.meta.url));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),colorType:bytes[25]};
}
test('female hairstyle 30 is appended once in both pickers and remains a two-layer style',()=>{
 for(const file of ['src/main.jsx','main.jsx']){
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8'),start=source.indexOf('const HAIR_OPTIONS='),end=source.indexOf('const JOB_UNIFORMS=',start);
  const options=vm.runInNewContext(source.slice(start,end)+'\nHAIR_OPTIONS');
  assert.equal(options.length,27);assert.equal(options.at(-1).id,'hair-30');assert.equal(options.at(-1).name,'ทรงผม 30');assert.equal(options.at(-1).src,'/assets/hairstyle-previews/hair-30.png');
  assert.equal(options.filter(option=>option.id==='hair-30').length,1);
  assert.deepEqual(Array.from(options.slice(0,4),option=>option.id),['hair-26','hair-27','hair-28','hair-29']);
  assert.ok(options.every(option=>!['hair-01','hair-02','hair-07'].includes(option.id)));
 }
 assert.ok(HAIRSTYLE_RULES['hair-30']);assert.equal(isSingleLayerHair('hair-30'),false);
});
test('authored front and rear keep native resolution and share a calibrated crown frame',()=>{
 const anchor=HAIR_TEMPLATE_ANCHORS['hair-30'];
 assert.equal(anchor.layout,'authored-pair');assert.equal(anchor.backSource,'/assets/hair/hair-30-back.png');
 assert.deepEqual(anchor.sourceToReference,[1,0,0,1,0,152]);assert.deepEqual(anchor.sourceSize,[1128,1188]);assert.deepEqual(anchor.referenceSize,[1128,1536]);
 for(const path of ['public/assets/hair/hair-30.png','public/assets/hair/hair-30-back.png'])assert.deepEqual(pngMetadata(path),{width:1128,height:1188,colorType:6});
 const preview=pngMetadata('public/assets/hairstyle-previews/hair-30.png');assert.equal(preview.width,1128);assert.equal(preview.height,1536);
});
for(const file of ['src/main.jsx','main.jsx'])test(`${file}: authored fine strands, detached pixels and native alpha survive placement`,async()=>{
 const f=fixture({file}),frontBefore=new Uint8ClampedArray(f.front.data),backBefore=new Uint8ClampedArray(f.back.data),headBefore=new Uint8ClampedArray(f.target.data);
 const result=await f.pipeline.prepareStudioHairOverlay(f.target,'hair-30');
 bytesEqual(result.source.data,frontBefore,'authored front must not be cleaned, clipped or liquified');bytesEqual(result.backSource.data,backBefore,'authored rear must not be cleaned, clipped or liquified');
 bytesEqual(f.front.data,frontBefore,'reference front is immutable');bytesEqual(f.back.data,backBefore,'reference rear is immutable');bytesEqual(f.target.data,headBefore,'processed portrait input is immutable');
 assert.equal(f.eraseCalls.length,1);assert.equal(f.foreheadCalls.length,1);
 assert.equal(f.eraseCalls[0][6].softEdges,false);assert.deepEqual(Object.keys(f.eraseCalls[0][6]),['softEdges']);
 const coverage=new Surface(96,100);coverage.getContext().drawImage(f.back);coverage.getContext().drawImage(f.front);
 bytesEqual(f.eraseCalls[0][1],coverage.data,'existing exterior eraser receives the union of both authored layers');
 bytesEqual(f.foreheadCalls[0][0],headBefore,'forehead handling receives the original processed person');bytesEqual(f.foreheadCalls[0][1],frontBefore,'front alone defines the existing upper excess boundary');
 const oldExterior=eraseHeadExteriorExcess(headBefore,coverage.data,96,100,f.targetFrame.face,f.labels,{softEdges:false});
 const expected=fitProcessedForehead(headBefore,frontBefore,96,100,f.targetFrame.face,f.labels,oldExterior);
 bytesEqual(result.cleanedHeadSource.data,expected.pixels,'person cleanup retains the existing long-hair result');
});
for(const [angle,scale] of [[-.3,.8],[0,1],[.3,1.2]])test(`both authored crowns share one rigid placement at angle ${angle}, scale ${scale}`,async()=>{
 const targetFrame=faceFrame({cx:48,cy:42,eye:28*scale,width:44*scale,height:60*scale,angle}),f=fixture({targetFrame});
 const result=await f.pipeline.prepareStudioHairOverlay(f.target,'hair-30');
 const transformed=f.surfaces.filter(surface=>surface.transforms.length);assert.equal(transformed.length,2);
 assert.deepEqual(transformed[0].transforms,transformed[1].transforms,'front and rear cannot fit independently');
 const [a,b,c,d,e,g]=transformed[0].transforms[0],expected=hairPreviewTransform(f.referenceFrame.face,96,100,targetFrame.face,96,100);
 for(const [actual,wanted] of [[a,expected.a],[b,expected.b],[c,expected.c],[d,expected.d],[e,expected.e],[g,expected.f]])assert.ok(Math.abs(actual-wanted)<1e-10);
 assert.ok(Math.abs(Math.hypot(a,b)-Math.hypot(c,d))<1e-10);assert.ok(Math.abs(a*c+b*d)<1e-10);assert.ok(a*d-b*c>0);
 const frontExpected=new Surface(96,100),backExpected=new Surface(96,100);frontExpected.getContext().setTransform(a,b,c,d,e,g);backExpected.getContext().setTransform(a,b,c,d,e,g);frontExpected.getContext().drawImage(f.front);backExpected.getContext().drawImage(f.back);
 bytesEqual(result.source.data,frontExpected.data,'no extra front deformation after affine placement');bytesEqual(result.backSource.data,backExpected.data,'no rear gap fill after affine placement');
});
test('uncached authored selection loads the explicit rear asset and reuses the raw pair',async()=>{
 const referenceFrame=faceFrame({w:1128,h:1536,cx:564,cy:615,eye:330,width:520,height:720}),f=fixture({native:true,referenceFrame});
 const frontBefore=new Uint8ClampedArray(f.front.data),backBefore=new Uint8ClampedArray(f.back.data);
 await f.pipeline.prepareStudioHairOverlay(f.target,'hair-30');
 assert.deepEqual(f.loaded.sort(),['/assets/hair/hair-30-back.png','/assets/hair/hair-30.png','/assets/hairstyle-previews/hair-30.png'].sort());
 const cached=await f.pipeline.cache.get('hair-30');assert.equal(cached.cutout.width,1128);assert.equal(cached.cutout.height,1188);assert.equal(cached.backCutout.width,1128);assert.equal(cached.backCutout.height,1188);
 bytesEqual(cached.cutout.data,frontBefore,'native front cache is the supplied PNG');bytesEqual(cached.backCutout.data,backBefore,'native rear cache is the supplied PNG');
 await f.pipeline.prepareStudioHairOverlay(f.target,'hair-30');assert.equal(f.loaded.length,3,'same style does not decode a new donor or reload the rear');
});
test('a mismatched authored rear fails before modifying the processed person',async()=>{
 const referenceFrame=faceFrame({w:1128,h:1536,cx:564,cy:615,eye:330,width:520,height:720}),f=fixture({native:true,referenceFrame,badBack:true}),before=new Uint8ClampedArray(f.target.data);
 await assert.rejects(f.pipeline.prepareStudioHairOverlay(f.target,'hair-30'));
 bytesEqual(f.target.data,before,'failed pair must retain the original person');assert.equal(f.eraseCalls.length,0);assert.equal(f.foreheadCalls.length,0);assert.equal(f.pipeline.cache.has('hair-30'),false);
});
test('the authored guard blocks rear liquify even if contour context is supplied',async()=>{
 const f=fixture(),frontBefore=new Uint8ClampedArray(f.front.data),backBefore=new Uint8ClampedArray(f.back.data);
 const result=await f.pipeline.finishStudioHairPreview(f.target,f.front,f.back,f.targetFrame.face,'hair-30',{authoredPair:true,skin:f.target,guide:f.back});
 bytesEqual(result.source.data,frontBefore,'authored front remains intact');bytesEqual(result.backSource.data,backBefore,'contour metadata cannot trigger rear texture deformation');
 assert.equal(f.eraseCalls.length,1);assert.equal(f.foreheadCalls.length,1);
});
test('processed output composites the authored rear below the person and authored front above',async()=>{
 const source=fs.readFileSync(new URL('src/main.jsx',import.meta.url),'utf8'),start=source.indexOf('async function localHairstyleOnCleanMaster('),end=source.indexOf('async function makeCleanHeadMaster(',start);
 const head=new Surface(10,10),front=new Surface(10,10),back=new Surface(10,10),at=(x,y)=>(y*10+x)*4;
 for(const [x,y] of [[5,2],[5,5]])head.data.set([185,126,107,255],at(x,y));
 for(const [x,y] of [[5,2],[5,5],[1,7]])back.data.set([31,22,16,255],at(x,y));
 front.data.set([20,14,8,255],at(5,2));let calls=0,revoked=0;
 const context={URL:{createObjectURL:()=> 'processed-person',revokeObjectURL:()=>revoked++},
  loadImage:async value=>value==='processed-person'?head:value,
  prepareStudioHairOverlay:async(input,id)=>{calls++;assert.equal(input,head);assert.equal(id,'hair-30');return {source:front,backSource:back,cleanedHeadSource:head}},
  canvasFor:(w,h)=>new Surface(w,h),canvasPng:async surface=>surface};
 const run=vm.runInNewContext(source.slice(start,end)+'\nlocalHairstyleOnCleanMaster',context),result=await run({},'hair-30');
 assert.deepEqual(Array.from(result.data.slice(at(5,2),at(5,2)+4)),[20,14,8,255],'front covers the head crown');
 assert.deepEqual(Array.from(result.data.slice(at(5,5),at(5,5)+4)),[185,126,107,255],'person stays between the two authored layers');
 assert.deepEqual(Array.from(result.data.slice(at(1,7),at(1,7)+4)),[31,22,16,255],'rear remains visible outside the person');
 assert.equal(calls,1);assert.equal(revoked,1);
});
