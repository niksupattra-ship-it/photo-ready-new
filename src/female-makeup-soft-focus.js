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

// Estimate nearby healthy colour separately from pore diffusion. Analysis is
// bounded; additive colour corrections are applied to the native skin pixels.
function toneEyeWeight(x,y,zones){
 let weight=1;
 for(const zone of zones){const d=((x-zone.x)/zone.rx)**2+((y-zone.y)/zone.ry)**2;weight*=smooth(1,1.6,d)}
 return weight;
}
function toneReference(pixels,W,x0,y0,w,h,coverage,faceWidth,referenceLight,eyeZones){
 const scale=Math.min(1,480/Math.max(w,h)),aw=Math.max(1,Math.round(w*scale)),ah=Math.max(1,Math.round(h*scale)),n=aw*ah;
 const colors=Array.from({length:3},()=>new Float32Array(n)),weights=new Float32Array(n),counts=new Uint32Array(n);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const a=Math.min(ah-1,Math.floor(y*ah/h))*aw+Math.min(aw-1,Math.floor(x*aw/w)),i=y*w+x,k=((y+y0)*W+x+x0)*4,c=coverage[i]*toneEyeWeight(x,y,eyeZones);counts[a]++;
  if(c<.05||luma(pixels[k],pixels[k+1],pixels[k+2])<referenceLight*.5)continue;
  weights[a]+=c;for(let channel=0;channel<3;channel++)colors[channel][a]+=pixels[k+channel]*c;
 }
 const localLight=new Float32Array(n);
 for(let i=0;i<n;i++){
  if(weights[i])for(const color of colors)color[i]/=weights[i];
  localLight[i]=luma(colors[0][i],colors[1][i],colors[2][i]);
  weights[i]/=Math.max(1,counts[i]);
 }
 const radius=clamp(Math.round(faceWidth*scale*.20),8,96);
 const reference=(weight,r=radius)=>{
  const normal=mean(weight,aw,ah,r),channels=[];
  for(const color of colors){const input=new Float32Array(n);for(let i=0;i<n;i++)input[i]=color[i]*weight[i];const channel=mean(input,aw,ah,r,true);for(let i=0;i<n;i++)channel[i]=normal[i]>.02?channel[i]/normal[i]:color[i];channels.push(channel)}
  return channels;
 };
 const first=reference(weights),healthy=new Float32Array(weights);
 // Downweight visible red/brown patches when finding the nearby reference;
 // do not average the blemish back into the target complexion.
 for(let i=0;i<n;i++){
  const Y=localLight[i],refY=luma(first[0][i],first[1][i],first[2][i]);if(Y<1||refY<1)continue;
  const ratio=Y/refY,red=(colors[0][i]-colors[1][i])-(first[0][i]-first[1][i])*ratio,warm=(colors[0][i]-colors[2][i])-(first[0][i]-first[2][i])*ratio;
  const redSpot=smooth(6,18,red),brown=smooth(4,12,warm)*smooth(4,16,refY-Y);
  healthy[i]*=1-.94*Math.max(redSpot,brown);
 }
 const final=reference(healthy);
 const nearby=reference(healthy,clamp(Math.round(faceWidth*scale*.055),3,24));
 for(let i=0;i<n;i++){
  const nearY=luma(nearby[0][i],nearby[1][i],nearby[2][i]),broadY=luma(final[0][i],final[1][i],final[2][i]),blend=smooth(0,6,nearY-broadY);
  for(let c=0;c<3;c++)final[c][i]+=(nearby[c][i]-final[c][i])*blend;
 }
 const lightRadius=clamp(Math.round(faceWidth*scale*.012),1,6),lightWeight=mean(weights,aw,ah,lightRadius),lowLight=new Float32Array(n);
 for(let i=0;i<n;i++)lowLight[i]=localLight[i]*weights[i];
 mean(lowLight,aw,ah,lightRadius,true).forEach((value,i)=>{lowLight[i]=lightWeight[i]>.05?value/lightWeight[i]:localLight[i]});
 const sample=(field,x,y)=>{
  const px=clamp((x+.5)*aw/w-.5,0,aw-1),py=clamp((y+.5)*ah/h-.5,0,ah-1),ax=Math.floor(px),ay=Math.floor(py),bx=Math.min(aw-1,ax+1),by=Math.min(ah-1,ay+1),tx=px-ax,ty=py-ay;
  return (field[ay*aw+ax]*(1-tx)+field[ay*aw+bx]*tx)*(1-ty)+(field[by*aw+ax]*(1-tx)+field[by*aw+bx]*tx)*ty;
 };
 return {colors:final,localLight:lowLight,sample};
}

