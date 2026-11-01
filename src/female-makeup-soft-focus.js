import {LOCAL_MAKEUP_CONTOURS} from './local-makeup.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;

// Bounded linear work at the native face resolution; no image resize or warp.
function mean(input,w,h,r,reuse=false){
 const row=new Float32Array(input.length),out=reuse?input:new Float32Array(input.length),n=2*r+1;
 for(let y=0;y<h;y++){
  const start=y*w;let sum=0;
  for(let dx=-r;dx<=r;dx++)sum+=input[start+clamp(dx,0,w-1)];
  for(let x=0;x<w;x++){row[start+x]=sum/n;sum+=input[start+Math.min(w-1,x+r+1)]-input[start+Math.max(0,x-r)]}
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let dy=-r;dy<=r;dy++)sum+=row[clamp(dy,0,h-1)*w+x];
  for(let y=0;y<h;y++){out[y*w+x]=sum/n;sum+=row[Math.min(h-1,y+r+1)*w+x]-row[Math.max(0,y-r)*w+x]}
 }
 return out;
}

function polygon(plane,points,w,h){
 const top=clamp(Math.floor(Math.min(...points.map(p=>p.y))),0,h),bottom=clamp(Math.ceil(Math.max(...points.map(p=>p.y))),0,h);
 for(let y=top;y<bottom;y++){
  const scan=y+.5,hits=[];
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];
   if((a.y>scan)!==(b.y>scan))hits.push(a.x+(scan-a.y)*(b.x-a.x)/(b.y-a.y));
  }
  hits.sort((a,b)=>a-b);
  for(let i=0;i+1<hits.length;i+=2){
   const left=clamp(Math.ceil(hits[i]-.5),0,w),right=clamp(Math.ceil(hits[i+1]-.5),0,w);
   plane.fill(1,y*w+left,y*w+right);
  }
 }
}

function confidence(mask,n){
 if(!mask)return null;
 if(mask.length===n*4)return i=>mask[i*4+3]/255;
 if(mask.length!==n)return null;
 if(mask instanceof Float32Array||mask instanceof Float64Array)return i=>mask[i];
 if(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)return i=>mask[i]/255;
 return null;
}

