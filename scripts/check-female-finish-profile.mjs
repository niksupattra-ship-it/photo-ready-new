import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createFemaleFinishProfile, isFemaleFinishProfile, matchFemaleFinishProfile } from '../src/female-finish-profile.js';

// Pixel fixtures are measured at the same face-normalized scale. Their skin
// colour, lighting gradient, marks, anatomy and segmentation are independent
// of the finish implementation; no browser or model output is required.
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

function fixture({tone=[76,10,18],darken=0,chroma=[0,0],roughness=.45,angle=0,size=420,hiddenForehead=false,rgba=false,protections=true}={}){
 const width=size,height=size,n=size*size,face=Array.from({length:478},()=>({x:.5,y:.5,z:0})),pixels=new Uint8ClampedArray(n*4),skin=new Float32Array(n),hair=new Float32Array(n),labels=new Uint8Array(n),cs=Math.cos(angle),sn=Math.sin(angle);
 const rotate=(x,y)=>({x:.5+(x-.5)*cs-(y-.5)*sn,y:.5+(x-.5)*sn+(y-.5)*cs,z:0});
 const put=(i,x,y)=>{face[i]=rotate(x,y)};
 // Face oval, cheeks, bridge, nose wings and lower face.
 for(const [i,x,y] of [[10,.5,.14],[109,.38,.15],[67,.30,.19],[103,.24,.24],[54,.20,.30],[21,.17,.36],[162,.15,.42],[127,.14,.46],[234,.14,.49],[93,.15,.56],[132,.18,.63],[58,.22,.70],[172,.28,.77],[136,.33,.82],[150,.39,.86],[149,.43,.88],[176,.47,.89],[148,.49,.90],[152,.5,.9],[377,.51,.90],[400,.53,.89],[378,.57,.88],[379,.61,.86],[365,.67,.82],[397,.72,.77],[288,.78,.70],[361,.82,.63],[323,.85,.56],[454,.86,.49],[356,.86,.46],[389,.85,.42],[251,.83,.36],[284,.80,.30],[332,.76,.24],[297,.70,.19],[338,.62,.15],[151,.5,.27],[168,.5,.39],[6,.5,.45],[197,.5,.47],[195,.5,.50],[5,.5,.53],[4,.5,.57],[1,.5,.59],[2,.5,.62],[98,.45,.60],[97,.46,.62],[99,.455,.61],[60,.43,.60],[327,.54,.62],[326,.545,.61],[328,.55,.60],[290,.57,.60],[94,.5,.625],[129,.43,.56],[358,.57,.56],[50,.29,.59],[101,.33,.56],[118,.25,.54],[280,.71,.59],[330,.67,.56],[347,.75,.54],[205,.30,.64],[425,.70,.64],[57,.35,.69],[287,.65,.69],[200,.5,.80],[199,.5,.84],[175,.5,.87]])put(i,x,y);
 for(let side=0;side<2;side++){
  const start=side?.59:.24;
  for(let j=0;j<9;j++){const t=j/8;put(U[side][j],start+.17*t,.405-.017*Math.sin(Math.PI*t));put(D[side][j],start+.17*t,.405+.017*Math.sin(Math.PI*t))}
  for(let j=0;j<10;j++){const t=j<5?j/4:(9-j)/4;put(B[side][j],start-.015+.20*t,j<5?.326-.009*Math.sin(Math.PI*t):.347-.009*Math.sin(Math.PI*t))}
 }
 for(let j=0;j<LIP.length;j++){const theta=Math.PI+j/LIP.length*2*Math.PI;put(LIP[j],.5+.105*Math.cos(theta),.715+.032*Math.sin(theta))}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=(x+.5)/size-.5,py=(y+.5)/size-.5,cx=.5+px*cs+py*sn,cy=.5-px*sn+py*cs,i=y*size+x,k=i*4;
  const faceInside=((cx-.5)/.36)**2+((cy-.515)/.385)**2<1;
  let label=faceInside?1:0,alpha=255,special=null;
  const shading=3.5*(cx-.5)+2.5*Math.cos((cy-.40)*6)+1.2*Math.sin(cx*12),fine=Math.sin(cx*680)*Math.cos(cy*620)+.6*Math.sin(cx*420+cy*610);
  let L=tone[0]-darken+shading+roughness*fine,a=tone[1]+chroma[0]+.35*Math.sin(cx*31),b=tone[2]+chroma[1]+.35*Math.cos(cy*29);
  if(faceInside){skin[i]=1;if(cy<.34)label=2;else if(cy>.49&&cy<.66&&Math.abs(cx-.5)>.08)label=3;else if(cy>.76)label=4}
  else {special=[35+Math.round(cx*8),48,60];skin[i]=0}
  for(let side=0;side<2;side++){
   const start=side?.59:.24,t=(cx-start)/.17;
   if(t>=0&&t<=1){const s=Math.sin(Math.PI*t);if(cy>=.405-.017*s-.002&&cy<=.405+.017*s+.002){label=5;special=Math.abs(cx-start-.085)<.027?[52,35,25]:[230,233,234];if(Math.hypot(cx-start-.077,cy-.400)<.005)special=[255,255,255]}}
   if(cx>start-.015&&cx<start+.185&&cy>.315&&cy<.349){label=6;special=[47,30,26]}
  }
  if(((cx-.5)/.105)**2+((cy-.715)/.032)**2<1){label=7;special=[161,42,72]}
  if(Math.hypot(cx-.458,cy-.611)<.012||Math.hypot(cx-.542,cy-.611)<.012){label=8;special=[38,21,19]}
  if(protections&&Math.hypot(cx-.335,cy-.57)<.008){label=9;special=rgb(Math.max(8,tone[0]-33),tone[1]+2,tone[2]-2)}
  if(protections&&Math.hypot(cx-.64,cy-.57)<.008){label=10;special=[253,251,247]}
  if(protections&&cx>.68&&cx<.72&&cy>.53&&cy<.57){label=11;hair[i]=1;special=[36,25,20]}
  if(protections&&cx>.28&&cx<.32&&cy>.62&&cy<.66){label=12;alpha=173}
  if(hiddenForehead&&cy<.35&&faceInside){label=13;hair[i]=1;skin[i]=0;special=[31,24,19]}
  labels[i]=label;const color=special||rgb(L,a,b);pixels[k]=color[0];pixels[k+1]=color[1];pixels[k+2]=color[2];pixels[k+3]=alpha;
 }
 let skinMask=skin,hairMask=hair;
 if(rgba){skinMask=new Uint8ClampedArray(n*4);hairMask=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++){skinMask[i*4+3]=Math.round(skin[i]*255);hairMask[i*4+3]=Math.round(hair[i]*255)}}
 return {pixels,width,height,face,skin:skinMask,hair:hairMask,labels,tone};
}

