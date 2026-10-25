// First female AI makeup only. This pass caps measured excess eye pigment;
// it never draws makeup, changes lightness, smooths texture, or moves pixels.
const EYES = [
  {name:'leftEye',upper:[33,246,161,160,159,158,157,173,133],lower:[33,7,163,144,145,153,154,155,133],brow:[70,63,105,66,107,55,65,52,53,46],cheek:[50,101,118],outer:0},
  {name:'rightEye',upper:[362,398,384,385,386,387,388,466,263],lower:[362,382,381,380,374,373,390,249,263],brow:[336,296,334,293,300,276,283,282,295,285],cheek:[280,330,347],outer:1},
];
const LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
const quantile=(values,q)=>{const a=values.slice().sort((x,y)=>x-y);return a[Math.floor((a.length-1)*q)]};
const med=values=>quantile(values,.5);
const validPoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const unavailable=reason=>({status:'unavailable',reason,changedPixels:0,sampleCount:0});
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i].y>y)!==(poly[j].y>y)&&x<(poly[j].x-poly[i].x)*(y-poly[i].y)/(poly[j].y-poly[i].y)+poly[i].x)yes=!yes;return yes}
function distance(x,y,poly){let best=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(x-a.x-dx*t,y-a.y-dy*t))}return best}
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const gamma=v=>255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function toLab(r,g,b){r=linear(r);g=linear(g);b=linear(b);const f=v=>v>.008856451679?Math.cbrt(v):v*7.787037037+16/116;const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return [116*y-16,500*(x-y),200*(y-z)]}
function toRgb(L,a,b){const y=(L+16)/116,x=y+a/500,z=y-b/200,f=v=>v**3>.008856451679?v**3:(v-16/116)/7.787037037;const X=.95047*f(x),Y=f(y),Z=1.08883*f(z);return [gamma(3.2404542*X-1.5371385*Y-.4985314*Z),gamma(-.969266*X+1.8760108*Y+.041556*Z),gamma(.0556434*X-.2040259*Y+1.0572252*Z)]}
const gamut=c=>c.every(v=>Number.isFinite(v)&&v>=0&&v<=255);
// Interpolate from the original, in-gamut pixel if the requested chroma is out
// of gamut. Clipping RGB channels would change the original lightness.
function safeRgb(L,a,b,oldA,oldB){let color=toRgb(L,a,b);if(gamut(color))return color;let lo=0,hi=1;for(let i=0;i<10;i++){const t=(lo+hi)/2,c=toRgb(L,oldA+(a-oldA)*t,oldB+(b-oldB)*t);if(gamut(c)){lo=t;color=c}else hi=t}return lo>.05&&gamut(color)?color:null}
function plane(mask,n){if(!ArrayBuffer.isView(mask)||mask instanceof DataView)return null;if(mask.length===n)return i=>mask[i];if(mask.length===n*4&&(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray))return i=>mask[i*4+3]/255;return null}
function contour(points,x){if(x<=points[0].x)return points[0].y;for(let i=1;i<points.length;i++)if(x<=points[i].x){const a=points[i-1],b=points[i];return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x||1)}return points[points.length-1].y}

/** Accepts normalized confidence planes (N) or cached RGBA masks (4N alpha).
 * No browser objects, dependencies, model calls, or full-frame working masks.
 * Missing/ambiguous evidence fails open to the exact original pixel buffer.
 */