// Female MAKEUP output only. Correct localized skin colour independently of
// gentle pore diffusion; retain facial geometry, eye detail and native alpha.
export function finishFemaleMakeupSoftFocus({pixels,width:W,height:H,face,skin,hair}={}){
 const report={version:'female-makeup-soft-focus-v3',status:'unavailable',changedPixels:0,toneChangedPixels:0};
 const unchanged=()=>({pixels,changed:false,report});
 if(!Number.isSafeInteger(W)||!Number.isSafeInteger(H)||W<1||H<1||W*H>8388608||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4)return unchanged();
 const skinAt=confidence(skin,W*H),hairAt=confidence(hair,W*H);
 const features=[...LOCAL_MAKEUP_CONTOURS.eyes,...LOCAL_MAKEUP_CONTOURS.brows,LOCAL_MAKEUP_CONTOURS.lips];
 const required=[...LOCAL_MAKEUP_CONTOURS.face,...features.flat(),98,327];
 if(!skinAt||!hairAt||required.some(id=>!Number.isFinite(face?.[id]?.x)||!Number.isFinite(face?.[id]?.y)))return unchanged();
 const full=id=>({x:face[id].x*W,y:face[id].y*H});
 const a=full(234),b=full(454),faceWidth=Math.hypot(a.x-b.x,a.y-b.y);
 if(faceWidth<48||faceWidth>Math.hypot(W,H))return unchanged();
 const radius=clamp(Math.round(faceWidth*.0045),1,6),guard=clamp(Math.round(faceWidth*.009),2,12);
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
 let evidence=0,skinLight=0,skinWeight=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,original=(y+y0)*W+x+x0,k=original*4,s=skinAt(original),v=hairAt(original);
  if(!Number.isFinite(s)||s<0||s>1||!Number.isFinite(v)||v<0||v>1||pixels[k+3]!==255)continue;
  coverage[i]=faceMask[i]*smooth(.6,.98,s)*(1-smooth(.01,.08,v))*(1-details[i])*(1-smooth(0,.18,detailSoft[i]))*smooth(.45,.98,faceSoft[i]);
  skinLight+=luma(pixels[k],pixels[k+1],pixels[k+2])*coverage[i];skinWeight+=coverage[i];
  if(coverage[i]>.5)evidence++;
 }
 if(evidence<64)return unchanged();
 const referenceLight=skinLight/skinWeight;
 faceMask=null;details=null;faceSoft=null;detailSoft=null;
 const eyeZones=[[33,133],[362,263]].map(([left,right])=>{const a=point(left),b=point(right),width=Math.hypot(b.x-a.x,b.y-a.y);return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,rx:width*.78,ry:width*.45}});
 const tone=toneReference(pixels,W,x0,y0,w,h,coverage,faceWidth,referenceLight,eyeZones);
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
  if(residual< -30||Y<average*.55||Y<referenceLight*.5||Y>246)continue;
  const variance=Math.max(0,meanSquare[i]/weight[i]-average*average);
  // Leave already soft skin and its fine grain alone. Even rougher skin keeps
  // most native microtexture, with a small correction instead of full diffusion.
  const activity=smooth(1.5,4,Math.sqrt(variance));
  const strength=.28*activity*coverage[i]*(160/(160+variance))*(1-smooth(12,26,Math.abs(residual)));
  let dr=(r-pixels[k])*strength,dg=(g-pixels[k+1])*strength,db=(b-pixels[k+2])*strength;
  const largest=Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db)),limit=largest>3?3/largest:1;
  dr*=limit;dg*=limit;db*=limit;
  const tr=tone.sample(tone.colors[0],x,y),tg=tone.sample(tone.colors[1],x,y),tb=tone.sample(tone.colors[2],x,y),refY=luma(tr,tg,tb);
  if(refY>20){
   const localY=tone.sample(tone.localLight,x,y),ratio=localY/refY,red=(pixels[k]-pixels[k+1])-(tr-tg)*ratio,warm=(pixels[k]-pixels[k+2])-(tr-tb)*ratio;
   const redSpot=smooth(6,18,red),brown=smooth(4,12,warm)*smooth(4,16,Math.max(refY-localY,warm*1.5)),amount=Math.max(redSpot*.78,brown*.85)*coverage[i]*toneEyeWeight(x,y,eyeZones);
   if(amount>.01){
    // Adjust low-frequency tone while retaining the pixel's own fine shading.
    const detail=Y-localY;
    const lift=clamp(refY-localY,-12,28)*.9+clamp(detail,-6,6)-detail,targetRatio=(Y+lift)/refY;
    dr+=clamp((tr*targetRatio-pixels[k])*amount,-24,24);dg+=clamp((tg*targetRatio-pixels[k+1])*amount,-24,24);db+=clamp((tb*targetRatio-pixels[k+2])*amount,-24,24);
    report.toneChangedPixels++;
   }
  }
  const nr=clamp(Math.round(pixels[k]+dr),0,255),ng=clamp(Math.round(pixels[k+1]+dg),0,255),nb=clamp(Math.round(pixels[k+2]+db),0,255);
  if(nr===pixels[k]&&ng===pixels[k+1]&&nb===pixels[k+2])continue;
  if(!out)out=new Uint8ClampedArray(pixels);
  out[k]=nr;out[k+1]=ng;out[k+2]=nb;
  report.changedPixels++;
 }
 report.status=out?'softened':'already-smooth';
 return {pixels:out||pixels,changed:!!out,report};
}
