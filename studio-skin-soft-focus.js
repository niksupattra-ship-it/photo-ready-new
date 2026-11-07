import {parseStudioSkinEvidence} from './studio-skin-treatment.js';

const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const FEATURES=[
 [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],
 [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],
 [70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285],
 [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]
];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const invalid=()=>Object.assign(Error('ข้อมูลพื้นที่ผิวไม่ตรงกับรูปต้นฉบับ กรุณาลองใหม่'),{status:400,code:'studio_skin_evidence_invalid'});

function polygon(plane,points,w,h){
 const top=clamp(Math.floor(Math.min(...points.map(p=>p[1]))),0,h),bottom=clamp(Math.ceil(Math.max(...points.map(p=>p[1]))),0,h);
 for(let y=top;y<bottom;y++){
  const hits=[],scan=y+.5;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];if((a[1]>scan)!==(b[1]>scan))hits.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  hits.sort((a,b)=>a-b);
  for(let i=0;i+1<hits.length;i+=2)plane.fill(1,y*w+clamp(Math.ceil(hits[i]-.5),0,w),y*w+clamp(Math.ceil(hits[i+1]-.5),0,w));
 }
}
function mean(input,w,h,r,scratch,out=new Float32Array(input.length)){
 const n=2*r+1;
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

// Two native-frequency bands receive selective contrast reduction. The broad
// tone/lighting field has already been prepared separately. No pixel is moved,
// no texture is invented, and the diffuse impression is confined to real skin.
export function applyStudioSkinSoftFocus({pixels,width:W,height:H,evidence}={}){
 const e=parseStudioSkinEvidence(evidence);
 if(W!==e.width||H!==e.height||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4)throw invalid();
 const point=id=>[e.face[id][0]*W,e.face[id][1]*H],oval=OVAL.map(point),left=point(234),right=point(454),chin=point(152);
 const fw=Math.hypot(right[0]-left[0],right[1]-left[1]),cx=(left[0]+right[0])/2;
 const smallRadius=clamp(Math.round(fw*.0035),1,7),wideRadius=clamp(Math.round(fw*.018),3,28),guardRadius=clamp(Math.round(fw*.004),1,8),edgeRadius=clamp(Math.round(fw*.009),2,16);
 const markRadius=Math.max(1,smallRadius),halo=wideRadius*2+edgeRadius+guardRadius+markRadius+4,tileSize=384;
 const x0=clamp(Math.floor(Math.min(...oval.map(p=>p[0]))-fw*.16),0,W),x1=clamp(Math.ceil(Math.max(...oval.map(p=>p[0]))+fw*.16),0,W);
 const y0=clamp(Math.floor(Math.min(...oval.map(p=>p[1]))-fw*.025),0,H),y1=clamp(Math.ceil(chin[1]+fw*.78),0,H);
 const report={version:e.version+'/soft-focus-v1',status:'unchanged',changedPixels:0,wrinklePixels:0,texturePixels:0,maxChannelDelta:0,maxDiffuseLift:0,roiPixels:Math.max(0,x1-x0)*Math.max(0,y1-y0),maxTilePixels:0,tiles:0,smallRadius,wideRadius};
 const labelAt=(x,y)=>e.labels[Math.min(e.maskHeight-1,Math.floor(y*e.maskHeight/H))*e.maskWidth+Math.min(e.maskWidth-1,Math.floor(x*e.maskWidth/W))];
 let out=null;
 for(let ty=y0;ty<y1;ty+=tileSize)for(let tx=x0;tx<x1;tx+=tileSize){
  const endX=Math.min(x1,tx+tileSize),endY=Math.min(y1,ty+tileSize),sx=Math.max(0,tx-halo),sy=Math.max(0,ty-halo),ex=Math.min(W,endX+halo),ey=Math.min(H,endY+halo),w=ex-sx,h=ey-sy,n=w*h;
  if(!n)continue;report.tiles++;report.maxTilePixels=Math.max(report.maxTilePixels,n);
  const lum=new Float32Array(n),faceMask=new Float32Array(n),features=new Float32Array(n),scratch=new Float32Array(n);
  const local=points=>points.map(p=>[p[0]-sx,p[1]-sy]);
  polygon(faceMask,local(oval),w,h);for(const ids of FEATURES)polygon(features,local(ids.map(point)),w,h);
  for(const id of [98,327]){
   const p=point(id),px=p[0]-sx,py=p[1]-sy,rx=Math.max(1.5,fw*.021),ry=Math.max(1.5,fw*.015);
   for(let y=clamp(Math.floor(py-ry),0,h);y<Math.min(h,py+ry+1);y++)for(let x=clamp(Math.floor(px-rx),0,w);x<Math.min(w,px+rx+1);x++)if(((x+.5-px)/rx)**2+((y+.5-py)/ry)**2<=1)features[y*w+x]=1;
  }
  const featureSoft=mean(features,w,h,guardRadius,scratch),edge=mean(faceMask,w,h,edgeRadius,scratch),coverage=new Float32Array(n);
  let support=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,gx=x+sx,gy=y+sy,k=(gy*W+gx)*4,label=labelAt(gx,gy),Y=luma(pixels[k],pixels[k+1],pixels[k+2]);lum[i]=Y;
   if((label!==2&&label!==3)||pixels[k+3]!==255||features[i]||featureSoft[i]>.0001)continue;
   const neck=gy>=chin[1]+fw*.025&&gy<=chin[1]+fw*.74&&Math.abs(gx-cx)<fw*.40;
   // The silhouette and jaw boundary stay exact; the neck has a gradual lower
   // fade rather than a separate patch. Eye-adjacent skin remains eligible.
   const region=faceMask[i]?smooth(.68,.98,edge[i]):neck ? .55*(1-smooth(chin[1]+fw*.55,chin[1]+fw*.74,gy)):0;
   if(region>0){coverage[i]=region;support++}
  }
  if(support<16)continue;
  const weighted=new Float32Array(n);for(let i=0;i<n;i++)weighted[i]=lum[i]*coverage[i];
  const smallWeight=mean(coverage,w,h,smallRadius,scratch),wideWeight=mean(coverage,w,h,wideRadius,scratch);
  const small=mean(weighted,w,h,smallRadius,scratch),wide=mean(weighted,w,h,wideRadius,scratch);
  for(let i=0;i<n;i++){small[i]=smallWeight[i]>.04?small[i]/smallWeight[i]:lum[i];wide[i]=wideWeight[i]>.04?wide[i]/wideWeight[i]:lum[i]}
  const marks=new Float32Array(n),ring=Math.max(2,smallRadius*2),dirs=[[1,0],[0,1],[.7071,.7071],[.7071,-.7071]];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x;if(!coverage[i])continue;
   const darkness=wide[i]-lum[i];if(lum[i]<42||darkness>32){marks[i]=1;continue}
   if(darkness>18){
    let lo=Infinity,hi=-Infinity;
    for(const [dx,dy]of dirs){const a=clamp(Math.round(x+dx*ring),0,w-1),b=clamp(Math.round(y+dy*ring),0,h-1),c=clamp(Math.round(x-dx*ring),0,w-1),d=clamp(Math.round(y-dy*ring),0,h-1),pair=(lum[b*w+a]+lum[d*w+c])/2;lo=Math.min(lo,pair);hi=Math.max(hi,pair)}
    // A round dark mark has similar support in every direction. An elongated
    // fine crease has a darker along-line pair and lighter cross-line pair.
    if(hi-lo<7||lo>wide[i]-5)marks[i]=1;
   }
  }
  // Carry edge evidence through the interior of a larger dark mark. Its
  // centre can be locally flat, so a high-pass test alone would miss it.
  const markQueue=new Int32Array(n);let markHead=0,markTail=0;
  for(let i=0;i<n;i++)if(marks[i]){markQueue[markTail++]=i;weighted[i]=lum[i]+10}
  while(markHead<markTail){
   const i=markQueue[markHead++],x=i%w,limit=weighted[i];
   for(const next of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1])if(next>=0&&!marks[next]&&coverage[next]>.1&&lum[next]<limit){marks[next]=1;weighted[next]=limit;markQueue[markTail++]=next}
  }
  const markGuard=mean(marks,w,h,markRadius,scratch);
  for(let gy=ty;gy<endY;gy++)for(let gx=tx;gx<endX;gx++){
   const x=gx-sx,y=gy-sy,i=y*w+x,k=(gy*W+gx)*4,a=coverage[i];if(a<.01||smallWeight[i]<.12||wideWeight[i]<.12||markGuard[i]>.0001)continue;
   const Y=lum[i],peak=Math.max(pixels[k],pixels[k+1],pixels[k+2]);if(Y<42||Y>=232||peak>=248)continue;
   const fine=Y-small[i],middle=small[i]-wide[i],residual=Y-wide[i],edgeGate=1-smooth(22,44,Math.abs(residual));
   const texture=-fine*.42,microWrinkle=-middle*.70;
   const diffuse=1.8*smooth(55,160,wide[i])*(1-smooth(200,235,wide[i]));
   const delta=clamp((texture+microWrinkle)*edgeGate+diffuse,-15,18)*a;
   let changed=false;
   for(let c=0;c<3;c++){
    const next=Math.round(clamp(pixels[k+c]+delta,0,255));
    if(next!==pixels[k+c]){if(!out)out=new Uint8ClampedArray(pixels);out[k+c]=next;changed=true;report.maxChannelDelta=Math.max(report.maxChannelDelta,Math.abs(next-pixels[k+c]))}
   }
   if(changed){report.changedPixels++;report.maxDiffuseLift=Math.max(report.maxDiffuseLift,diffuse*a);if(middle< -1)report.wrinklePixels++;if(Math.abs(fine)>1)report.texturePixels++}
  }
 }
 report.status=out?'applied':'unchanged';return {pixels:out||pixels,changed:Boolean(out),report};
}
