import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { finishFemaleMakeupEyeTone } from '../src/female-makeup-eye-tone.js';

// Pixel fixtures deliberately contain eye whites/iris/catchlights, red lips,
// dark brows, translucent pixels, misclassified dark lash hairs, native skin
// texture and varying pigment. Assertions examine output pixels, not source text.
const U=[[33,246,161,160,159,158,157,173,133],[362,398,384,385,386,387,388,466,263]];
const D=[[33,7,163,144,145,153,154,155,133],[362,382,381,380,374,373,390,249,263]];
const B=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
const LIP=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const gamma=v=>255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function rgb(L,a,b){const y=(L+16)/116,x=y+a/500,z=y-b/200,f=v=>v**3>.008856451679?v**3:(v-16/116)/7.787037037;const X=.95047*f(x),Y=f(y),Z=1.08883*f(z);return [gamma(3.2404542*X-1.5371385*Y-.4985314*Z),gamma(-.969266*X+1.8760108*Y+.041556*Z),gamma(.0556434*X-.2040259*Y+1.0572252*Z)].map(v=>clamp(Math.round(v),0,255))}
function lab(r,g,b){const lin=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;r=lin(r);g=lin(g);b=lin(b);const f=v=>v>.008856451679?Math.cbrt(v):v*7.787037037+16/116;const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return [116*y-16,500*(x-y),200*(y-z)]}
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
const summaries=[];
function fixture({tone=[78,9,17],angle=0,size=512,natural=false,blueShadow=false,pigmentA=16,pigmentB=12,fillOrbit=false,protections=true,rgba=false}={}){
 const width=size,height=size,n=size*size,face=Array.from({length:478},()=>({x:.5,y:.5,z:0})),pixels=new Uint8ClampedArray(n*4),skin=new Float32Array(n).fill(1),hair=new Float32Array(n),labels=new Uint8Array(n),cs=Math.cos(angle),sn=Math.sin(angle);
 const rotate=(x,y)=>({x:.5+(x-.5)*cs-(y-.5)*sn,y:.5+(x-.5)*sn+(y-.5)*cs,z:0});
 const put=(i,x,y)=>{face[i]=rotate(x,y)};
 put(234,.12,.48);put(454,.88,.48);
 for(let s=0;s<2;s++){
  const start=s?.57:.25;
  for(let j=0;j<9;j++){const t=j/8;put(U[s][j],start+.18*t,.40-.018*Math.sin(Math.PI*t));put(D[s][j],start+.18*t,.40+.018*Math.sin(Math.PI*t))}
  for(let j=0;j<10;j++){const t=j<5?j/4:(9-j)/4;put(B[s][j],start-.014+.208*t,j<5?.306-.008*Math.sin(Math.PI*t):.325-.008*Math.sin(Math.PI*t))}
  const anchors=s?[280,330,347]:[50,101,118];
  [[start+.01,.60],[start+.10,.575],[start-.01,.55]].forEach((p,j)=>put(anchors[j],...p));
 }
 for(let i=0;i<LIP.length;i++){const theta=i/LIP.length*2*Math.PI;put(LIP[i],.5+.105*Math.cos(theta),.72+.035*Math.sin(theta))}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=(x+.5)/size-.5,py=(y+.5)/size-.5,cx=.5+px*cs+py*sn,cy=.5-px*sn+py*cs,i=y*size+x,k=i*4;
  let L=tone[0]+(cx-.5)*3+(cy-.5)*2+1.4*Math.sin(cx*400)*Math.cos(cy*360),a=tone[1]+.18*Math.sin(cx*120),b=tone[2]+.18*Math.cos(cy*140),special=null,alpha=255;
  // Label 1: an intentionally generous independent orbital bounding box.
  // Every other pixel must be exactly identical after correction.
  for(let s=0;s<2;s++){
   const start=s?.57:.25,t=(cx-start)/.18;
   if(t<-.08||t>1.08||cy<.32||cy>.51)continue;
   labels[i]=1;
   const sin=Math.sin(Math.PI*clamp(t,0,1)),upper=.40-.018*sin,lower=.40+.018*sin;
   const pigment=fillOrbit||t>.02&&t<.98&&((cy>.345&&cy<upper-.003)||(cy>lower+.003&&cy<.485));
   if(pigment){const coolLower=blueShadow&&cy>lower;a+=coolLower?0:natural?.8:pigmentA+1.5*Math.sin(t*8);b-=coolLower?10:natural?.5:pigmentB+Math.cos(cy*70);if(t>.3&&t<.7&&cy>.35&&cy<.365)labels[i]=2;if(t>.3&&t<.7&&cy>.445&&cy<.465)labels[i]=3}
   // Protect actual eye aperture, plus independently selected boundary pixels.
   if(t>=0&&t<=1&&cy>=upper-.003&&cy<=lower+.003){labels[i]=4;special=Math.abs(cx-(start+.09))<.032?[40,29,24]:[226,228,229];if(Math.hypot(cx-(start+.08),cy-.395)<.006)special=[255,255,255]}
   if(cx>start-.014&&cx<start+.194&&cy>.295&&cy<.328){labels[i]=5;special=[54,35,30]}
   if(protections&&t>.12&&t<.22&&cy>.35&&cy<.366){hair[i]=1;labels[i]=6}
   if(protections&&t>.74&&t<.84&&cy>.447&&cy<.467){alpha=219;labels[i]=7}
   if(protections&&t>.47&&t<.51&&cy>.354&&cy<.362){special=[18,14,12];labels[i]=8}
   if(protections&&Math.hypot(cx-(start+.13),cy-.357)<.004){special=[250,250,250];labels[i]=9}
  }
  if(((cx-.5)/.105)**2+((cy-.72)/.035)**2<1){labels[i]=10;special=[177,36,73]}
  const color=special||rgb(L,a,b);pixels[k]=color[0];pixels[k+1]=color[1];pixels[k+2]=color[2];pixels[k+3]=alpha;
 }
 let skinMask=skin,hairMask=hair;
 if(rgba){skinMask=new Uint8ClampedArray(n*4);hairMask=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++){skinMask[i*4+3]=Math.round(skin[i]*255);hairMask[i*4+3]=Math.round(hair[i]*255)}}
 return {pixels,width,height,face,skin:skinMask,hair:hairMask,labels,tone,pigmentA};
}
function samePixel(a,b,i){const k=i*4;return a[k]===b[k]&&a[k+1]===b[k+1]&&a[k+2]===b[k+2]&&a[k+3]===b[k+3]}
function verifyCorrection(f,name){
 const before=f.pixels.slice(),start=performance.now(),result=finishFemaleMakeupEyeTone(f),elapsed=performance.now()-start;
 assert.equal(result.changed,true,`${name}: clear pink pigment must be corrected`);
 assert.deepEqual(f.pixels,before,`${name}: input pixels mutated`);
 assert.ok(result.report.changedPixels>100,`${name}: only a trivial correction`);
 const changes=[0,0,0,0],pinkBefore=[[],[]],pinkAfter=[[],[]],beforeA=[[],[]],afterA=[[],[]],afterB=[[],[]],lBefore=[],lAfter=[];
 let maxL=0;
 for(let i=0;i<f.labels.length;i++){
  const label=f.labels[i],k=i*4,changed=!samePixel(before,result.pixels,i);
  assert.equal(result.pixels[k+3],before[k+3],`${name}: alpha changed`);
  if(label===0||label>=4)assert.equal(changed,false,`${name}: protected/outside pixel ${i}, label ${label} changed`);
  if(!changed)continue;
  changes[label]++;
  const a=lab(before[k],before[k+1],before[k+2]),b=lab(result.pixels[k],result.pixels[k+1],result.pixels[k+2]);
  maxL=Math.max(maxL,Math.abs(a[0]-b[0]));
  assert.ok(Math.abs(a[0]-b[0])<.55,`${name}: native lightness changed beyond RGB quantization`);
  assert.ok(Math.abs(a[1]-b[1])<(label===3?6.55:7.55),`${name}: red chroma cap exceeded`);
  assert.ok(Math.abs(a[2]-b[2])<4.55,`${name}: blue/yellow chroma cap exceeded`);
  if(label===2||label===3){const j=label-2;pinkBefore[j].push(a[1]-.48*a[2]);pinkAfter[j].push(b[1]-.48*b[2]);beforeA[j].push(a[1]);afterA[j].push(b[1]);afterB[j].push(b[2]);if(label===3){lBefore.push(a[0]);lAfter.push(b[0])}}
 }
 for(const [j,band] of ['upper','lower'].entries()){
  assert.ok(pinkAfter[j].length>20,`${name}: ${band} core was not corrected`);
  assert.ok(median(pinkBefore[j])-median(pinkAfter[j])>3.5,`${name}: ${band} lacks a clear conservative pink reduction`);
  const avg=a=>a.reduce((s,v)=>s+v,0)/a.length,meanBefore=avg(beforeA[j]),meanAfter=avg(afterA[j]);
  const variance=beforeA[j].reduce((sum,v)=>sum+(v-meanBefore)**2,0),covariance=beforeA[j].reduce((sum,v,k)=>sum+(v-meanBefore)*(afterA[j][k]-meanAfter),0);
  // A cap preserves the native colour gradient; quantization tolerance allows
  // slightly less than the requested 30% on the smaller upper-lid core.
  assert.ok(covariance/variance>.25,`${name}: ${band} native chroma gradient flattened`);
  if(f.pigmentA<10){assert.ok(Math.abs(median(afterA[j])-f.tone[1])<5,`${name}: ${band} reference failed to adapt to native skin redness`);assert.ok(Math.abs(median(afterB[j])-f.tone[2])<5,`${name}: ${band} reference failed to adapt to native skin warmth`)}
 }
 assert.ok(Math.max(...lBefore)-Math.min(...lBefore)>2,`${name}: fixture lacks texture/gradient`);
 assert.ok(Math.abs((Math.max(...lAfter)-Math.min(...lAfter))-(Math.max(...lBefore)-Math.min(...lBefore)))<.7,`${name}: luminance texture/gradient flattened`);
 for(const side of ['leftEye','rightEye']){
  assert.equal(result.report.regions[side].status,'changed',`${name}: ${side} unavailable`);
  assert.ok(result.report.regions[side].upper.changedPixels>20);
  assert.ok(result.report.regions[side].lower.changedPixels>20);
 }
 summaries.push({name,changedPixels:result.report.changedPixels,upperCore:changes[2],lowerCore:changes[3],maxLightnessError:Number(maxL.toFixed(3)),elapsedMs:Math.round(elapsed)});
 return result;
}
function noOp(f,name){const result=finishFemaleMakeupEyeTone(f);assert.equal(result.changed,false,name);assert.equal(result.pixels,f?.pixels,`${name}: original buffer identity must survive`);return result}

