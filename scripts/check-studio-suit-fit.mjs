import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {measureUniformAnchors} from '../src/portrait-uniform-fit.js';
import {measureCollarOpeningProfile} from '../src/studio-auto-collar-fit.js';
import {planStudioSuitGeometry,hasStudioCollarGap} from '../src/studio-suit-fit.js';
import {layerToScene} from '../src/studio-transform.js';

const catalog=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),paths=[];
for(const name of ['JOB_UNIFORMS','STUDENT_UNIFORMS','GOWN_UNIFORMS','INTERIOR_UNIFORMS','FEMALE_GOVERNMENT_UNIFORMS']){
 const start=catalog.indexOf('const '+name+'=['),end=catalog.indexOf('\n];',start);assert(start>=0&&end>start,'catalog missing '+name);
 paths.push(...[...catalog.slice(start,end).matchAll(name.includes('GOVERNMENT')||name==='INTERIOR_UNIFORMS'?/img:'([^']+)'/g:/template:'([^']+)'/g)].map(match=>match[1].replace(/^\/assets\//,'')));
}
assert.equal(paths.length,25,'exercise every current catalog garment');
const head={id:'head',jobId:'same-paid-job',kind:'head',source:'unchanged native source',sourceFrame:{x:45,y:50,w:810,h:1080},x:0,y:0,scale:1,rotation:0,femaleEyeStyle:'makeup',mask:'unchanged mask',warpSource:'unchanged warp'};
const face={width:900,height:1200,cx:450,chin:{x:450,y:615},forehead:{x:450,y:155},left:{x:294,y:390},right:{x:606,y:390},leftEye:{x:365,y:365},rightEye:{x:535,y:365},faceWidth:312,faceHeight:460,eyeWidth:170,opaqueTop:80};
const neckProfile={rows:[{y:650,left:390,right:510},{y:700,left:380,right:520},{y:760,left:370,right:530}]};
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-8,message+': '+a+' != '+b);
const headPoint=p=>({x:head.sourceFrame.x+p.x/face.width*head.sourceFrame.w,y:head.sourceFrame.y+p.y/face.height*head.sourceFrame.h});
let count=0;
for(const path of paths){
 const source=sharp(new URL('../public/assets/'+path,import.meta.url).pathname),metadata=await source.metadata();
 const {data,info}=await source.resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const uniform=measureUniformAnchors(data,info.width,info.height);uniform.nativeAspect=metadata.height/metadata.width;
 const opening=measureCollarOpeningProfile({pixels:data,width:info.width,height:info.height,centerX:uniform.centerX,minY:uniform.bounds.t,maxY:Math.min(uniform.bounds.b,uniform.bounds.t+uniform.bounds.w*.55)});
 // Known compositor frames and independent manual frames are immutable inputs.
 const nativeBoundsWidth=uniform.bounds.w/info.width*metadata.width,nativeLeft=uniform.bounds.l/info.width*metadata.width,nativeSocket=uniform.socketY/info.height*metadata.height;
 const nativeScale=2260/nativeBoundsWidth;
 const originalFrame={x:(-2-nativeLeft*nativeScale)/2256*900,y:(3072*.425+nativeSocket*(2256*.94/metadata.width)-nativeSocket*nativeScale)/3072*1200,w:metadata.width*nativeScale/2256*900,h:metadata.height*nativeScale/3072*1200};
 const configurations=[
  {sourceFrame:originalFrame,x:0,y:0,scale:1,rotation:0,squeezeX:1,squeezeY:1},
  {sourceFrame:{x:23,y:287,w:1023,h:1147.25},x:12,y:-8,scale:1.03,rotation:3,squeezeX:.94,squeezeY:1.06},
  {sourceFrame:{x:-40,y:405,w:980,h:930},x:-15,y:20,scale:.9,rotation:-4,squeezeX:1.05,squeezeY:.97}
 ];
 for(const configuration of configurations)for(const measured of [null,neckProfile]){
  const suit={id:'suit',kind:'suit',templatePath:path,source:'unchanged garment source',...configuration,collarFrame:{...configuration.sourceFrame,x:configuration.sourceFrame.x+7,w:configuration.sourceFrame.w*.97}};
  const before=JSON.stringify({head,suit,face,uniform,opening,neckProfile:measured});
  const plan=planStudioSuitGeometry({uniform,opening,face,head,suit,neckProfile:measured});
  const again=planStudioSuitGeometry({uniform,opening,face,head:{...head,x:100,y:-45,scale:.7,rotation:12},suit,neckProfile:measured});
  assert.deepEqual(plan,again,'A-B-A fitting must not accumulate the prior head pose');
  assert.equal(plan.garmentFrame,suit.sourceFrame,'the exact body frame stays fixed even when collarFrame differs');
  assert.equal(JSON.stringify({head,suit,face,uniform,opening,neckProfile:measured}),before,'input pixels, frames and poses must not change');
  assert(Object.values(plan.headPose).every(Number.isFinite));assert.equal(plan.headPose.squeezeX,1);assert.equal(plan.headPose.squeezeY,1);
  const l=headPoint(face.left),r=headPoint(face.right),placedFaceWidth=Math.hypot(r.x-l.x,r.y-l.y)*plan.headPose.scale;
  const ratio=placedFaceWidth/plan.shoulderSpan;assert(ratio>.15&&ratio<=.46+1e-10,'head stays bounded by this garment shoulder span');
  assert(placedFaceWidth<=plan.torsoSpan*.72+1e-8,'head cannot overwhelm the measured torso');
  const longer=planStudioSuitGeometry({uniform,opening,face,head,suit,neckProfile:{rows:[{y:950,left:370,right:530}]}});
  assert.deepEqual(plan,longer,'a cut-off or longer neck must not enlarge the face');
  const mappedChin=layerToScene(plan.headPose,headPoint(face.chin));close(mappedChin.x,plan.chinTarget.x,'reported chin X');close(mappedChin.y,plan.chinTarget.y,'reported chin Y');
  count++;
 }
}
// A deep V is not authority to enlarge the face or move the garment.
{
 const uniform={width:1000,height:1000,bounds:{l:0,r:999,t:0,b:999,w:1000,h:1000},centerX:500,shoulderWidth:820,socketY:120,neckSocketY:250},opening=[{y:50,left:400,right:600},{y:200,left:485,right:515}];
 const fixedFrame={x:7,y:310,w:900,h:900},suit={sourceFrame:fixedFrame,x:0,y:0,scale:1,rotation:0,squeezeX:1,squeezeY:1};
 const plan=planStudioSuitGeometry({uniform,opening,face,head,suit,neckProfile});
 assert.deepEqual(plan,planStudioSuitGeometry({uniform:{...uniform,neckSocketY:450},opening,face,head,suit}));assert.equal(plan.garmentFrame,fixedFrame);
}
// Exercise the actual lower-opening guard with independent alpha fixtures.
// Cloth has a real enclosed V and transparent air beyond its outer lapels.
const alphaGrid=(width,height,alpha)=>{const pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const j=(y*width+x)*4;pixels[j]=170;pixels[j+1]=130;pixels[j+2]=110;pixels[j+3]=alpha(x,y)}return pixels};
{
 const width=60,height=80,nativeW=120,nativeH=160;
 const opening=Array.from({length:11},(_,i)=>({y:30+i*3,left:20+i*.6,right:40-i*.6}));
 const garment={opening,width,height,originalWidth:nativeW,originalHeight:nativeH,uniform:{neckSocketY:65}};
 const previewPixels=alphaGrid(nativeW,nativeH,(x,y)=>{const ux=x/2,uy=y/2;if(ux<8||ux>52||uy<30)return 0;return uy<65&&Math.abs(ux-30)<10-(uy-30)*.2?0:255});
 const covered={width,height,pixels:alphaGrid(width,height,(x)=>x>=22&&x<=38?255:0)};
 const call=(portrait,headToUniform=[1,0,0,1,0,0],preview=previewPixels)=>hasStudioCollarGap({garment,portrait,headToUniform,previewPixels:preview,frameHeight:80});
 const beforePortrait=covered.pixels.slice(),beforeCloth=previewPixels.slice();
 assert.equal(call(covered),false,'an existing neck covering the enclosed V is accepted');
 const cut={width,height,pixels:alphaGrid(width,height,(x,y)=>x>=22&&x<=38&&y<58?255:0)};
 assert.equal(call(cut),true,'a real transparent V below a cut-off neck is detected for the adjustment notice');
 const outsideAir={width,height,pixels:alphaGrid(width,height,(x)=>x>=22&&x<=38?255:0)};
 assert.equal(call(outsideAir),false,'transparent background outside lapels is not a missing neck');
 const antialias={width,height,pixels:alphaGrid(width,height,(x,y)=>x>=22&&x<=38?(y===60||y===61?80:255):0)};
 assert.equal(call(antialias),false,'a short antialias-only edge stays below the allowed three-local-pixel tolerance');
 const scaled={width:120,height:160,pixels:alphaGrid(120,160,(x)=>x>=44&&x<=76?255:0)};
 assert.equal(call(scaled,[.5,0,0,.5,0,0]),false,'inverse mapping accepts a higher-resolution portrait');
 const scaledCut={width:120,height:160,pixels:alphaGrid(120,160,(x,y)=>x>=44&&x<=76&&y<116?255:0)};
 assert.equal(call(scaledCut,[.5,0,0,.5,0,0]),true,'inverse mapping still detects a cut-off neck after scaling');
 const rotated={width:80,height:80,pixels:alphaGrid(80,80,(x,y)=>80-y>=22&&80-y<=38?255:0)};
 assert.equal(call(rotated,[0,1,-1,0,80,0]),false,'inverse affine mapping handles portrait rotation');
 assert.equal(call({width,height,pixels:alphaGrid(width,height,()=>0)},[1,0,0,1,0,0],alphaGrid(nativeW,nativeH,()=>255)),false,'opaque cloth does not require hidden portrait pixels');
 assert.equal(call(covered,[0,0,0,0,0,0]),true,'singular transforms report unresolved neck coverage');
 assert.deepEqual(covered.pixels,beforePortrait);assert.deepEqual(previewPixels,beforeCloth);
}
assert.throws(()=>planStudioSuitGeometry({uniform:{},opening:[],face,head,suit:{}}));
console.log(`PASS ${count} fixed-garment geometry plans across all25catalogue PNGs: unchanged body frame/pose, proportional head scaling, first-pass eye normalization, shoulder/torso bounds, neck-cut independence and repeat stability. Plus9 actual V-coverage guard cases. Geometry coverage does not claim every short-neck/deep-V photo is fully fitted without manual adjustment.`);
