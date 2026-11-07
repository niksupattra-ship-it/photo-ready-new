import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {applyStudioSkinSoftFocus} from '../studio-skin-soft-focus.js';
const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const eyes=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]],brows=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]],lips=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const Y=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const pixel=(f,x,y)=>4*(Math.floor(y*f.height)*f.width+Math.floor(x*f.width));
function fixture({width=768,height=960,colour=[184,143,124],grain=true,wrinkles=true,mark=true,flat=false}={}){
 const face=Array.from({length:478},()=>[.5,.44]);oval.forEach((id,i)=>{const a=i/oval.length*Math.PI*2;face[id]=[.5+.25*Math.sin(a),.44-.32*Math.cos(a)]});
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const a=i/ids.length*Math.PI*2;face[id]=[cx+rx*Math.cos(a),cy+ry*Math.sin(a)]});
 ellipse(eyes[0],.39,.36,.056,.024);ellipse(eyes[1],.61,.36,.056,.024);ellipse(brows[0],.39,.30,.061,.014);ellipse(brows[1],.61,.30,.061,.014);ellipse(lips,.5,.625,.064,.025);face[98]=[.475,.51];face[327]=[.525,.51];
 const maskWidth=128,maskHeight=160,labels=Array(maskWidth*maskHeight).fill(0),pixels=new Uint8ClampedArray(width*height*4);
 const skin=(x,y)=>((x-.5)/.25)**2+((y-.44)/.32)**2<1||y>=.69&&y<.97&&Math.abs(x-.5)<.15;
 for(let y=0;y<maskHeight;y++)for(let x=0;x<maskWidth;x++){const sx=(x+.5)/maskWidth,sy=(y+.5)/maskHeight;labels[y*maskWidth+x]=skin(sx,sy)?(sy>.73?2:3):sy>.8?4:sx<.2?1:0}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=(x+.5)/width,sy=(y+.5)/height,k=(y*width+x)*4,label=labels[Math.min(maskHeight-1,Math.floor(sy*maskHeight))*maskWidth+Math.min(maskWidth-1,Math.floor(sx*maskWidth))];
  let rgb=label===2||label===3?[...colour]:[68,131,216];
  if(label===2||label===3){
   let delta=grain?4*Math.sin(x*1.71)*Math.cos(y*1.41):0;
   if(!flat)delta+=5*(sx-.5)+3*Math.sin(sy*5);
   if(wrinkles&&sx>.35&&sx<.65)delta-=16*Math.exp(-(((y-height*.23)/1.8)**2));
   if(wrinkles&&sx>.33&&sx<.46)delta-=14*Math.exp(-(((y-height*.42)/2.6)**2));
   rgb=rgb.map(v=>v+delta);
   if(mark&&Math.hypot(x-width*.61,y-height*.56)<Math.max(3,width*.005))rgb=colour.map(v=>v-65);
  }
  pixels.set([...rgb,255],k);
 }
 return {width,height,pixels,evidence:{version:STUDIO_SKIN_WORKFLOW_VERSION,width,height,face,maskWidth,maskHeight,labels}};
}
const lightAt=(pixels,W,x,y)=>{const k=(y*W+x)*4;return Y(pixels[k],pixels[k+1],pixels[k+2])};
function lineContrast(f,pixels,y,x0,x1,away=12){let total=0,n=0;const cy=Math.round(y*f.height);for(let x=Math.round(x0*f.width);x<Math.round(x1*f.width);x++){total+=(lightAt(pixels,f.width,x,cy-away)+lightAt(pixels,f.width,x,cy+away))/2-lightAt(pixels,f.width,x,cy);n++}return total/n}
function microcontrast(f,pixels){let sum=0,n=0;for(let y=Math.floor(f.height*.46);y<f.height*.54;y++)for(let x=Math.floor(f.width*.33);x<f.width*.41;x++){const center=lightAt(pixels,f.width,x,y),near=(lightAt(pixels,f.width,x-1,y)+lightAt(pixels,f.width,x+1,y)+lightAt(pixels,f.width,x,y-1)+lightAt(pixels,f.width,x,y+1))/4;sum+=(center-near)**2;n++}return Math.sqrt(sum/n)}
let passed=0;const reports=[];const test=(name,run)=>{const report=run();passed++;reports.push({name,...report});console.log('PASS '+name)};
test('fine forehead and under-eye wrinkles visibly soften without erasing native pore detail',()=>{
 const f=fixture(),before=new Uint8ClampedArray(f.pixels),r=applyStudioSkinSoftFocus(f);assert(r.changed);assert.deepEqual(f.pixels,before);
 const ratios=[];for(const [y,x0,x1]of [[.23,.40,.60],[.42,.35,.44]]){const original=lineContrast(f,f.pixels,y,x0,x1),after=lineContrast(f,r.pixels,y,x0,x1);ratios.push(after/original);assert(after>0&&after/original>.25&&after/original<.72,JSON.stringify({original,after,ratio:after/original}))}
 const contrast=microcontrast(f,r.pixels)/microcontrast(f,f.pixels);assert(contrast>.35&&contrast<.80,'Fine-pore contrast retained: '+contrast);assert(r.report.maxDiffuseLift<=1.8);assert(r.report.wrinklePixels>100);return {wrinkleContrastRetained:ratios,poreContrastRetained:contrast,...r.report};
});
test('native features, alpha, face edge, hair, clothes and background stay sample-for-sample intact',()=>{
 const f=fixture(),highlight=pixel(f,.56,.22),partial=pixel(f,.35,.52);f.pixels.set([251,239,230,255],highlight);f.pixels[partial+3]=128;const r=applyStudioSkinSoftFocus(f);
 for(const id of [10,33,263,70,300,61,291,98,327,152]){const k=pixel(f,...f.evidence.face[id]);assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4),'Feature '+id)}
 for(const k of [highlight,partial,pixel(f,.61,.56)])assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4));
 let protectedPixels=0;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const k=(y*f.width+x)*4;assert.equal(r.pixels[k+3],f.pixels[k+3]);const label=f.evidence.labels[Math.floor(y*f.evidence.maskHeight/f.height)*f.evidence.maskWidth+Math.floor(x*f.evidence.maskWidth/f.width)];if(label!==2&&label!==3){assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4));protectedPixels++}}
 return {protectedPixels,nativeDimensions:[f.width,f.height]};
});
test('warm and darker complexions keep their original chroma with only bounded neutral diffusion',()=>{
 const result=[];for(const colour of [[205,155,103],[90,64,48],[184,143,124]]){const f=fixture({width:384,height:480,colour}),r=applyStudioSkinSoftFocus(f);let sum=0,n=0;
  for(let y=Math.floor(f.height*.47);y<f.height*.54;y++)for(let x=Math.floor(f.width*.34);x<f.width*.42;x++){const k=(y*f.width+x)*4,dr=r.pixels[k]-f.pixels[k],dg=r.pixels[k+1]-f.pixels[k+1],db=r.pixels[k+2]-f.pixels[k+2];assert.equal(dr,dg);assert.equal(dg,db);sum+=dr;n++}
  assert(Math.abs(sum/n)<3);result.push({colour,meanLift:sum/n});
 }return {complexions:result};
});
test('already smooth skin receives only a gentle diffuse light without clipping or invented texture',()=>{
 const f=fixture({colour:[192,153,132],grain:false,wrinkles:false,mark:false,flat:true}),r=applyStudioSkinSoftFocus(f);let minimum=255,maximum=0;
 for(let y=Math.floor(f.height*.46);y<f.height*.56;y++)for(let x=Math.floor(f.width*.34);x<f.width*.43;x++){const k=(y*f.width+x)*4;minimum=Math.min(minimum,r.pixels[k]-f.pixels[k]);maximum=Math.max(maximum,r.pixels[k]-f.pixels[k]);assert(r.pixels[k]<248)}
 assert(minimum>=0&&maximum<=2);assert.equal(minimum,maximum);return {uniformNeutralLift:maximum};
});
test('round dark identifying marks and deep anatomical creases are protected instead of painted out',()=>{
 const f=fixture(),mole=pixel(f,.61,.56),cx=Math.round(f.width*.58),cy=Math.round(f.height*.60);
 for(let y=cy-2;y<=cy+2;y++)for(let x=cx-30;x<=cx+30;x++)f.pixels.set([65,45,34,255],(y*f.width+x)*4);
 const largeX=Math.round(f.width*.39),largeY=Math.round(f.height*.56),largeRadius=12;
 for(let y=largeY-largeRadius;y<=largeY+largeRadius;y++)for(let x=largeX-largeRadius;x<=largeX+largeRadius;x++)if(Math.hypot(x-largeX,y-largeY)<=largeRadius)f.pixels.set([99,73,56,255],(y*f.width+x)*4);
 const r=applyStudioSkinSoftFocus(f);assert.deepEqual(r.pixels.slice(mole,mole+4),f.pixels.slice(mole,mole+4));
 for(let y=largeY-largeRadius;y<=largeY+largeRadius;y++)for(let x=largeX-largeRadius;x<=largeX+largeRadius;x++)if(Math.hypot(x-largeX,y-largeY)<=largeRadius){const k=(y*f.width+x)*4;assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4),'Large stable mark interior');}

 let n=0;for(let y=cy-2;y<=cy+2;y++)for(let x=cx-30;x<=cx+30;x++){const k=(y*f.width+x)*4;assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4));n++}return {deepCreasePixelsRetained:n};
});
test('native tiling bounds extra memory and leaves no seams in skin texture correction',()=>{
 const f=fixture({width:1280,height:1600,grain:true,wrinkles:true}),start=performance.now(),r=applyStudioSkinSoftFocus(f),ms=performance.now()-start;assert(r.changed);assert(r.report.tiles>1);assert(r.report.maxTilePixels<400000);assert(r.report.roiPixels<f.width*f.height);assert(ms<20000);
 const flat=fixture({width:1280,height:1600,grain:false,wrinkles:false,mark:false,flat:true}),flatResult=applyStudioSkinSoftFocus(flat);
 const fw=Math.hypot((flat.evidence.face[454][0]-flat.evidence.face[234][0])*flat.width,(flat.evidence.face[454][1]-flat.evidence.face[234][1])*flat.height);
 const seamX=Math.floor(Math.min(...oval.map(id=>flat.evidence.face[id][0]*flat.width))-fw*.16)+384,seamY=Math.floor(Math.min(...oval.map(id=>flat.evidence.face[id][1]*flat.height))-fw*.025)+384;
 const seamDeltas=[];
 for(let offset=-3;offset<=3;offset++)for(const [x,y]of [[seamX+offset,Math.round(flat.height*.23)],[Math.round(flat.width*.5),seamY+offset]]){const k=(y*flat.width+x)*4;seamDeltas.push(flatResult.pixels[k]-flat.pixels[k])}
 assert(seamDeltas[0]>0);assert(seamDeltas.every(d=>d===seamDeltas[0]),'Constant skin must receive the same correction on both sides of a tile boundary');
 const none=fixture({width:256,height:320});none.evidence.labels.fill(0);const q=applyStudioSkinSoftFocus(none);assert.equal(q.pixels,none.pixels);assert.equal(q.changed,false);
 assert.throws(()=>applyStudioSkinSoftFocus({...f,width:f.width+1}),{code:'studio_skin_evidence_invalid'});
 return {milliseconds:ms,tiles:r.report.tiles,maxTilePixels:r.report.maxTilePixels,nativePixels:f.width*f.height,seamDelta:seamDeltas[0]};
});
console.log(JSON.stringify({passed,failed:0,reports,scope:'Native pre-AI skin soft focus: fine lines, pore microcontrast, bounded diffuse light, immutable pixels, protected anatomy/marks and tiled native processing. No providers, network, account or payment writes.'}));