// Female MAKEUP output only. Selective microcontrast reduction supplies the
// requested soft-focus skin without changing exposure, cosmetics or geometry.
export function finishFemaleMakeupSoftFocus({pixels,width:W,height:H,face,skin,hair}={}){
 const report={version:'female-makeup-soft-focus-v1',status:'unavailable',changedPixels:0};
 const unchanged=()=>({pixels,changed:false,report});
 if(!Number.isSafeInteger(W)||!Number.isSafeInteger(H)||W<1||H<1||W*H>8388608||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4)return unchanged();
 const skinAt=confidence(skin,W*H),hairAt=confidence(hair,W*H);
 const features=[...LOCAL_MAKEUP_CONTOURS.eyes,...LOCAL_MAKEUP_CONTOURS.brows,LOCAL_MAKEUP_CONTOURS.lips];
 const required=[...LOCAL_MAKEUP_CONTOURS.face,...features.flat(),98,327];
 if(!skinAt||!hairAt||required.some(id=>!Number.isFinite(face?.[id]?.x)||!Number.isFinite(face?.[id]?.y)))return unchanged();
 const full=id=>({x:face[id].x*W,y:face[id].y*H});
 const a=full(234),b=full(454),faceWidth=Math.hypot(a.x-b.x,a.y-b.y);
 if(faceWidth<48||faceWidth>Math.hypot(W,H))return unchanged();
 const radius=clamp(Math.round(faceWidth*.009),2,12),guard=clamp(Math.round(faceWidth*.009),2,12);
 const oval=LOCAL_MAKEUP_CONTOURS.face.map(full),padding=radius+guard+2;
 const x0=clamp(Math.floor(Math.min(...oval.map(p=>p.x)))-padding,0,W),x1=clamp(Math.ceil(Math.max(...oval.map(p=>p.x)))+padding,0,W);
 const y0=clamp(Math.floor(Math.min(...oval.map(p=>p.y)))-padding,0,H),y1=clamp(Math.ceil(Math.max(...oval.map(p=>p.y)))+padding,0,H);
 const w=x1-x0,h=y1-y0,n=w*h;if(w<12||h<12)return unchanged();
 const point=id=>{const p=full(id);return {x:p.x-x0,y:p.y-y0}};
 let faceMask=new Float32Array(n),details=new Float32Array(n);
 polygon(faceMask,LOCAL_MAKEUP_CONTOURS.face.map(point),w,h);
 for(const ids of features)polygon(details,ids.map(point),w,h);
 // Nostril openings stay sharp; nose skin itself can receive pore diffusion.
 for(const id of [98,327]){
  const p=point(id),rx=Math.max(2,faceWidth*.019),ry=Math.max(2,faceWidth*.014);
  for(let y=Math.max(0,Math.floor(p.y-ry));y<Math.min(h,Math.ceil(p.y+ry));y++)for(let x=Math.max(0,Math.floor(p.x-rx));x<Math.min(w,Math.ceil(p.x+rx));x++)if(((x+.5-p.x)/rx)**2+((y+.5-p.y)/ry)**2<=1)details[y*w+x]=1;
 }
 let faceSoft=mean(faceMask,w,h,guard),detailSoft=mean(details,w,h,guard);
 const coverage=new Float32Array(n);
 let evidence=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,original=(y+y0)*W+x+x0,k=original*4,s=skinAt(original),v=hairAt(original);
  if(!Number.isFinite(s)||s<0||s>1||!Number.isFinite(v)||v<0||v>1||pixels[k+3]!==255)continue;
  coverage[i]=faceMask[i]*smooth(.6,.98,s)*(1-smooth(.01,.08,v))*(1-details[i])*(1-smooth(0,.18,detailSoft[i]))*smooth(.45,.98,faceSoft[i]);
  if(coverage[i]>.5)evidence++;
 }
 if(evidence<64)return unchanged();
 faceMask=null;details=null;faceSoft=null;detailSoft=null;
 const weight=mean(coverage,w,h,radius),channels=[],square=new Float32Array(n);
 for(let c=0;c<3;c++){
  const input=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;input[i]=pixels[((y+y0)*W+x+x0)*4+c]*coverage[i]}
  channels.push(mean(input,w,h,radius,true));
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,k=((y+y0)*W+x+x0)*4,Y=luma(pixels[k],pixels[k+1],pixels[k+2]);square[i]=Y*Y*coverage[i]}
 const meanSquare=mean(square,w,h,radius,true);
 let out=null;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(coverage[i]<.001||weight[i]<.05)continue;
  const k=((y+y0)*W+x+x0)*4,r=channels[0][i]/weight[i],g=channels[1][i]/weight[i],b=channels[2][i]/weight[i],average=luma(r,g,b),Y=luma(pixels[k],pixels[k+1],pixels[k+2]),residual=Y-average;
  // Keep isolated dark identifying marks, deep creases and bright speculars.
  // Their strong residual is distinct from low-contrast pore microtexture.
  if(residual< -30||Y<average*.55||Y>246)continue;
  const variance=Math.max(0,meanSquare[i]/weight[i]-average*average);
  const strength=.9*coverage[i]*(160/(160+variance))*(1-smooth(20,38,Math.abs(residual)));
  const dr=(r-pixels[k])*strength,dg=(g-pixels[k+1])*strength,db=(b-pixels[k+2])*strength;
  const largest=Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db)),limit=largest>20?20/largest:1;
  const nr=clamp(Math.round(pixels[k]+dr*limit),0,255),ng=clamp(Math.round(pixels[k+1]+dg*limit),0,255),nb=clamp(Math.round(pixels[k+2]+db*limit),0,255);
  if(nr===pixels[k]&&ng===pixels[k+1]&&nb===pixels[k+2])continue;
  if(!out)out=new Uint8ClampedArray(pixels);
  out[k]=nr;out[k+1]=ng;out[k+2]=nb;
  report.changedPixels++;
 }
 report.status=out?'softened':'already-smooth';
 return {pixels:out||pixels,changed:!!out,report};
}