function samePixel(a,b,i){const k=i*4;return a[k]===b[k]&&a[k+1]===b[k+1]&&a[k+2]===b[k+2]&&a[k+3]===b[k+3]}
function labelLab(f,pixels,label){const values=[];for(let i=0;i<f.labels.length;i++)if(f.labels[i]===label){const k=i*4;values.push(lab(pixels[k],pixels[k+1],pixels[k+2]))}return [0,1,2].map(j=>median(values.map(v=>v[j])))}
function noOp(input,name){const result=matchFemaleFinishProfile(input);assert.equal(result.changed,false,name);assert.equal(result.pixels,input?.pixels,`${name}: buffer identity`);return result}
function validProfile(f,name){const original=f.pixels.slice(),profile=createFemaleFinishProfile(f);assert.ok(isFemaleFinishProfile(profile),`${name}: profile unavailable`);assert.deepEqual(f.pixels,original,`${name}: profile creation mutated input`);const json=JSON.stringify(profile);assert.ok(json.length<=16384,`${name}: profile must remain small`);assert.ok(isFemaleFinishProfile(JSON.parse(json)),`${name}: serialization roundtrip`);return JSON.parse(json)}
function verifyCorrection(source,candidate,name){
 const profile=validProfile(source,name),original=candidate.pixels.slice(),start=performance.now(),result=matchFemaleFinishProfile({...candidate,profile}),elapsed=performance.now()-start;
 assert.equal(result.changed,true,`${name}: measurable darker finish must be corrected`);
 assert.ok(result.report.comparableRegions>=2,`${name}: insufficient comparable finish evidence`);
 assert.ok(result.report.beforeToneError>result.report.afterToneError,`${name}: report must measure an improvement`);
 assert.notEqual(result.pixels,candidate.pixels,`${name}: output must be lazy-copy`);
 assert.deepEqual(candidate.pixels,original,`${name}: input pixels mutated`);
 assert.equal(result.pixels.length,original.length,`${name}: output geometry changed`);
 let changed=0;for(let i=0;i<candidate.labels.length;i++){
  const label=candidate.labels[i],k=i*4,different=!samePixel(original,result.pixels,i);changed+=Number(different);
  assert.equal(result.pixels[k+3],original[k+3],`${name}: alpha changed at ${i}`);
  if(label===0||label>=5)assert.equal(different,false,`${name}: protected/outside label ${label} changed at ${i}`);
 }
 assert.ok(changed>100,`${name}: correction is trivial`);
 const before=labelLab(candidate,original,3),after=labelLab(candidate,result.pixels,3),target=labelLab(source,source.pixels,3);
 assert.ok(after[0]>before[0]+.7,`${name}: measured cheek lightness did not improve`);
 assert.ok(Math.abs(after[0]-target[0])<Math.abs(before[0]-target[0]),`${name}: moves away from measured first finish`);
 assert.ok(after[0]<target[0]+1.5,`${name}: overshoots accepted skin lightness`);
 assert.ok(Math.hypot(after[1]-target[1],after[2]-target[2])<=Math.hypot(before[1]-target[1],before[2]-target[2])+.7,`${name}: chroma correction moves away from accepted finish`);
 assert.deepEqual(matchFemaleFinishProfile({...candidate,profile}).pixels,result.pixels,`${name}: output is nondeterministic`);
 summaries.push({name,changedPixels:changed,cheekLightnessBefore:Number(before[0].toFixed(2)),cheekLightnessAfter:Number(after[0].toFixed(2)),accepted:Number(target[0].toFixed(2)),elapsedMs:Math.round(elapsed)});
 return {profile,result};
}

