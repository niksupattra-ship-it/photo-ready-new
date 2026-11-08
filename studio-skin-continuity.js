import {parseStudioSkinEvidence} from './studio-skin-treatment.js';

const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const BROWS=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
const LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const Y=(r,g,b)=>r*.2126+g*.7152+b*.0722;
const invalid=()=>Object.assign(Error('ข้อมูลพื้นที่ผิวไม่ตรงกับรูปต้นฉบับ กรุณาลองใหม่'),{status:400,code:'studio_skin_evidence_invalid'});
function polygon(plane,points,w,h){
 const top=clamp(Math.floor(Math.min(...points.map(p=>p[1]))),0,h),bottom=clamp(Math.ceil(Math.max(...points.map(p=>p[1]))),0,h);
 for(let y=top;y<bottom;y++){
  const hits=[],scan=y+.5;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];if((a[1]>scan)!==(b[1]>scan))hits.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)plane.fill(1,y*w+clamp(Math.ceil(hits[i]-.5),0,w),y*w+clamp(Math.ceil(hits[i+1]-.5),0,w));
 }
}
function mean(input,w,h,r,scratch){
 const out=new Float32Array(input.length),n=2*r+1;
 for(let y=0;y<h;y++){
  const row=y*w;let sum=0;for(let dx=-r;dx<=r;dx++)sum+=input[row+clamp(dx,0,w-1)];
  for(let x=0;x<w;x++){scratch[row+x]=sum/n;sum+=input[row+Math.min(w-1,x+r+1)]-input[row+Math.max(0,x-r)]}
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let dy=-r;dy<=r;dy++)sum+=scratch[clamp(dy,0,h-1)*w+x];
  for(let y=0;y<h;y++){out[y*w+x]=sum/n;sum+=scratch[Math.min(h-1,y+r+1)*w+x]-scratch[Math.max(0,y-r)*w+x]}
 }
 return out;
}