export function finishFemaleMakeupEyeTone(input={}){
 const original=input?.pixels;
 const report={changedPixels:0,regions:{leftEye:unavailable('invalid-input'),rightEye:unavailable('invalid-input')}};
 const finish=(pixels=original,changed=false)=>({pixels:changed?pixels:original,changed,status:Object.values(report.regions).some(r=>r.status!=='unavailable')?'measured':'unmeasurable',report});
 try{
  const {pixels,width:w,height:h,face}=input,n=w*h;
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||n>8388608||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==n*4)return finish();
  const skin=plane(input.skin,n),hair=plane(input.hair,n);
  if(!skin||!hair||![234,454,...LIPS].every(i=>validPoint(face?.[i])))return finish();
  const point=i=>({x:face[i].x*w,y:face[i].y*h});
  const p0=point(234),p1=point(454),fw=Math.hypot(p1.x-p0.x,p1.y-p0.y),lips=LIPS.map(point);
  if(fw<80){for(const eye of EYES)report.regions[eye.name]=unavailable('face-too-small');return finish()}
  let out=null;
  for(const eye of EYES){
   const reject=reason=>{report.regions[eye.name]=unavailable(reason)};
   if(![...eye.upper,...eye.lower,...eye.brow,...eye.cheek].every(i=>validPoint(face[i]))){reject('invalid-landmarks');continue}
   const upper=eye.upper.map(point),lower=eye.lower.map(point),brow=eye.brow.map(point),origin=upper[0],end=upper[8],span=Math.hypot(end.x-origin.x,end.y-origin.y);
   if(span<18||span<fw*.12||span>fw*.36){reject('unreliable-eye-size');continue}
   const ux=(end.x-origin.x)/span,uy=(end.y-origin.y)/span;
   let vx=-uy,vy=ux;
   const browMid={x:med(brow.map(p=>p.x)),y:med(brow.map(p=>p.y))};
   if((browMid.x-origin.x)*vx+(browMid.y-origin.y)*vy>0){vx=-vx;vy=-vy}
   const local=p=>({x:(p.x-origin.x)*ux+(p.y-origin.y)*uy,y:(p.x-origin.x)*vx+(p.y-origin.y)*vy});
   const world=(x,y)=>({x:origin.x+ux*x+vx*y,y:origin.y+uy*x+vy*y});
   const top=upper.map(local),bottom=lower.map(local),browLocal=brow.map(local),opening=[...upper,...lower.slice(1,-1).reverse()];
   const monotone=p=>p.every((v,i)=>!i||v.x>=p[i-1].x-span*.018);
   const centerTop=contour(top,span*.5),centerBottom=contour(bottom,span*.5),gap=centerTop-med(browLocal.map(p=>p.y)),aperture=centerBottom-centerTop;
   if(!monotone(top)||!monotone(bottom)||aperture<span*.045||aperture>span*.4||gap<span*.13||gap>span*.85||bottom.slice(1,-1).some((p,i)=>p.y<top[i+1].y-span*.015)){reject('unreliable-eyelid-geometry');continue}
   const guard=Math.max(1.25,span*.035),browGuard=Math.max(1.5,span*.05),upperDepth=Math.min(span*.29,gap*.62),lowerDepth=Math.min(span*.43,fw*.11),feather=Math.max(1.25,span*.07);
   // All feathers are contained inside these bounds. Neither the opening nor
   // its lash-root guard receives even a partially blended correction.
   const regionAt=(x,y)=>{
    const t=x/span;if(t<=-.045||t>=1.045)return null;
    const shape=.38+.62*Math.sin(Math.PI*clamp(t,0,1))**.65,edge=span*Math.min(t+.045,1.045-t),u=contour(top,x),d=contour(bottom,x);
    if(y<u-guard){const depth=upperDepth*shape,dist=Math.min(u-guard-y,y-(u-depth),edge);if(dist>0)return {kind:'upper',weight:smooth(dist/feather)}}
    if(y>d+guard){const depth=lowerDepth*shape,dist=Math.min(y-d-guard,d+depth-y,edge);if(dist>0)return {kind:'lower',weight:smooth(dist/feather)}}
    return null;
   };
   const protectedAt=(x,y)=>inside(x,y,opening)||distance(x,y,opening)<=guard||inside(x,y,brow)||distance(x,y,brow)<=browGuard||inside(x,y,lips)||distance(x,y,lips)<=guard;
   const confidence=i=>{const s=skin(i),v=hair(i);return !Number.isFinite(s)||s<0||s>1||!Number.isFinite(v)||v<0||v>1?null:{s,h:v}};
   // References are independent for the two sides. Sample below the orbital
   // band and at the temple, plus native cheek anchors; no fixed skin colour.
   const disks=[world(span*.25,centerBottom+span*.78),world(span*.78,centerBottom+span*.78),world(span*(eye.outer?1.31:-.31),-span*.03),...eye.cheek.map(point)];
   const refs=[],radius=span*.15,step=Math.max(1,Math.floor(span/50));let invalidEvidence=false;
   for(const center of disks){
    for(let y=Math.max(0,Math.floor(center.y-radius));y<Math.min(h,center.y+radius);y+=step)for(let x=Math.max(0,Math.floor(center.x-radius));x<Math.min(w,center.x+radius);x+=step){
     if((x+.5-center.x)**2+(y+.5-center.y)**2>radius*radius)continue;
     const q=local({x:x+.5,y:y+.5});if(regionAt(q.x,q.y)||protectedAt(x+.5,y+.5))continue;
     const i=y*w+x,k=i*4,c=confidence(i);if(!c){invalidEvidence=true;continue}if(c.s<.85||c.h>.04||pixels[k+3]!==255)continue;
     const v=toLab(pixels[k],pixels[k+1],pixels[k+2]),chroma=Math.hypot(v[1],v[2]);
     // Discard saturated cosmetics, shine, deep creases and non-skin colours.
     if(v[0]<12||v[0]>94||chroma>45||v[1]<-5||v[1]>34||v[2]<-5)continue;
     refs.push(v);
    }
   }
   if(invalidEvidence){reject('invalid-mask-evidence');continue}
   if(refs.length<24){reject('insufficient-neutral-skin-reference');continue}
   const pinkScores=refs.map(v=>v[1]-.5*v[2]),pinkMedian=med(pinkScores),pinkSpread=Math.max(1,med(pinkScores.map(v=>Math.abs(v-pinkMedian))));
   let neutral=refs.filter((v,i)=>pinkScores[i]<=pinkMedian+pinkSpread&&pinkScores[i]<18);
   if(neutral.length<24){reject('no-reliable-neutral-skin-reference');continue}
   const base=[0,1,2].map(i=>med(neutral.map(v=>v[i]))),deviations=neutral.map(v=>Math.hypot(v[1]-base[1],v[2]-base[2])),cut=Math.max(3,quantile(deviations,.75)*1.6);
   neutral=neutral.filter(v=>Math.hypot(v[1]-base[1],v[2]-base[2])<=cut);
   if(neutral.length<24){reject('inconsistent-skin-reference');continue}
   const reference=[0,1,2].map(i=>med(neutral.map(v=>v[i])));
   // A cheek's brightness/pigment correlation is not a reliable model of an
   // eyelid shadow. Keep its measured hue without extrapolating yellow/red
   // chroma into darker lid pixels; those pixels retain their own native L*.
   const corners=[world(-span*.05,-upperDepth+Math.min(...top.map(p=>p.y))),world(span*1.05,-upperDepth+Math.min(...top.map(p=>p.y))),world(-span*.05,lowerDepth+Math.max(...bottom.map(p=>p.y))),world(span*1.05,lowerDepth+Math.max(...bottom.map(p=>p.y)))];
   const x0=clamp(Math.floor(Math.min(...corners.map(p=>p.x))),0,w),x1=clamp(Math.ceil(Math.max(...corners.map(p=>p.x))),0,w),y0=clamp(Math.floor(Math.min(...corners.map(p=>p.y))),0,h),y1=clamp(Math.ceil(Math.max(...corners.map(p=>p.y))),0,h);
   let area=0,visible=0,occluded=0,invalid=false;
   // Validate evidence before writing any part of this eye. Occluded eyes and
   // low-confidence masks fail open as a whole rather than leaving patchwork.
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const q=local({x:x+.5,y:y+.5}),r=regionAt(q.x,q.y);if(!r||protectedAt(x+.5,y+.5))continue;
    area++;const i=y*w+x,k=i*4,c=confidence(i);if(!c){invalid=true;continue}if(c.s<.82||c.h>.08||pixels[k+3]!==255){occluded++;continue}visible++;
   }
   if(invalid){reject('invalid-mask-evidence');continue}
   if(visible<24||visible<area*.6){reject('occluded-or-low-confidence');continue}
   const counts={upper:{changedPixels:0,eligiblePixels:0},lower:{changedPixels:0,eligiblePixels:0}};
   let changedPixels=0,maxLightnessError=0;
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const q=local({x:x+.5,y:y+.5}),r=regionAt(q.x,q.y);if(!r||protectedAt(x+.5,y+.5))continue;
    const i=y*w+x,k=i*4,c=confidence(i);if(!c||c.s<.82||c.h>.08||pixels[k+3]!==255)continue;
    const [L,A,B]=toLab(pixels[k],pixels[k+1],pixels[k+2]),refA=reference[1],refB=reference[2];
    // Keep dark lashes/brow hairs even if the segmenter called them skin, and
    // keep speculars. Deep skin is evaluated relative to its measured skin.
    const darkLimit=Math.max(6,reference[0]-48);
    if(L<darkLimit||L>Math.min(96,reference[0]+17)||L>82&&Math.hypot(A,B)<7)continue;
    counts[r.kind].eligiblePixels++;
    const da=A-refA,db=B-refB,pink=Math.max(da,da-.48*db),upperLid=r.kind==='upper',aCap=upperLid?1.8:.65,bCap=upperLid?-1.2:-.45;
    // The dead zone leaves natural skin and an already subtle nude lid exact.
    // Require increased redness: ordinary cool/blue orbital shading survives.
    const threshold=upperLid?4.2:3.0;
    if(da<1.5||pink<=threshold||da<2.5&&db>-2.5)continue;
    // Keep native pigment variation. A bounded, partial reduction avoids a
    // flat neutral oval where source makeup also supplied darker shading.
    const keep=upperLid?.3:.4,bHigh=upperLid?1.8:.65,retainedB=clamp(db,bCap,bHigh);
    const wantedA=refA+Math.min(da,aCap+Math.max(0,da-aCap)*keep),wantedB=refB+retainedB+(db-retainedB)*keep;
    const newA=A+clamp(wantedA-A,-(upperLid?7:6),0),newB=B+clamp(wantedB-B,-4,4);
    const shadow=smooth((L-darkLimit)/10),highlight=1-smooth((L-Math.min(96,reference[0]+9))/8);
    const signal=smooth((pink-threshold)/3)*smooth((da-1.5)/2.5);
    const evidence=smooth((c.s-.82)/.14)*(1-smooth((c.h-.02)/.06)),weight=r.weight*evidence*shadow*highlight*signal;
    if(weight<=0)continue;
    const color=safeRgb(L,A+(newA-A)*weight,B+(newB-B)*weight,A,B);if(!color)continue;
    const rounded=color.map(v=>clamp(Math.round(v),0,255));if(rounded.every((v,j)=>v===pixels[k+j]))continue;
    if(!out)out=new Uint8ClampedArray(pixels);
    for(let j=0;j<3;j++)out[k+j]=rounded[j];
    changedPixels++;counts[r.kind].changedPixels++;maxLightnessError=Math.max(maxLightnessError,Math.abs(toLab(...rounded)[0]-L));
   }
   report.changedPixels+=changedPixels;
   report.regions[eye.name]={status:changedPixels?'changed':'already-target',reason:changedPixels?'excess-eye-pigment-reduced':'within-natural-skin-tolerance',changedPixels,sampleCount:neutral.length,referenceLab:reference,area,visiblePixels:visible,occludedPixels:occluded,maxLightnessError,upper:counts.upper,lower:counts.lower};
  }
  return finish(out||pixels,!!out);
 }catch{
  report.changedPixels=0;
  report.regions={leftEye:unavailable('processing-unavailable'),rightEye:unavailable('processing-unavailable')};
  return finish();
 }
}