const tones=[['light',[76,10,18]],['medium',[56,16,23]],['deep',[34,13,16]]];
for(const [name,tone] of tones){const accepted=fixture({tone}),candidate=fixture({tone,darken:6,chroma:[2,-1],roughness:2.3});const {profile}=verifyCorrection(accepted,candidate,name);noOp({...accepted,profile},`${name}: accepted finish is exact no-op`)}
for(const angle of [Math.PI/6,-Math.PI*.20])verifyCorrection(fixture({tone:[56,16,23],angle}),fixture({tone:[56,16,23],darken:6,roughness:2,angle}),`roll ${Math.round(angle*180/Math.PI)} degrees`);
const base=fixture(),profile=validProfile(base,'base'),dark=fixture({darken:6,roughness:2.2});
const rgba=fixture({darken:6,roughness:2.2,rgba:true});
assert.deepEqual(matchFemaleFinishProfile({...dark,profile}).pixels,matchFemaleFinishProfile({...rgba,profile}).pixels,'normalized and RGBA masks disagree');
const hiddenSource=fixture({hiddenForehead:true}),hiddenCandidate=fixture({hiddenForehead:true,darken:6});
verifyCorrection(hiddenSource,hiddenCandidate,'hidden forehead: independent visible skin');
verifyCorrection(base,hiddenCandidate,'new forehead occlusion');
const hiddenProfile=validProfile(hiddenSource,'forehead hidden at acceptance'),uncovered=fixture({darken:6}),uncoveredResult=matchFemaleFinishProfile({...uncovered,profile:hiddenProfile});
assert.equal(uncoveredResult.changed,true,'visible comparable cheeks should still match when forehead is newly exposed');
let nativeForehead=0;for(let y=Math.ceil(uncovered.height*.20);y<uncovered.height*.24;y++)for(let x=Math.ceil(uncovered.width*.40);x<uncovered.width*.60;x++){const i=y*uncovered.width+x;assert.ok(samePixel(uncovered.pixels,uncoveredResult.pixels,i),'newly exposed forehead has no accepted reference and must remain native');nativeForehead++}
assert.ok(nativeForehead>500,'newly exposed forehead core assertion is trivial');
const severeDrift=noOp({...fixture({darken:25}),profile},'drift outside safe correction bound');
assert.equal(severeDrift.report.status,'limited','coherent drift beyond safe bounds must be reported as limited');
assert.ok(severeDrift.report.comparableRegions>=2,'limited report lost comparable evidence');
noOp(undefined,'missing input');
noOp({...dark,profile:null},'missing profile');
noOp({...dark,profile:{}},'empty profile');
noOp({...dark,profile:{...profile,version:999}},'unknown profile version');
noOp({...dark,profile,width:NaN},'invalid dimensions');
noOp({...dark,profile,width:4096,height:4096},'over 8 MP');
noOp({...dark,profile,skin:new Float32Array(3)},'wrong mask length');
noOp({...dark,profile,skin:new Float32Array(dark.width*dark.height).fill(NaN)},'NaN skin evidence');
noOp({...dark,profile,hair:new Float32Array(dark.width*dark.height).fill(Infinity)},'infinite hair evidence');
noOp({...dark,profile,skin:new Float32Array(dark.width*dark.height).fill(1.1)},'out of range skin evidence');
noOp({...dark,profile,skin:new Float32Array(dark.width*dark.height)},'no reliable skin evidence');
noOp({...dark,profile,hair:new Float32Array(dark.width*dark.height).fill(1)},'fully hair occluded');
const malformed=structuredClone(dark.face);malformed[234].x=NaN;noOp({...dark,profile,face:malformed},'nonfinite face landmarks');
const small=dark.face.map(p=>({...p,x:.5+(p.x-.5)*.08,y:.5+(p.y-.5)*.08}));noOp({...dark,profile,face:small},'face too small');
for(const value of [null,{},[],true,1,'profile',{...profile,version:Infinity}])assert.equal(isFemaleFinishProfile(value),false,'corrupt profile accepted');
function corruptNumbers(value){if(Array.isArray(value))return value.map(corruptNumbers);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,corruptNumbers(v)]));return typeof value==='number'?NaN:value}
assert.equal(isFemaleFinishProfile(corruptNumbers(profile)),false,'nonfinite nested profile accepted');
function unboundNumbers(value){if(Array.isArray(value))return value.map(unboundNumbers);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='version'?v:unboundNumbers(v)]));return typeof value==='number'?1e12:value}
assert.equal(isFemaleFinishProfile(unboundNumbers(profile)),false,'unbounded nested profile accepted');
assert.equal(createFemaleFinishProfile({...base,skin:null}),null,'profile created without skin evidence');
assert.equal(createFemaleFinishProfile({...base,hair:null}),null,'profile created without hair evidence');
// Texture matching must stop when the accepted scale is reached. The second
// pass may finish a quantized tone residual, but must not keep erasing pores.
const rough=fixture({roughness:1.4,protections:false}),firstTexture=matchFemaleFinishProfile({...rough,profile});
assert.equal(firstTexture.changed,true,'measurably rougher texture was left unchanged');
assert.ok(firstTexture.report.textureChangedPixels>100,'roughness correction must refine measured texture');
const roughBefore=validProfile(rough,'roughness before'),roughAfter=validProfile({...rough,pixels:firstTexture.pixels},'roughness after');
const regionRoughness=p=>median(p.regions.filter(r=>['forehead','leftCheek','rightCheek','chin'].includes(r.id)).map(r=>r.roughness));
assert.ok(regionRoughness(roughAfter)<regionRoughness(roughBefore)-.05,'measured low-contrast roughness did not improve');
const secondTexture=matchFemaleFinishProfile({...rough,pixels:firstTexture.pixels,profile});
assert.equal(secondTexture.report.textureChangedPixels,0,'matched texture must not be smoothed again');
let firstDistance=0,secondDistance=0;for(let i=0;i<rough.labels.length;i++)if(rough.labels[i]===3){const k=i*4;firstDistance+=Math.abs(rough.pixels[k]-firstTexture.pixels[k]);secondDistance+=Math.abs(firstTexture.pixels[k]-secondTexture.pixels[k])}
assert.ok(secondDistance<firstDistance*.55,'repeated matching keeps smoothing texture');
summaries.push({name:'texture convergence',firstPixelDistance:firstDistance,secondPixelDistance:secondDistance});
// Higher cheek anchors leave a sparsely supported transition to the chin.
// A hard cutoff on the sum of regional weights used to leave triangular jaw
// islands unchanged beside pixels receiving the full six-L* correction.
// These continuous native-skin rows sit outside lip and face-edge feathers.
const jawAccepted=fixture({size:600,roughness:0,protections:false}),jawNative=fixture({size:600,roughness:0,protections:false,darken:6});
for(const f of [jawAccepted,jawNative])for(const id of [50,101,118,280,330,347])f.face[id].y-=.10;
const jawProfile=validProfile(jawAccepted,'high-cheek jaw continuity'),jawResult=matchFemaleFinishProfile({...jawNative,profile:jawProfile});
assert.equal(jawResult.changed,true,'jaw continuity fixture was not corrected');
let jawPairs=0,maxJawStep=0,minJawCorrection=Infinity;
for(const [left,right] of [[.285,.352],[.648,.715]])for(let y=Math.ceil(jawNative.height*.728);y<jawNative.height*.742;y++)for(let x=Math.ceil(jawNative.width*left);x<jawNative.width*right-1;x++){
 const i=y*jawNative.width+x,j=i+1,k=i*4,k2=j*4;
 assert.equal(jawNative.labels[i],1,'jaw regression entered a protected feature');
 assert.equal(jawNative.labels[j],1,'jaw regression entered a protected feature');
 const before=lab(...jawNative.pixels.slice(k,k+3))[0],after=lab(...jawResult.pixels.slice(k,k+3))[0],nextBefore=lab(...jawNative.pixels.slice(k2,k2+3))[0],nextAfter=lab(...jawResult.pixels.slice(k2,k2+3))[0],delta=after-before,nextDelta=nextAfter-nextBefore,step=Math.abs(nextDelta-delta);
 assert.ok(delta>3&&nextDelta>3,'native skin between measured cheek and chin was left as an unchanged island');
 assert.ok(step<.8,`jaw correction has a hard adjacent-pixel edge: ${step.toFixed(3)} L*`);
 maxJawStep=Math.max(maxJawStep,step);minJawCorrection=Math.min(minJawCorrection,delta,nextDelta);jawPairs++;
}
assert.ok(jawPairs>500,'jaw continuity regression sampled too few adjacent native-skin pixels');
summaries.push({name:'jaw field continuity',adjacentPairs:jawPairs,maxCorrectionStep:Number(maxJawStep.toFixed(3)),minimumCorrection:Number(minJawCorrection.toFixed(3))});
// A true resolution-class smoke test catches accidental full-frame masks or
// quadratic work while leaving enough headroom for slower CI machines.
const large=fixture({size:2000,darken:6,roughness:.45,protections:false}),largeStart=performance.now(),largeResult=matchFemaleFinishProfile({...large,profile}),largeMs=performance.now()-largeStart;
assert.equal(largeResult.changed,true,'4 MP finish matching failed');
assert.equal(largeResult.pixels.length,large.pixels.length,'4 MP geometry changed');
assert.ok(largeResult.report.changedPixels>10000,'4 MP correction is trivial');
assert.ok(largeMs<20000,`4 MP match exceeded bounded runtime: ${Math.round(largeMs)} ms`);
summaries.push({name:'4 MP bounded runtime',changedPixels:largeResult.report.changedPixels,elapsedMs:Math.round(largeMs)});
console.log(JSON.stringify({status:'PASS',checks:'measured light/medium/deep tone continuity, texture convergence, exact no-ops, protected anatomy/marks/hair/alpha, rotations, occlusion, bounded profile serialization, invalid evidence',fixtures:summaries},null,2));
