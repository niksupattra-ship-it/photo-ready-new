import {LOCAL_MAKEUP_CONTOURS} from './local-makeup.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const inside=(x,y,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)yes=!yes;return yes};
function distance(x,y,p){let d=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1));d=Math.min(d,Math.hypot(x-a.x-dx*t,y-a.y-dy*t))}return d}
// Bounded neutral fill on existing skin RGB only; no generation, resize, blur,
// hue tint or alpha edits. Face/neck maxima apply to dark midtones, not highlights.
export function fillPortraitShadows({pixels,width:w,height:h,face,skin,hair}){
 const unchanged=()=>({pixels,changed:false});
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w*h>33554432||pixels?.length!==w*h*4||skin?.length!==w*h||hair&&hair.length!==w*h)return unchanged();
 const contours=[LOCAL_MAKEUP_CONTOURS.face,...LOCAL_MAKEUP_CONTOURS.eyes,...LOCAL_MAKEUP_CONTOURS.brows,LOCAL_MAKEUP_CONTOURS.lips];
 if(!face||[...contours.flat(),152,234,454].some(i=>!Number.isFinite(face[i]?.x)||!Number.isFinite(face[i]?.y)))return unchanged();
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),fw=Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h);
 if(fw<64)return unchanged();
 const oval=LOCAL_MAKEUP_CONTOURS.face.map(point),chin=point(152),centre=(point(234).x+point(454).x)/2;
 const protectedPolys=[...LOCAL_MAKEUP_CONTOURS.eyes.map(ids=>({p:ids.map(point),pad:fw*.045})),...LOCAL_MAKEUP_CONTOURS.brows.map(ids=>({p:ids.map(point),pad:fw*.018})),{p:LOCAL_MAKEUP_CONTOURS.lips.map(point),pad:fw*.025}];
 const x0=Math.max(0,Math.floor(centre-fw*.8)),x1=Math.min(w,Math.ceil(centre+fw*.8)),y0=Math.max(0,Math.floor(Math.min(...oval.map(p=>p.y)))),y1=Math.min(h,Math.ceil(chin.y+fw*.95));
 const out=new Uint8ClampedArray(pixels);let changed=false;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const n=y*w+x,k=n*4,confidence=skin[n];
  if(!Number.isFinite(confidence)||confidence<=.5||pixels[k+3]<248||hair&&(!Number.isFinite(hair[n])||hair[n]>.2))continue;
  const inFace=inside(x+.5,y+.5,oval);
  if(!inFace&&(y<chin.y-fw*.08||Math.abs(x-centre)>fw*.55))continue;
  const r=pixels[k],g=pixels[k+1],b=pixels[k+2],Y=.2126*r+.7152*g+.0722*b,peak=Math.max(r,g,b);
  // Leave black contact details and bright/specular skin unchanged.
  if(Y<35||Y>=225||peak>=248)continue;
  let feature=1;
  for(const q of protectedPolys){if(inside(x+.5,y+.5,q.p)){feature=0;break}feature=Math.min(feature,smooth(q.pad,q.pad+fw*.018,distance(x+.5,y+.5,q.p)))}
  if(feature<=0)continue;
  const neck=smooth(chin.y-fw*.1,chin.y+fw*.12,y),maxGain=.09*(1-neck)+.065*neck;
  const boundary=inFace?smooth(0,fw*.018,distance(x+.5,y+.5,oval)):1;
  const shadow=smooth(35,65,Y)*(1-smooth(125,225,Y));
  const gain=1+Math.min(maxGain*shadow*smooth(.5,.9,confidence)*feature*boundary,Math.max(0,247/Math.max(1,peak)-1));
  for(let c=0;c<3;c++){const v=Math.round(pixels[k+c]*gain);if(v!==pixels[k+c])changed=true;out[k+c]=v}
 }
 return {pixels:changed?out:pixels,changed};
}
