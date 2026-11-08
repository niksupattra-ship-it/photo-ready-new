import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {normalizeStudioReferenceIllumination} from '../studio-reference-illumination.js';

const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const Y=(r,g,b)=>r*.2126+g*.7152+b*.0722;
function inside(x,y,p){let result=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result}return result}
function fixture({skin=[184,143,124],illumination=[1,1,1],eyeColours=[[190,180,185],[190,180,185]],shadowLeft=false,hideEyes=false,catchlights=false}={}){
 const width=512,height=640,face=Array.from({length:478},()=>[.5,.48]),pixels=new Uint8ClampedArray(width*height*4);
 OVAL.forEach((id,i)=>{const a=i/OVAL.length*Math.PI*2;face[id]=[.5+.28*Math.sin(a),.44-.34*Math.cos(a)]});
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const a=i/ids.length*Math.PI*2;face[id]=[cx+rx*Math.cos(a),cy+ry*Math.sin(a)]});
 ellipse(EYES[0],.36,.36,.075,.028);ellipse(EYES[1],.64,.36,.075,.028);
 const eyePolygons=EYES.map(ids=>ids.map(id=>[face[id][0]*width,face[id][1]*height])),eyeCentres=[[.36*width,.36*height],[.64*width,.36*height]];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let rgb=[...skin];
  for(let side=0;side<2;side++)if(inside(x+.5,y+.5,eyePolygons[side])){
   const [cx,cy]=eyeCentres[side],iris=((x+.5-cx)/(width*.025))**2+((y+.5-cy)/(height*.026))**2<1;
   rgb=hideEyes?[14,12,10]:iris?[28,23,21]:eyeColours[side];
   if(catchlights&&x>=cx-width*.05&&x<cx-width*.05+3&&y>=cy&&y<cy+3)rgb=[255,255,255];
  }
  const exposure=shadowLeft&&x<width*.5?.45:1;
  pixels.set([...rgb.map((v,c)=>Math.round(v*illumination[c]*exposure)),255],(y*width+x)*4);
 }
 return {pixels,width,height,evidence:{version:STUDIO_SKIN_WORKFLOW_VERSION,width,height,face,maskWidth:128,maskHeight:160,labels:new Uint8Array(128*160).fill(3)}};
}
let passed=0;const reports=[];
async function test(name,run){const report=await run();passed++;reports.push({name,...report});console.log('PASS '+name)}
const at=(f,x,y)=>4*(Math.floor(y*f.height)*f.width+Math.floor(x*f.width));

await test('already neutral-exposed sclera leaves the whole portrait sample-for-sample unchanged',()=>{
 const f=fixture(),r=normalizeStudioReferenceIllumination(f);assert.equal(r.changed,false);assert.equal(r.pixels,f.pixels);assert.equal(r.report.reason,'already-neutral-exposed');
 assert(r.report.eyes.every(e=>e.valid));return {gains:r.report.gains};
});
await test('32MP inputs with enormous or malformed eye polygons keep sampling and sort storage bounded',()=>{
 const f=fixture(),width=8192,height=4096,pixels=new Uint8ClampedArray(width*height*4);
 // The neutral constant frame avoids allocating a second native output buffer.
 new Uint32Array(pixels.buffer).fill(0xffb9b4be);
 const evidence={...f.evidence,width,height,face:structuredClone(f.evidence.face)};
 for(const ids of EYES)ids.forEach((id,i)=>{const a=i/ids.length*Math.PI*2;evidence.face[id]=[.5+.75*Math.cos(a),.5+.75*Math.sin(a)]});
 const before=pixels.slice(0,16),r=normalizeStudioReferenceIllumination({pixels,width,height,evidence});
 assert.equal(r.changed,false);assert.equal(r.pixels,pixels);assert.deepEqual(pixels.slice(0,16),before);
 for(const eye of r.report.eyes){assert(eye.samplingStep>1);assert(eye.analyzedCells>0&&eye.analyzedCells<=8192);assert.equal(eye.maxSampleCells,8192);assert(eye.samples.reduce((a,b)=>a+b,0)<=8192)}
 const typical=normalizeStudioReferenceIllumination(f);assert(typical.report.eyes.every(eye=>eye.samplingStep===1));
 return {nativePixels:width*height,eyes:r.report.eyes.map(({samplingStep,analyzedCells,samples})=>({samplingStep,analyzedCells,samples}))};
});
await test('warm dim illumination restores the same person rather than targeting a fixed skin colour',()=>{
 const values=[];
 for(const skin of [[184,143,124],[55,34,22],[90,64,48],[205,155,103]]){
  const original=fixture({skin}),warm=fixture({skin,illumination:[.67,.59,.44]}),r=normalizeStudioReferenceIllumination(warm),k=at(warm,.5,.55);
  assert(r.changed&&r.report.castCorrection&&r.report.exposureCorrection);
  const corrected=Array.from(r.pixels.slice(k,k+3)),expected=Array.from(original.pixels.slice(k,k+3));assert(corrected.every((v,c)=>Math.abs(v-expected[c])<=2),JSON.stringify({skin,corrected,expected}));
  values.push({skin,corrected});
 }
 return {complexions:values};
});
await test('neutral underexposure and overexposure use physical eye exposure cues with bounded gains',()=>{
 for(const factor of [.65,1.25]){
  const f=fixture({illumination:[factor,factor,factor]}),r=normalizeStudioReferenceIllumination(f),k=at(f,.5,.55);
  assert(r.changed&&r.report.exposureCorrection);assert(Array.from(r.pixels.slice(k,k+3)).every((v,c)=>Math.abs(v-[184,143,124][c])<=2));
 }
 const bounded=fixture({eyeColours:[[60,40,30],[60,40,30]]}),r=normalizeStudioReferenceIllumination(bounded);assert(r.report.gains.every(v=>v>=.65&&v<=3));return {boundedGains:r.report.gains};
});
await test('a one-sided eye shadow does not bleach the already lit side of the photograph',()=>{
 const f=fixture({shadowLeft:true}),r=normalizeStudioReferenceIllumination(f);assert.equal(r.report.referenceEye,1);assert.equal(r.changed,false);assert.equal(r.pixels,f.pixels);return {eyeLuminance:r.report.eyes.map(e=>e.luma)};
});
await test('missing, clipped or non-neutral sclera and disagreeing eye illuminants fail safe unchanged',()=>{
 const inputs=[fixture({hideEyes:true}),fixture({eyeColours:[[255,255,255],[255,255,255]]}),fixture({eyeColours:[[180,80,70],[180,80,70]]}),fixture({eyeColours:[[210,170,100],[210,170,100]]}),fixture({eyeColours:[[126,106,81],[100,115,140]]})];
 const reasons=[];
 for(const f of inputs){const r=normalizeStudioReferenceIllumination(f);assert.equal(r.changed,false);assert.equal(r.pixels,f.pixels);reasons.push(r.report.reason)}
 const glint=normalizeStudioReferenceIllumination(fixture({catchlights:true}));assert.equal(glint.changed,false);return {fallbackReasons:reasons};
});
await test('whole-image calibration is continuous across feature regions and keeps native alpha and uploaded samples immutable',()=>{
 const f=fixture({illumination:[.67,.59,.44]}),before=new Uint8ClampedArray(f.pixels),evidence=structuredClone(f.evidence);
 for(let k=0;k<f.pixels.length;k+=4)if(k%68===0){f.pixels[k+3]=0;before[k+3]=0}else if(k%76===0){f.pixels[k+3]=128;before[k+3]=128}
 const r=normalizeStudioReferenceIllumination(f);assert(r.changed);assert.equal(r.pixels.length,f.pixels.length);
 for(let k=0;k<f.pixels.length;k+=4){assert.equal(r.pixels[k+3],before[k+3]);if(!before[k+3])assert.deepEqual(r.pixels.slice(k,k+4),before.slice(k,k+4))}
 const k1=at(f,.26,.32),k2=at(f,.5,.56);assert.deepEqual(r.pixels.slice(k1,k1+3),r.pixels.slice(k2,k2+3),'Same source colour must map identically across facial regions');
 assert.deepEqual(f.pixels,before);assert.deepEqual(f.evidence,evidence);
 assert.throws(()=>normalizeStudioReferenceIllumination({...f,width:f.width+1}),{code:'studio_skin_evidence_invalid'});return {geometryChanged:r.report.geometryChanged,nativePixels:f.width*f.height};
});

