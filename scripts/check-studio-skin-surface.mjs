import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {finishStudioSkinSurface} from '../studio-skin-surface.js';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
const code=(await readFile(new URL('./check-studio-skin-continuity.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').split('let passed=0;')[0];
const fixture=Function('STUDIO_SKIN_WORKFLOW_VERSION',code+';return fixture')(STUDIO_SKIN_WORKFLOW_VERSION);
function source(colour){const f=fixture({width:512,height:640,colour,delta:[0,0,0],alreadyEven:true});return {...f,pixels:f.originalPixels.slice(),face:f.evidence.face.map(([x,y])=>({x,y})),semantic:{width:f.evidence.maskWidth,height:f.evidence.maskHeight,values:new Uint8Array(f.evidence.labels)}};}
const luma=(p,k)=>.2126*p[k]+.7152*p[k+1]+.0722*p[k+2];
let passed=0;const reports=[];async function test(name,run){const detail=await run();reports.push({name,...detail});passed++;console.log('PASS '+name);}
await test('colour islands at changing forehead, cheek, mouth and chin positions are corrected by the same whole-skin field',()=>{
 const rows=[];for(const [px,py]of[[.5,.2],[.31,.49],[.65,.51],[.44,.70],[.52,.76]]){
  const f=source([184,145,128]),before=f.pixels.slice(),cx=Math.round(px*f.width),cy=Math.round(py*f.height),radius=13;assert.equal(f.kind[cy*f.width+cx],1);
  for(let y=cy-radius*3;y<=cy+radius*3;y++)for(let x=cx-radius*3;x<=cx+radius*3;x++){const k=(y*f.width+x)*4;if(f.kind[y*f.width+x]!==1)continue;const a=Math.exp(-2*((x-cx)**2+(y-cy)**2)/radius**2);for(let c=0;c<3;c++)f.pixels[k+c]+=[17,-7,-16][c]*a;}
  const result=finishStudioSkinSurface(f),k=(cy*f.width+cx)*4,error=p=>Math.hypot((p[k]-p[k+1])-(before[k]-before[k+1]),(p[k+2]-p[k+1])-(before[k+2]-before[k+1]));
  const a=error(f.pixels),b=error(result.pixels);assert(b<a*.65,JSON.stringify({px,py,before:a,after:b}));rows.push({position:[px,py],before:a,after:b});
 }return {rows};
});
await test('forehead and nose highlights are compressed while fine native skin texture and alpha remain',()=>{
 const f=source([184,145,128]),cx=256,cy=125,radius=13;
 for(let y=cy-30;y<cy+30;y++)for(let x=cx-30;x<cx+30;x++){const k=(y*f.width+x)*4,a=Math.exp(-2*((x-cx)**2+(y-cy)**2)/radius**2);for(let c=0;c<3;c++)f.pixels[k+c]=f.pixels[k+c]*(1-a)+[249,246,241][c]*a;}
 const before=f.pixels.slice(),r=finishStudioSkinSurface(f),k=(cy*f.width+cx)*4,reduction=luma(before,k)-luma(r.pixels,k);assert(reduction>25,{reduction});assert(r.report.highlightPixels>0);for(let i=3;i<before.length;i+=4)assert.equal(r.pixels[i],before[i]);assert.deepEqual(f.pixels,before);
 return {highlightReduction:reduction,maxChannelDelta:r.report.maxChannelDelta};
});
await test('semantic holes inside genuine facial skin cannot leave untreated rectangles',()=>{
 const f=source([184,145,128]),g=source([184,145,128]);
 for(const v of [f,g])for(let y=180;y<360;y++)for(let x=180;x<300;x++){const k=(y*v.width+x)*4;if(v.kind[y*v.width+x]===1){v.pixels[k]+=10;v.pixels[k+2]-=10;}}
 for(let y=40;y<90;y++)for(let x=45;x<75;x++)g.semantic.values[y*g.semantic.width+x]=0;
 const a=finishStudioSkinSurface(f),b=finishStudioSkinSurface(g);let total=0,n=0;for(let y=190;y<340;y++)for(let x=190;x<280;x++){const k=(y*f.width+x)*4;if(f.kind[y*f.width+x]===1){for(let c=0;c<3;c++)total+=Math.abs(a.pixels[k+c]-b.pixels[k+c]);n+=3;}}
 assert(total/n<1.5,{meanDifference:total/n});return {meanDifference:total/n};
});
await test('unmarked even skin preserves the individual dark and warm complexion without a fixed whitening target',()=>{
 const rows=[];for(const colour of[[65,42,29],[110,77,52],[184,145,128],[218,170,123]]){const f=source(colour),r=finishStudioSkinSurface(f);let max=0,sum=0,n=0;for(let i=0;i<f.kind.length;i++)if(f.kind[i]===1){for(let c=0;c<3;c++){const d=Math.abs(r.pixels[i*4+c]-f.pixels[i*4+c]);max=Math.max(max,d);sum+=d;n++;}}assert(sum/n<.3,{colour,mean:sum/n,max});rows.push({colour,meanDelta:sum/n,maxDelta:max});}return {rows};
});
await test('actual dark brows, eye interiors, lip pigment and transparent RGB remain intact',()=>{
 const f=source([184,145,128]);for(let i=0;i<f.kind.length;i++)if(f.kind[i]===1){f.pixels[i*4]+=8;f.pixels[i*4+2]-=6;}const before=f.pixels.slice(),r=finishStudioSkinSurface(f);let protectedSamples=0,max=0;for(let i=0;i<f.kind.length;i++)if(f.kind[i]>=2||before[i*4+3]===0){for(let c=0;c<4;c++)max=Math.max(max,Math.abs(r.pixels[i*4+c]-before[i*4+c]));protectedSamples++;}assert(max<=1,{max});return {protectedSamples,maxDelta:max};
});
await test('invalid native dimensions, unbounded landmarks and missing semantic data fail safely',()=>{
 const f=source([184,145,128]);assert.throws(()=>finishStudioSkinSurface({...f,width:f.width+1}));const bad=f.face.map(p=>({...p}));bad[234].x=1e300;assert.throws(()=>finishStudioSkinSurface({...f,face:bad}));assert.throws(()=>finishStudioSkinSurface({...f,semantic:{width:NaN,height:1,values:[]}}));return {rejected:3};
});
console.log(JSON.stringify({passed,reports,scope:'Continuous whole-skin colour and matte field, changing defect positions, semantic holes, authentic complexion, exact alpha/source and feature pigment. No providers, accounts or payment APIs.'}));