// Continue the low-frequency correction through SKIN around brow heads and
// mouth corners. The protected feature pigment itself is never pasted, blurred
// or recoloured. originalPixels is the normalized source BEFORE the base pass.
export function repairStudioSkinContinuity({originalPixels,pixels,width:W,height:H,evidence}={}){
 const e=parseStudioSkinEvidence(evidence),valid=p=>(p instanceof Uint8Array||p instanceof Uint8ClampedArray)&&p.length===W*H*4;
 if(W!==e.width||H!==e.height||!valid(originalPixels)||!valid(pixels))throw invalid();
 const point=id=>[e.face[id][0]*W,e.face[id][1]*H],a=point(234),b=point(454),fw=Math.hypot(a[0]-b[0],a[1]-b[1]);
 // Keep temporary fields local even for a large native face or a very wide
 // client polygon. The protected guard is at most 45px; 192px still provides
 // ample neighbouring skin without allocating face-sized Float32 planes.
 const radius=clamp(fw*.09,5,192),inner=Math.min(radius*.45,Math.max(2,fw*.035)),fieldR=clamp(Math.round(fw*.045),3,90),currentR=clamp(Math.round(fw*.009),1,18),donorGuardR=clamp(Math.ceil(fw*.022),2,45),rimR=clamp(Math.round(fw*.002),1,4);
 const report={version:'studio-skin-continuity-v1',status:'unchanged',regions:4,changedPixels:0,protectedPigmentPixels:0,maxChannelDelta:0,maxRegionPixels:0,donorSamples:0,meanCorrectionGapBefore:0,meanCorrectionGapAfter:0};
 const labelAt=(x,y)=>e.labels[Math.min(e.maskHeight-1,Math.floor(y*e.maskHeight/H))*e.maskWidth+Math.min(e.maskWidth-1,Math.floor(x*e.maskWidth/W))];
 const used=new Map();let out=null,gapBefore=0,gapAfter=0,gapWeight=0;
 for(const id of [55,285,61,291]){
  const centre=point(id),padding=radius+fieldR+donorGuardR+currentR+3,x0=clamp(Math.floor(centre[0]-padding),0,W),y0=clamp(Math.floor(centre[1]-padding),0,H),x1=clamp(Math.ceil(centre[0]+padding),0,W),y1=clamp(Math.ceil(centre[1]+padding),0,H),w=x1-x0,h=y1-y0,n=w*h;
  if(!n)continue;report.maxRegionPixels=Math.max(report.maxRegionPixels,n);
  const local=ids=>ids.map(i=>{const p=point(i);return[p[0]-x0,p[1]-y0]}),hard=new Float32Array(n),brows=new Float32Array(n),all=new Float32Array(n),scratch=new Float32Array(n),skin=new Float32Array(n),sourceY=new Float32Array(n);
  for(const ids of [...EYES,LIPS])polygon(hard,local(ids),w,h);
  for(const ids of BROWS)polygon(brows,local(ids),w,h);
  for(const i of [98,327]){
   const p=point(i),cx=p[0]-x0,cy=p[1]-y0,rx=Math.max(1.5,fw*.021),ry=Math.max(1.5,fw*.016);
   for(let y=clamp(Math.floor(cy-ry),0,h);y<Math.min(h,cy+ry+1);y++)for(let x=clamp(Math.floor(cx-rx),0,w);x<Math.min(w,cx+rx+1);x++)if(((x+.5-cx)/rx)**2+((y+.5-cy)/ry)**2<=1)hard[y*w+x]=1;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,gx=x+x0,gy=y+y0,k=(gy*W+gx)*4,label=labelAt(gx,gy);all[i]=Math.max(hard[i],brows[i]);sourceY[i]=Y(originalPixels[k],originalPixels[k+1],originalPixels[k+2]);
   if((label===2||label===3)&&originalPixels[k+3]===255&&pixels[k+3]===255)skin[i]=1;
  }
  const wideGuard=mean(all,w,h,donorGuardR,scratch),hardRim=mean(hard,w,h,rimR,scratch),hardFeather=mean(hard,w,h,rimR+1,scratch),browRim=mean(brows,w,h,rimR,scratch),sourceSmall=mean(sourceY,w,h,currentR,scratch),donor=new Float32Array(n),weighted=new Float32Array(n);
  for(let i=0;i<n;i++){donor[i]=skin[i]&&wideGuard[i]<.0001&&sourceY[i]>5?1:0;weighted[i]=sourceY[i]*donor[i];if(donor[i])report.donorSamples++}
  const donorMean=mean(donor,w,h,fieldR,scratch),healthyLight=mean(weighted,w,h,fieldR,scratch),currentWeight=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,k=((y+y0)*W+x+x0)*4;weighted[i]=(originalPixels[k]-originalPixels[k+1])*donor[i]}
  const healthyRed=mean(weighted,w,h,fieldR,scratch);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,k=((y+y0)*W+x+x0)*4;weighted[i]=(originalPixels[k]-originalPixels[k+2])*donor[i]}
  const healthyBrown=mean(weighted,w,h,fieldR,scratch);
  for(let i=0;i<n;i++){
   if(!skin[i]||hard[i])continue;
   const healthy=donorMean[i]>.025?healthyLight[i]/donorMean[i]:sourceY[i];
   const k=((Math.floor(i/w)+y0)*W+i%w+x0)*4;
   // Keep the actual dark/coloured/white antialias edge; adjacent normal skin
   // is allowed to receive a feathered correction instead of a zeroed moat.
   const edgePigment=hardRim[i]>.0001&&donorMean[i]>.025&&(healthy-sourceY[i]>9||sourceY[i]-healthy>25||Math.abs(originalPixels[k]-originalPixels[k+1]-healthyRed[i]/donorMean[i])>8||Math.abs(originalPixels[k]-originalPixels[k+2]-healthyBrown[i]/donorMean[i])>11);
   if(edgePigment){report.protectedPigmentPixels++;continue}
   const pigment=brows[i]||browRim[i]>.0001?Math.max(smooth(9,23,healthy-sourceY[i]),smooth(4,11,sourceSmall[i]-sourceY[i])):0;
   if(pigment>=.995){report.protectedPigmentPixels++;continue}
   currentWeight[i]=(1-pigment)*(1-smooth(.12,.65,hardFeather[i]));
  }
  const currentMean=mean(currentWeight,w,h,currentR,scratch),fields=[];
  for(let c=0;c<3;c++){
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,k=((y+y0)*W+x+x0)*4;weighted[i]=clamp(pixels[k+c]-originalPixels[k+c],-32,32)*donor[i]}
   const target=mean(weighted,w,h,fieldR,scratch);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,k=((y+y0)*W+x+x0)*4;weighted[i]=(pixels[k+c]-originalPixels[k+c])*currentWeight[i]}
   const current=mean(weighted,w,h,currentR,scratch);
   for(let i=0;i<n;i++)target[i]=donorMean[i]>.04&&currentMean[i]>.05?clamp(target[i]/donorMean[i]-current[i]/currentMean[i],-24,24):0;
   fields.push(target);
  }
  for(let y=Math.max(y0,Math.floor(centre[1]-radius));y<Math.min(y1,centre[1]+radius+1);y++)for(let x=Math.max(x0,Math.floor(centre[0]-radius));x<Math.min(x1,centre[0]+radius+1);x++){
   const i=(y-y0)*w+x-x0,index=y*W+x,k=index*4,d=Math.hypot(x+.5-centre[0],y+.5-centre[1]),strength=(1-smooth(inner,radius,d))*currentWeight[i];
   if(strength<.001||strength<=(used.get(index)||0))continue;
   let changed=false;
   for(let c=0;c<3;c++){
    const diff=fields[c][i],delta=diff*strength,next=Math.round(clamp(pixels[k+c]+delta,0,255));
    gapBefore+=Math.abs(diff)*strength;gapAfter+=Math.abs(diff-delta)*strength;gapWeight+=strength;
    if(next!==pixels[k+c]){if(!out)out=new Uint8ClampedArray(pixels);out[k+c]=next;changed=true;report.maxChannelDelta=Math.max(report.maxChannelDelta,Math.abs(next-pixels[k+c]))}
   }
   if(changed){if(!used.has(index))report.changedPixels++;used.set(index,strength)}
  }
 }
 report.meanCorrectionGapBefore=gapWeight?gapBefore/gapWeight:0;report.meanCorrectionGapAfter=gapWeight?gapAfter/gapWeight:0;report.status=out?'applied':'unchanged';return {pixels:out||pixels,changed:Boolean(out),report};
}
