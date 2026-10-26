import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {measureUniformAnchors} from '../src/portrait-uniform-fit.js';
import {measureCollarOpeningProfile} from '../src/studio-auto-collar-fit.js';
import {planStudioSuitGeometry} from '../src/studio-suit-fit.js';
import {layerToScene} from '../src/studio-transform.js';

const catalog=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),paths=[];
for(const name of ['JOB_UNIFORMS','STUDENT_UNIFORMS','GOWN_UNIFORMS','INTERIOR_UNIFORMS','FEMALE_GOVERNMENT_UNIFORMS']){
 const start=catalog.indexOf('const '+name+'=['),end=catalog.indexOf('\n];',start);assert(start>=0&&end>start,'catalog missing '+name);
 paths.push(...[...catalog.slice(start,end).matchAll(name.includes('GOVERNMENT')||name==='INTERIOR_UNIFORMS'?/img:'([^']+)'/g:/template:'([^']+)'/g)].map(match=>match[1].replace(/^\/assets\//,'')));
}
assert.equal(paths.length,25,'exercise every current catalog garment');
const head={id:'head',jobId:'same-paid-job',kind:'head',source:'unchanged native source',sourceFrame:{x:45,y:50,w:810,h:1080},x:0,y:0,scale:1,rotation:0,femaleEyeStyle:'makeup',mask:'unchanged mask',warpSource:'unchanged warp'};
const face={width:900,height:1200,cx:450,chin:{x:450,y:615},forehead:{x:450,y:155},left:{x:294,y:390},right:{x:606,y:390},leftEye:{x:365,y:365},rightEye:{x:535,y:365},faceWidth:312,faceHeight:460,eyeWidth:170,opaqueTop:80};
let count=0;
const refs=[];
for(const path of paths){
 const source=sharp(new URL('../public/assets/'+path,import.meta.url).pathname),metadata=await source.metadata();
 const {data,info}=await source.resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const uniform=measureUniformAnchors(data,info.width,info.height);uniform.nativeAspect=metadata.height/metadata.width;
 const opening=measureCollarOpeningProfile({pixels:data,width:info.width,height:info.height,centerX:uniform.centerX,minY:uniform.bounds.t,maxY:Math.min(uniform.bounds.b,uniform.bounds.t+uniform.bounds.w*.55)});
 for(const pose of [{x:0,y:0,scale:1,rotation:0},{x:12,y:-8,scale:1.03,rotation:3}]){
  const suit={id:'suit',kind:'suit',templatePath:path,...pose},plan=planStudioSuitGeometry({uniform,opening,face,head,suit}),again=planStudioSuitGeometry({uniform,opening,face,head:{...head,x:100,y:-45,scale:.7,rotation:12},suit});
  assert.deepEqual(plan,again,'fit must not accumulate from prior head pose');
  assert(Object.values(plan.headPose).every(Number.isFinite));assert(Object.values(plan.garmentFrame).every(Number.isFinite));
  const physicalAspect=plan.garmentFrame.h/1200*3072/(plan.garmentFrame.w/900*2256);
  assert(Math.abs(physicalAspect-metadata.height/metadata.width)<1e-10,'native template ratio is preserved in the actual output');
  const chin={x:head.sourceFrame.x+face.chin.x/face.width*head.sourceFrame.w,y:head.sourceFrame.y+face.chin.y/face.height*head.sourceFrame.h};
  const mapped=layerToScene(plan.headPose,chin);assert(Math.hypot(mapped.x-plan.chinTarget.x,mapped.y-plan.chinTarget.y)<1e-8,'chin centered on garment');
  assert(plan.localScale>=.9&&plan.localScale<=1.1,'ordinary inputs preserve initial optical head size');
  if(!pose.rotation){const top=layerToScene(plan.headPose,{x:450,y:head.sourceFrame.y+face.opaqueTop/face.height*head.sourceFrame.h});assert(top.y>=1200*.045-1,'head crown stays in frame');assert(plan.garmentFrame.y+plan.garmentFrame.h>=1200,'body covers lower frame')}
  assert.equal(head.source,'unchanged native source');assert.equal(head.femaleEyeStyle,'makeup');assert.equal(head.jobId,'same-paid-job');
  refs.push({path,pose,frame:plan.garmentFrame,head:plan.headPose,scale:plan.localScale});count++;
 }
}
assert(new Set(refs.filter(r=>!r.pose.rotation).map(r=>r.head.scale.toFixed(4))).size>2,'real garment shoulder differences change head size');
assert.throws(()=>planStudioSuitGeometry({uniform:{},opening:[],face,head,suit:{}}));
console.log(`PASS ${count} real-catalog geometry fits across job, government, student and gown, native aspect, canonical size, collar alignment and repeat stability.`);