const light=fixture();
const first=verifyCorrection(light,'light');
assert.deepEqual(finishFemaleMakeupEyeTone(light).pixels,first.pixels,'deterministic output');
verifyCorrection(fixture({tone:[56,16,23]}),'medium');
verifyCorrection(fixture({tone:[32,13,16]}),'deep');
for(const [name,tone] of [['light',[78,9,17]],['medium',[56,16,23]],['deep',[32,13,16]]])verifyCorrection(fixture({tone,pigmentA:7,pigmentB:5}),`${name} moderate pigment reference adaptation`);
verifyCorrection(fixture({angle:Math.PI/6}),'rolled +30 degrees');
verifyCorrection(fixture({angle:-Math.PI*.205,tone:[56,16,23]}),'rolled -36.9 degrees');
const rgba=verifyCorrection(fixture({rgba:true}),'RGBA confidence masks');
assert.deepEqual(rgba.pixels,first.pixels,'RGBA and normalized confidence masks disagree');
const continuous=fixture({fillOrbit:true,protections:false}),continuousResult=finishFemaleMakeupEyeTone(continuous);
assert.equal(continuousResult.changed,true,'continuous orbital pigment must be corrected');
for(const centerX of [.34,.66]){
 let previous=null;
 for(let y=Math.floor(.33*continuous.height);y<Math.ceil(.505*continuous.height);y++){
  const k=(y*continuous.width+Math.floor(centerX*continuous.width))*4,a=lab(...continuous.pixels.slice(k,k+3)),b=lab(...continuousResult.pixels.slice(k,k+3)),delta=[a[1]-b[1],a[2]-b[2]];
  if(previous)assert.ok(Math.hypot(delta[0]-previous[0],delta[1]-previous[1])<2.5,'mask feather introduces a hard chroma edge');
  previous=delta;
 }
}
for(const tone of [[78,9,17],[56,16,23],[32,13,16]])noOp(fixture({tone,natural:true}),'already subtle nude skin');
for(const tone of [[78,9,17],[56,16,23],[32,13,16]])noOp(fixture({tone,natural:true,blueShadow:true}),'natural cool under-eye shading');
noOp(undefined,'missing input');
noOp({...light,width:NaN},'invalid dimensions');
noOp({...light,width:4096,height:4096},'image above memory limit');
noOp({...light,skin:new Float32Array(3)},'wrong mask length');
noOp({...light,skin:new Float32Array(light.width*light.height).fill(NaN)},'NaN mask evidence');
noOp({...light,hair:new Float32Array(light.width*light.height).fill(Infinity)},'infinite mask evidence');
noOp({...light,skin:new Float32Array(light.width*light.height).fill(1.2)},'out of range mask evidence');
noOp({...light,skin:new Float32Array(light.width*light.height)},'occluded / absent skin evidence');
noOp({...light,hair:new Float32Array(light.width*light.height).fill(1)},'hair occlusion');
const whiteReference=light.pixels.slice();for(let i=0;i<light.labels.length;i++)if(light.labels[i]!==1&&light.labels[i]!==2&&light.labels[i]!==3){whiteReference[i*4]=255;whiteReference[i*4+1]=255;whiteReference[i*4+2]=255}
noOp({...light,pixels:whiteReference},'white/specular reference is not neutral skin evidence');
const badFace=structuredClone(light.face);badFace[234].x=NaN;
noOp({...light,face:badFace},'NaN face geometry');
const tinyFace=light.face.map(p=>({...p,x:.5+(p.x-.5)*.1,y:.5+(p.y-.5)*.1}));
noOp({...light,face:tinyFace},'too small face');
const closedFace=structuredClone(light.face);for(let s=0;s<2;s++)for(let j=0;j<9;j++)closedFace[D[s][j]]={...closedFace[U[s][j]]};
noOp({...light,face:closedFace},'closed / unreliable eye geometry');
const crossedFace=structuredClone(light.face);crossedFace[160].x=crossedFace[33].x-.03;crossedFace[385].x=crossedFace[362].x-.03;
noOp({...light,face:crossedFace},'self-crossing / backward eyelid contour');
const invertedBrow=structuredClone(light.face);for(const id of B.flat())invertedBrow[id].y=.6;
noOp({...light,face:invertedBrow},'invalid brow orientation');
const oneBadEye=structuredClone(light.face);oneBadEye[159].y=NaN;
const partial=finishFemaleMakeupEyeTone({...light,face:oneBadEye});
assert.equal(partial.report.regions.leftEye.status,'unavailable','invalid side must fail open');
assert.equal(partial.report.regions.rightEye.status,'changed','independent reliable side should remain usable');
for(let y=0;y<light.height;y++)for(let x=0;x<light.width/2;x++){const i=y*light.width+x;assert.ok(samePixel(light.pixels,partial.pixels,i),'invalid eye side was partially painted')}

// 4 MP smoke test exercises the real resolution class without a full-frame
// processing mask. The generous ceiling detects accidental quadratic work.
const large=fixture({size:2000,protections:false}),largeStart=performance.now();
const largeResult=finishFemaleMakeupEyeTone(large),largeMs=performance.now()-largeStart;
assert.equal(largeResult.changed,true,'4 MP correction failed');
assert.ok(largeMs<10000,`4 MP control exceeded bounded runtime: ${largeMs.toFixed(0)} ms`);
assert.equal(largeResult.pixels.length,large.pixels.length);
assert.ok(largeResult.report.changedPixels<large.width*large.height*.08,'4 MP pass spilled beyond local eye regions');
summaries.push({name:'4 MP bounded runtime',changedPixels:largeResult.report.changedPixels,elapsedMs:Math.round(largeMs)});
console.log(JSON.stringify({status:'PASS',checks:'skin-tone adaptation, both eyelids, rotations, opacity, protected anatomy, fail-open evidence, deterministic masks, L* texture and 4 MP bounds',fixtures:summaries},null,2));
