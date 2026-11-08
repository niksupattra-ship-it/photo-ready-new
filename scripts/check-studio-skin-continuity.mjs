import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {applyStudioSkinBase} from '../studio-skin-treatment.js';
import {applyStudioSkinSoftFocus} from '../studio-skin-soft-focus.js';
import {applyStudioSkinRetouch} from '../studio-skin-retouch.js';
import {repairStudioSkinContinuity} from '../studio-skin-continuity.js';

const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const BROWS=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
const LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const Y=(p,k)=>p[k]*.2126+p[k+1]*.7152+p[k+2]*.0722;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[j],b=p[i];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
function distance(x,y,p){let d=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);d=Math.min(d,Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t))}return d}
function fixture({width=560,height=700,colour=[166,124,103],delta=[16,11,-4],alreadyEven=false}={}){
 const face=Array.from({length:478},()=>[.5,.45]);OVAL.forEach((id,i)=>{const a=i/OVAL.length*Math.PI*2;face[id]=[.5+.27*Math.sin(a),.45-.34*Math.cos(a)]});
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const a=i/ids.length*Math.PI*2;face[id]=[cx+rx*Math.cos(a),cy+ry*Math.sin(a)]});
 ellipse(EYES[0],.38,.39,.06,.023);ellipse(EYES[1],.62,.39,.06,.023);ellipse(LIPS,.5,.65,.09,.026);
 const browPoints=[[[.29,.305],[.33,.287],[.37,.278],[.41,.282],[.45,.296],[.46,.316],[.42,.302],[.38,.298],[.34,.305],[.30,.322]],[[.54,.296],[.58,.282],[.62,.278],[.66,.287],[.70,.305],[.70,.322],[.66,.305],[.62,.298],[.58,.302],[.54,.316]]];
 BROWS.forEach((ids,j)=>ids.forEach((id,i)=>face[id]=browPoints[j][i]));face[98]=[.475,.52];face[327]=[.525,.52];
 const point=id=>[face[id][0]*width,face[id][1]*height],polys=[...EYES,...BROWS,LIPS].map(ids=>ids.map(point)),brows=BROWS.map(ids=>ids.map(point)),lips=LIPS.map(point),eyes=EYES.map(ids=>ids.map(point));
 const fw=Math.hypot(point(454)[0]-point(234)[0],point(454)[1]-point(234)[1]),oldGuard=Math.max(2,fw*.022),maskWidth=128,maskHeight=160,labels=Array(maskWidth*maskHeight).fill(0);
 const isSkin=(x,y)=>((x-.5)/.27)**2+((y-.45)/.34)**2<1;
 for(let y=0;y<maskHeight;y++)for(let x=0;x<maskWidth;x++)labels[y*maskWidth+x]=isSkin((x+.5)/maskWidth,(y+.5)/maskHeight)?3:0;
 const originalPixels=new Uint8ClampedArray(width*height*4),pixels=new Uint8ClampedArray(originalPixels.length),kind=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const n=y*width+x,k=n*4,label=labels[Math.min(maskHeight-1,Math.floor(y*maskHeight/height))*maskWidth+Math.min(maskWidth-1,Math.floor(x*maskWidth/width))],grain=1.2*Math.sin(x*1.7)*Math.cos(y*1.3);let rgb=[68,129,217],type=0;
  if(label===3){rgb=colour.map(v=>v+grain+5*(x/width-.5));type=1;
   if(eyes.some(p=>inside(x+.5,y+.5,p))){rgb=[38,44,49];type=4}
   if(inside(x+.5,y+.5,lips)){rgb=[154,65,80];type=3}
   if(brows.some(p=>inside(x+.5,y+.5,p))&&x%4<2){rgb=[36,25,21];type=2}
  }
  const alpha=x<3&&y<3?0:255;originalPixels.set([...rgb,alpha],k);pixels.set([...rgb,alpha],k);kind[n]=type;
  if(type===1&&(alreadyEven||!polys.some(p=>inside(x+.5,y+.5,p)||distance(x+.5,y+.5,p)<=oldGuard)))for(let c=0;c<3;c++)pixels[k+c]+=delta[c];
 }
 return{width,height,originalPixels,pixels,kind,delta,fw,evidence:{version:STUDIO_SKIN_WORKFLOW_VERSION,width,height,face,maskWidth,maskHeight,labels}};
}
function gap(f,p,id){
 const cx=f.evidence.face[id][0]*f.width,cy=f.evidence.face[id][1]*f.height,r=f.fw*.027;let error=0,count=0;
 for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(f.height,cy+r);y++)for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(f.width,cx+r);x++){
  const n=y*f.width+x,k=n*4;if(f.kind[n]!==1||Math.hypot(x+.5-cx,y+.5-cy)>r)continue;
  for(let c=0;c<3;c++)error+=Math.abs((p[k+c]-f.originalPixels[k+c])-f.delta[c]);count++;
 }
 return{error:error/Math.max(1,count*3),count};
}
let passed=0;const reports=[];async function test(name,run){const report=await run();passed++;reports.push({name,...report});console.log('PASS '+name)}
await test('hard brow/lip guard islands reproduce and neighbouring correction is continued into their skin',()=>{
 const f=fixture(),beforeSource=f.originalPixels.slice(),beforeProcessed=f.pixels.slice(),r=repairStudioSkinContinuity(f),sites=[55,285,61,291].map(id=>({id,before:gap(f,f.pixels,id),after:gap(f,r.pixels,id)}));
 for(const s of sites){assert(s.before.count>5);assert(s.before.error>5,JSON.stringify(s));assert(s.after.error<s.before.error*.45,JSON.stringify({sites,report:r.report}))}
 assert(r.changed&&r.report.status==='applied');assert.deepEqual(f.originalPixels,beforeSource);assert.deepEqual(f.pixels,beforeProcessed);return{sites,...r.report};
});
await test('actual brow pigment, entire lips/eyes, native alpha and all pixels outside the four local regions stay exact',()=>{
 const f=fixture(),r=repairStudioSkinContinuity(f),centres=[55,285,61,291].map(id=>[f.evidence.face[id][0]*f.width,f.evidence.face[id][1]*f.height]);let features=0,outside=0;
 for(let n=0;n<f.width*f.height;n++){
  const k=n*4,x=n%f.width,y=Math.floor(n/f.width);assert.equal(r.pixels[k+3],f.pixels[k+3]);
  const protectedFeature=f.kind[n]>=2,outsideRegions=!centres.some(p=>Math.hypot(x+.5-p[0],y+.5-p[1])<=Math.max(5,f.fw*.09));
  if(protectedFeature||outsideRegions){for(let c=0;c<4;c++)assert.equal(r.pixels[k+c],f.pixels[k+c],`${protectedFeature?'feature':'outside'} ${x},${y},${c}`);if(protectedFeature)features++;else outside++}
 }
 return{protectedFeaturePixels:features,outsideRegionPixels:outside};
});
await test('already continuous skin receives no invented brightening or colour cast',()=>{
 const f=fixture({alreadyEven:true}),r=repairStudioSkinContinuity(f);let sum=0,max=0,n=0;
 for(let k=0;k<f.pixels.length;k+=4)for(let c=0;c<3;c++){const d=Math.abs(r.pixels[k+c]-f.pixels[k+c]);sum+=d;max=Math.max(max,d);n++}
 assert(max<=1,{max});assert(sum/n<.005,{mean:sum/n});return{maxChannelDelta:max,meanChannelDelta:sum/n};
});
await test('correction follows the individual dark/warm source and can darken rather than whiten',()=>{
 const results=[];for(const colour of[[79,55,39],[206,160,110]])for(const delta of[[10,6,-3],[-12,-9,-5]]){
  const f=fixture({colour,delta}),r=repairStudioSkinContinuity(f),before=gap(f,f.pixels,55),after=gap(f,r.pixels,55);assert(after.error<before.error*.5,{colour,delta,before,after});results.push({colour,delta,before:before.error,after:after.error});
 }return{results};
});
await test('native texture remains while corrections feather without an outer-ring seam and work is local',()=>{
 const f=fixture({width:1000,height:1280}),t=performance.now(),r=repairStudioSkinContinuity(f),ms=performance.now()-t;
 assert(r.report.maxRegionPixels<150000);assert(ms<6000,{ms});let nearEdge=0,maxEdge=0;
 for(const id of[55,285,61,291]){const cx=f.evidence.face[id][0]*f.width,cy=f.evidence.face[id][1]*f.height,radius=f.fw*.09;for(let y=Math.floor(cy-radius-1);y<cy+radius+1;y++)for(let x=Math.floor(cx-radius-1);x<cx+radius+1;x++)if(x>0&&y>0&&x<f.width&&y<f.height&&Math.abs(Math.hypot(x+.5-cx,y+.5-cy)-radius)<1){const k=(y*f.width+x)*4;maxEdge=Math.max(maxEdge,...[0,1,2].map(c=>Math.abs(r.pixels[k+c]-f.pixels[k+c])));nearEdge++}}
 assert(maxEdge<=1,{maxEdge});return{milliseconds:ms,maxRegionPixels:r.report.maxRegionPixels,outerRingSamples:nearEdge,maxOuterRingDelta:maxEdge};
});
await test('invalid and mismatched frames fail without mutating either surface',()=>{
 const f=fixture();assert.throws(()=>repairStudioSkinContinuity({...f,width:f.width+1}),{code:'studio_skin_evidence_invalid'});assert.throws(()=>repairStudioSkinContinuity({...f,originalPixels:f.originalPixels.subarray(4)}),{code:'studio_skin_evidence_invalid'});assert.throws(()=>repairStudioSkinContinuity({...f,pixels:new Float32Array(f.pixels.length)}),{code:'studio_skin_evidence_invalid'});return{rejected:3};
});
await test('wide native faces keep all local correction fields within a fixed allocation bound',()=>{
 const sample=fixture({width:128,height:160}),width=3000,height=1200,pixels=new Uint8ClampedArray(width*height*4),evidence={...sample.evidence,width,height,face:structuredClone(sample.evidence.face)};
 evidence.face[234]=[0,.5];evidence.face[454]=[1,.5];
 const result=repairStudioSkinContinuity({originalPixels:pixels,pixels,width,height,evidence});
 assert.equal(result.pixels,pixels);assert.equal(result.changed,false);
 assert(result.report.maxRegionPixels>0&&result.report.maxRegionPixels<=698*698,JSON.stringify(result.report));
 return {nativePixels:width*height,maxRegionPixels:result.report.maxRegionPixels,maxAllowedRegionPixels:698*698};
});
if(process.env.STUDIO_CONTINUITY_FIXTURES)await test('actual directional-shadow input exhibits guard islands and corrected surrounding skin becomes more continuous',async()=>{
 const dir=process.env.STUDIO_CONTINUITY_FIXTURES,e=JSON.parse(await readFile(dir+'/evidence-directional-shadow.json','utf8')),{data,info}=await sharp(await readFile(dir+'/input-directional-shadow.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true}),W=info.width,H=info.height;
 const f={pixels:data,width:W,height:H,evidence:e},base=applyStudioSkinBase(f),soft=applyStudioSkinSoftFocus({...f,pixels:base.pixels}),retouch=applyStudioSkinRetouch({...f,pixels:soft.pixels}),fixed=repairStudioSkinContinuity({...f,originalPixels:data,pixels:retouch.pixels});
 const point=id=>[e.face[id][0]*W,e.face[id][1]*H],fw=Math.hypot(point(234)[0]-point(454)[0],point(234)[1]-point(454)[1]),features=[...EYES,...BROWS,LIPS].map(ids=>ids.map(point));
 function stats(p,id){const centre=point(id);let inner=0,ring=0,ni=0,nr=0;for(let y=Math.max(0,Math.floor(centre[1]-fw*.07));y<Math.min(H,centre[1]+fw*.07);y++)for(let x=Math.max(0,Math.floor(centre[0]-fw*.07));x<Math.min(W,centre[0]+fw*.07);x++){const n=y*W+x,k=n*4,d=Math.hypot(x+.5-centre[0],y+.5-centre[1]),label=e.labels[Math.floor(y*e.maskHeight/H)*e.maskWidth+Math.floor(x*e.maskWidth/W)];if(label!==3||features.some(poly=>inside(x+.5,y+.5,poly))||Y(data,k)<80||data[k]-data[k+1]>55)continue;const change=Y(p,k)-Y(data,k);if(d<fw*.027){inner+=change;ni++}if(d>fw*.045&&d<fw*.065){ring+=change;nr++}}return{inner:inner/ni,ring:ring/nr,gap:Math.abs(inner/ni-ring/nr),samples:ni}}
 const sites=[55,61].map(id=>({id,before:stats(retouch.pixels,id),after:stats(fixed.pixels,id)}));for(const s of sites){assert(s.before.gap>2,s);assert(s.after.gap<s.before.gap*.7,s)}return{sites,...fixed.report};
});
console.log(JSON.stringify({passed,reports,scope:'Actual local low-frequency correction continuity around inner brow heads and mouth corners; feature pigment, source pixels, alpha and native geometry preserved. No providers, network or customer writes.'}));
