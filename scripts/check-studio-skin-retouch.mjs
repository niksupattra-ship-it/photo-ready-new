import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {applyStudioSkinSoftFocus} from '../studio-skin-soft-focus.js';
import {applyStudioSkinRetouch} from '../studio-skin-retouch.js';
const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const eyes=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]],brows=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]],lips=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const Y=(r,g,b)=>.2126*r+.7152*g+.0722*b;
function fixture({width=768,height=960,colour=[184,143,124],acne=true,wrinkles=true,grain=true,shine=true,mole=true,headRadius=0}={}){
 const face=Array.from({length:478},()=>[.5,.44]);oval.forEach((id,i)=>{const a=i/oval.length*Math.PI*2;face[id]=[.5+.25*Math.sin(a),.44-.32*Math.cos(a)]});
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const a=i/ids.length*Math.PI*2;face[id]=[cx+rx*Math.cos(a),cy+ry*Math.sin(a)]});
 ellipse(eyes[0],.39,.36,.056,.024);ellipse(eyes[1],.61,.36,.056,.024);ellipse(brows[0],.39,.30,.061,.014);ellipse(brows[1],.61,.30,.061,.014);ellipse(lips,.5,.625,.064,.025);face[98]=[.475,.51];face[327]=[.525,.51];
 const maskWidth=128,maskHeight=160,labels=Array(maskWidth*maskHeight).fill(0),pixels=new Uint8ClampedArray(width*height*4);
 const skin=(x,y)=>((x-.5)/.25)**2+((y-.44)/.32)**2<1||y>=.69&&y<.97&&Math.abs(x-.5)<.15;
 for(let y=0;y<maskHeight;y++)for(let x=0;x<maskWidth;x++){const sx=(x+.5)/maskWidth,sy=(y+.5)/maskHeight;labels[y*maskWidth+x]=skin(sx,sy)?(sy>.73?2:3):sy>.8?4:sx<.2?1:0}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=(x+.5)/width,sy=(y+.5)/height,k=(y*width+x)*4,c=labels[Math.floor(sy*maskHeight)*maskWidth+Math.floor(sx*maskWidth)];let rgb=[68,131,216];
  if(c===2||c===3){let delta=grain?3*Math.sin(x*1.71)*Math.cos(y*1.41):0;delta+=3*(sx-.5)+2*Math.sin(sy*4);
   if(wrinkles&&sx>.35&&sx<.65)delta-=26*Math.exp(-(((y-height*.23)/1.4)**2));
   if(wrinkles&&sx>.33&&sx<.46)delta-=22*Math.exp(-(((y-height*.42)/2.1)**2));
   rgb=colour.map(v=>v+delta);
   if(acne&&Math.hypot(x-width*.40,y-height*.53)<width*.008)rgb=rgb.map((v,c)=>v+[16,-22,-20][c]);
   if(acne&&Math.hypot(x-width*.40,y-height*.53)<(headRadius||width*.0017))rgb=[243,239,234];
   if(shine&&((x-width*.56)/(width*.016))**2+((y-height*.22)/(height*.014))**2<1)rgb=[250,249,247];
   if(mole&&Math.hypot(x-width*.61,y-height*.56)<width*.006)rgb=colour.map(v=>v-65);
  }
  pixels.set([...rgb,255],k);
 }
 return {width,height,pixels,evidence:{version:STUDIO_SKIN_WORKFLOW_VERSION,width,height,face,maskWidth,maskHeight,labels}};
}
const full=f=>{const softened=applyStudioSkinSoftFocus(f);return applyStudioSkinRetouch({...f,pixels:softened.pixels})};
const light=(p,W,x,y)=>{const k=(y*W+x)*4;return Y(p[k],p[k+1],p[k+2])};
function lineContrast(f,p,y,a,b){let sum=0,n=0;const cy=Math.round(f.height*y),away=Math.round(f.width*.018);for(let x=Math.round(f.width*a);x<Math.round(f.width*b);x++){sum+=(light(p,f.width,x,cy-away)+light(p,f.width,x,cy+away))/2-light(p,f.width,x,cy);n++}return sum/n}
function area(f,p,cx,cy,r,fn){let sum=0,n=0;for(let y=Math.floor(f.height*cy-r);y<=f.height*cy+r;y++)for(let x=Math.floor(f.width*cx-r);x<=f.width*cx+r;x++)if(Math.hypot(x-f.width*cx,y-f.height*cy)<=r){const k=(y*f.width+x)*4;sum+=fn(p,k,x,y);n++}return sum/n}
function poreRMS(f,p,cx,cy,r=10){return Math.sqrt(area(f,p,cx,cy,r,(p,k,x,y)=>{const d=Y(p[k],p[k+1],p[k+2])-(light(p,f.width,x-1,y)+light(p,f.width,x+1,y)+light(p,f.width,x,y-1)+light(p,f.width,x,y+1))/4;return d*d}))}
let passed=0;const reports=[];const test=(name,run)=>{const r=run();passed++;reports.push({name,...r});console.log('PASS '+name)};
test('compact active acne and white-head interiors are repaired to nearby healthy skin',()=>{
 const bad=fixture(),clean=fixture({acne:false}),before=new Uint8ClampedArray(bad.pixels),r=full(bad),reference=full(clean),radius=bad.width*.006;
 const red=(p,k)=>p[k]-p[k+1],beforeExcess=area(bad,bad.pixels,.40,.53,radius,(p,k)=>red(p,k))-area(clean,clean.pixels,.40,.53,radius,(p,k)=>red(p,k));
 const afterExcess=area(bad,r.pixels,.40,.53,radius,(p,k)=>red(p,k))-area(clean,reference.pixels,.40,.53,radius,(p,k)=>red(p,k));
 const error=area(bad,r.pixels,.40,.53,radius,(p,k)=>Math.abs(p[k]-reference.pixels[k])+Math.abs(p[k+1]-reference.pixels[k+1])+Math.abs(p[k+2]-reference.pixels[k+2]))/3;
 assert(Math.abs(afterExcess)<Math.abs(beforeExcess)*.20,{beforeExcess,afterExcess});assert(error<5,'Healed acne mean RGB error '+error);assert(r.report.acnePixels>40);assert.deepEqual(bad.pixels,before);return {beforeExcess,afterExcess,healedMeanRGBError:error,acnePixels:r.report.acnePixels};
});
test('forehead and under-eye crease contrast is removed rather than merely half softened',()=>{
 const f=fixture({acne:false,shine:false}),r=full(f),ratios=[];
 for(const[y,a,b]of [[.23,.40,.60],[.42,.35,.44]]){const before=lineContrast(f,f.pixels,y,a,b),after=lineContrast(f,r.pixels,y,a,b),ratio=Math.abs(after/before);ratios.push(ratio);assert(ratio<.25,JSON.stringify({before,after,ratio}))}
 assert(r.report.wrinklePixels>100);return {contrastRetained:ratios,wrinklePixels:r.report.wrinklePixels};
});
test('specular skin highlights and bright plateaus fall without darkening ordinary skin',()=>{
 const f=fixture({acne:false,wrinkles:false}),r=full(f),before=area(f,f.pixels,.56,.22,f.width*.010,(p,k)=>Y(p[k],p[k+1],p[k+2])),after=area(f,r.pixels,.56,.22,f.width*.010,(p,k)=>Y(p[k],p[k+1],p[k+2]));assert(after<235&&before-after>15,{before,after});
 const ordinary=area(f,r.pixels,.40,.49,8,(p,k)=>Y(p[k],p[k+1],p[k+2]))-area(f,f.pixels,.40,.49,8,(p,k)=>Y(p[k],p[k+1],p[k+2]));assert(Math.abs(ordinary)<4);assert(r.report.highlightPixels>100);
 const dark=fixture({colour:[90,64,48],acne:false,wrinkles:false,shine:false});for(let y=Math.round(dark.height*.20);y<dark.height*.225;y++)for(let x=Math.round(dark.width*.55);x<dark.width*.57;x++)dark.pixels.set([175,155,146,255],(y*dark.width+x)*4);const dr=full(dark),beforeDark=area(dark,dark.pixels,.56,.212,4,(p,k)=>Y(p[k],p[k+1],p[k+2])),afterDark=area(dark,dr.pixels,.56,.212,4,(p,k)=>Y(p[k],p[k+1],p[k+2]));assert(beforeDark-afterDark>15);return {before,after,ordinaryMeanDelta:ordinary,darkHighlightBefore:beforeDark,darkHighlightAfter:afterDark,maxHighlightReduction:r.report.maxHighlightReduction};
});
test('fine texture is made consistent across healthy and healed skin and added texture is explicit',()=>{
 const f=fixture({grain:false,wrinkles:false,shine:false}),r=full(f),healed=poreRMS(f,r.pixels,.40,.53,4),healthy=poreRMS(f,r.pixels,.40,.48,10);assert(healthy>.35&&healthy<2.4,{healthy});assert(healed/healthy>.4&&healed/healthy<1.8,{healed,healthy});assert(r.report.addedTexturePixels>100);return {healedRMS:healed,healthyRMS:healthy,addedTexturePixels:r.report.addedTexturePixels};
});
test('features, alpha, non-skin, facial outline and round dark identifying marks stay exact',()=>{
 const f=fixture(),part=4*(Math.round(f.height*.50)*f.width+Math.round(f.width*.35));f.pixels[part+3]=128;const r=full(f);for(const id of [10,33,263,70,300,61,291,98,327,152]){const [x,y]=f.evidence.face[id],k=4*(Math.floor(y*f.height)*f.width+Math.floor(x*f.width));assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4),'Feature '+id)}assert.deepEqual(r.pixels.slice(part,part+4),f.pixels.slice(part,part+4));
 let protectedCount=0;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const k=(y*f.width+x)*4,c=f.evidence.labels[Math.floor(y*f.evidence.maskHeight/f.height)*f.evidence.maskWidth+Math.floor(x*f.evidence.maskWidth/f.width)];assert.equal(r.pixels[k+3],f.pixels[k+3]);if(c!==2&&c!==3||Math.hypot(x-f.width*.61,y-f.height*.56)<f.width*.005){assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4));protectedCount++}}
 return {protectedCount};
});
test('warm and darker skin keeps its own colour and native tile work remains bounded',()=>{
 const colours=[];for(const colour of [[205,155,103],[90,64,48]]){const f=fixture({width:384,height:480,colour,acne:false,wrinkles:false,shine:false,grain:false}),r=full(f);let rg=0,gb=0,n=0;for(let y=230;y<260;y++)for(let x=135;x<160;x++){const k=(y*f.width+x)*4;rg+=Math.abs((r.pixels[k]-r.pixels[k+1])-(f.pixels[k]-f.pixels[k+1]));gb+=Math.abs((r.pixels[k+1]-r.pixels[k+2])-(f.pixels[k+1]-f.pixels[k+2]));n++}assert(rg/n<.05&&gb/n<.05);colours.push(colour)}
 const large=fixture({width:1280,height:1600}),start=performance.now(),r=full(large),ms=performance.now()-start;assert(r.report.maxTilePixels<500000);assert(ms<20000);assert(r.report.tiles>1);const none=fixture({width:256,height:320});none.evidence.labels.fill(0);const no=applyStudioSkinRetouch(none);assert.equal(no.pixels,none.pixels);assert.throws(()=>applyStudioSkinRetouch({...none,width:257}),{code:'studio_skin_evidence_invalid'});return {colours,milliseconds:ms,maxTilePixels:r.report.maxTilePixels,tiles:r.report.tiles};
});
test('complete three-pixel white-head interiors are healed instead of leaving a bright dot',()=>{
 const bad=fixture({headRadius:3}),clean=fixture({acne:false}),r=full(bad),reference=full(clean);
 const err=area(bad,r.pixels,.40,.53,2.8,(p,k)=>(Math.abs(p[k]-reference.pixels[k])+Math.abs(p[k+1]-reference.pixels[k+1])+Math.abs(p[k+2]-reference.pixels[k+2]))/3);
 assert(err<4,'White-head interior RGB error '+err);return {whiteHeadRadius:3,interiorMeanRGBError:err};
});
test('very dark complexion still receives acne and wrinkle repair without a fixed-black skin gate',()=>{
 const f=fixture({colour:[55,34,22],shine:false}),r=full(f),clean=fixture({colour:[55,34,22],shine:false,acne:false}),reference=full(clean),red=(p,k)=>p[k]-p[k+1];
 const before=area(f,f.pixels,.40,.53,4,red)-area(clean,clean.pixels,.40,.53,4,red),after=area(f,r.pixels,.40,.53,4,red)-area(clean,reference.pixels,.40,.53,4,red);assert(Math.abs(after)<Math.abs(before)*.20+1);
 const ratios=[];for(const[y,a,b]of [[.23,.40,.60],[.42,.35,.44]]){const contrast=lineContrast(f,f.pixels,y,a,b),remaining=lineContrast(f,r.pixels,y,a,b);ratios.push(Math.abs(remaining/contrast));assert(Math.abs(remaining/contrast)<.25)}
 return {originalComplexion:[55,34,22],acneRedExcessBefore:before,acneRedExcessAfter:after,wrinkleContrastRetained:ratios};
});
test('broad anatomical shadow gradients and healthy skin around a protected mole remain intact',()=>{
 const f=fixture({acne:false,wrinkles:false,shine:false,grain:false});for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const sx=x/f.width,sy=y/f.height,k=(y*f.width+x)*4,c=f.evidence.labels[Math.floor(y*f.evidence.maskHeight/f.height)*f.evidence.maskWidth+Math.floor(x*f.evidence.maskWidth/f.width)];if(c!==2&&c!==3)continue;const shade=30*Math.exp(-(((sx-.36)/.10)**2+((sy-.51)/.12)**2));for(let q=0;q<3;q++)f.pixels[k+q]-=shade}
 const base=applyStudioSkinSoftFocus(f),r=applyStudioSkinRetouch({...f,pixels:base.pixels});
 const region=(p,x,y)=>area(f,p,x,y,6,(p,k)=>Y(p[k],p[k+1],p[k+2]));const before=region(base.pixels,.65,.50)-region(base.pixels,.36,.51),after=region(r.pixels,.65,.50)-region(r.pixels,.36,.51);assert(Math.abs(after-before)<1.5,JSON.stringify({before,after}));
 const m=fixture({acne:false,wrinkles:false,shine:false,grain:false}),mb=applyStudioSkinSoftFocus(m),mr=applyStudioSkinRetouch({...m,pixels:mb.pixels});let sum=0,n=0;const radius=m.width*.006;for(let y=Math.floor(m.height*.56-radius-12);y<m.height*.56+radius+12;y++)for(let x=Math.floor(m.width*.61-radius-12);x<m.width*.61+radius+12;x++){const d=Math.hypot(x-m.width*.61,y-m.height*.56);if(d<radius+3||d>radius+12)continue;const k=(y*m.width+x)*4;sum+=Y(mr.pixels[k],mr.pixels[k+1],mr.pixels[k+2])-Y(mb.pixels[k],mb.pixels[k+1],mb.pixels[k+2]);n++}assert(Math.abs(sum/n)<1.2,'Healthy mole annulus acquired a halo');return {broadShadowBefore:before,broadShadowAfter:after,healthyMoleAnnulusMeanDelta:sum/n};
});
console.log(JSON.stringify({passed,failed:0,reports,scope:'Actual native automatic acne/crease repair, fine-grain harmonization and matte highlight control. Synthetic known defects and complexion/protection fixtures; no provider, account or payment calls.'}));