if(process.env.STUDIO_ILLUMINATION_FIXTURES){
 await test('actual public portrait variants converge warm-dim skin luminance and preserve the neutral baseline',async()=>{
  const directory=process.env.STUDIO_ILLUMINATION_FIXTURES,rows=[];
  const medians=(pixels,W,H,e)=>{
   const values=[[],[],[],[]];
   for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const label=e.labels[Math.floor(y*e.maskHeight/H)*e.maskWidth+Math.floor(x*e.maskWidth/W)],k=(y*W+x)*4;if(label===3&&pixels[k+3]===255){for(let c=0;c<3;c++)values[c].push(pixels[k+c]);values[3].push(Y(pixels[k],pixels[k+1],pixels[k+2]))}}
   return values.map(a=>a.sort((a,b)=>a-b)[a.length>>1]);
  };
  for(const name of ['balanced-defects','warm-dim','directional-shadow']){
   const e=JSON.parse(await readFile(path.join(directory,'evidence-'+name+'.json'),'utf8')),{data,info}=await sharp(path.join(directory,'input-'+name+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true}),before=Buffer.from(data);
   const r=normalizeStudioReferenceIllumination({pixels:data,width:info.width,height:info.height,evidence:e});assert.deepEqual(data,before);
   assert(r.report.eyes.every(eye=>eye.samplingStep===1),'Existing public native eye measurements must remain exact');
   for(let k=3;k<data.length;k+=4)assert.equal(r.pixels[k],data[k]);
   rows.push({name,before:medians(data,info.width,info.height,e),after:medians(r.pixels,info.width,info.height,e),report:r.report});
  }
  assert.equal(rows[0].report.status,'unchanged');assert(rows[1].report.castCorrection&&rows[1].report.exposureCorrection);
  assert(Math.abs(rows[1].after[3]-rows[0].after[3])<10);assert(rows[1].after.slice(0,3).every((v,c)=>Math.abs(v-rows[0].after[c])<=8));
  assert.equal(rows[2].report.referenceEye,1);assert(rows[2].report.gains[1]<=1.12);
  return {actualPortraits:rows};
 });
}
const result={passed,failed:0,reports,scope:'Bilateral sclera illumination calibration, not fixed skin whitening. Synthetic known illuminants plus optional existing public portrait variants. Continuous native RGB transform; alpha, geometry and immutable input retained. No provider or account calls.'};
if(process.env.STUDIO_ILLUMINATION_REPORT)await writeFile(process.env.STUDIO_ILLUMINATION_REPORT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
