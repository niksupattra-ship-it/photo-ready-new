import {parseStudioSkinEvidence} from './studio-skin-treatment.js';

const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const FEATURES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285],[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]];
const DIRS=[[1,0],[0,1],[.70710678,.70710678],[.70710678,-.70710678]];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const Y=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const invalid=()=>Object.assign(Error('ข้อมูลพื้นที่ผิวไม่ตรงกับรูปต้นฉบับ กรุณาลองใหม่'),{status:400,code:'studio_skin_evidence_invalid'});
function polygon(out,points,w,h){
 const top=clamp(Math.floor(Math.min(...points.map(p=>p[1]))),0,h),bottom=clamp(Math.ceil(Math.max(...points.map(p=>p[1]))),0,h);
 for(let y=top;y<bottom;y++){
  const hits=[],scan=y+.5;
  for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i];if((a[1]>scan)!==(b[1]>scan))hits.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]))}
  hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)out.fill(1,y*w+clamp(Math.ceil(hits[i]-.5),0,w),y*w+clamp(Math.ceil(hits[i+1]-.5),0,w));
 }
}
function mean(input,w,h,r,scratch){
 const out=new Float32Array(input.length),n=2*r+1;
 for(let y=0;y<h;y++){const row=y*w;let sum=0;for(let dx=-r;dx<=r;dx++)sum+=input[row+clamp(dx,0,w-1)];for(let x=0;x<w;x++){scratch[row+x]=sum/n;sum+=input[row+Math.min(w-1,x+r+1)]-input[row+Math.max(0,x-r)]}}
 for(let x=0;x<w;x++){let sum=0;for(let dy=-r;dy<=r;dy++)sum+=scratch[clamp(dy,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/n;sum+=scratch[Math.min(h-1,y+r+1)*w+x]-scratch[Math.max(0,y-r)*w+x]}}
 return out;
}
const median=values=>{if(!values.length)return 0;values.sort((a,b)=>a-b);return values[values.length>>1]};
function noise(x,y){let n=Math.imul(x|0,0x1f123bb5)^Math.imul(y|0,0x5f356495)^0x6c8e9cf5;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/2147483647.5-1}
function grain(x,y){return (noise(x,y)-(noise(x-1,y)+noise(x+1,y)+noise(x,y-1)+noise(x,y+1))*.25)*1.5}

// Repair local defects, then harmonize a very fine skin grain and control shine.
// Added microtexture is deliberately synthetic low-amplitude photographic grain;
// it is not described as recovered original pores. Coordinates never move.
export function applyStudioSkinRetouch({pixels,width:W,height:H,evidence}={}){
 const e=parseStudioSkinEvidence(evidence);
 if(W!==e.width||H!==e.height||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4)throw invalid();
 const point=id=>[e.face[id][0]*W,e.face[id][1]*H],oval=OVAL.map(point),left=point(234),right=point(454),chin=point(152),fw=Math.hypot(right[0]-left[0],right[1]-left[1]),cx=(left[0]+right[0])/2;
 const smallR=clamp(Math.round(fw*.0035),1,7),ring=clamp(Math.round(fw*.016),4,20),wideR=clamp(Math.round(fw*.045),7,32),guardR=clamp(Math.round(fw*.004),1,8),edgeR=clamp(Math.round(fw*.009),2,16),tileSize=320,halo=wideR*3+ring*2+edgeR+guardR+8;
 const x0=clamp(Math.floor(Math.min(...oval.map(p=>p[0]))),0,W),x1=clamp(Math.ceil(Math.max(...oval.map(p=>p[0]))),0,W),y0=clamp(Math.floor(Math.min(...oval.map(p=>p[1]))),0,H),y1=clamp(Math.ceil(chin[1]+fw*.76),0,H);
 const report={version:e.version+'/retouch-v1',status:'unchanged',changedPixels:0,acnePixels:0,wrinklePixels:0,highlightPixels:0,texturePixels:0,addedTexturePixels:0,maxChannelDelta:0,maxHighlightReduction:0,tiles:0,maxTilePixels:0,roiPixels:Math.max(0,x1-x0)*Math.max(0,y1-y0)};
 const label=(x,y)=>e.labels[Math.min(e.maskHeight-1,Math.floor(y*e.maskHeight/H))*e.maskWidth+Math.min(e.maskWidth-1,Math.floor(x*e.maskWidth/W))];
 let out=null;
 for(let ty=y0;ty<y1;ty+=tileSize)for(let tx=x0;tx<x1;tx+=tileSize){
  const endX=Math.min(x1,tx+tileSize),endY=Math.min(y1,ty+tileSize),sx=Math.max(0,tx-halo),sy=Math.max(0,ty-halo),ex=Math.min(W,endX+halo),ey=Math.min(H,endY+halo),w=ex-sx,h=ey-sy,n=w*h;if(!n)continue;
  report.tiles++;report.maxTilePixels=Math.max(report.maxTilePixels,n);
  const scratch=new Float32Array(n),face=new Float32Array(n),features=new Float32Array(n),lum=new Float32Array(n),coverage=new Float32Array(n),redValues=[],brownValues=[];
  const local=points=>points.map(p=>[p[0]-sx,p[1]-sy]);polygon(face,local(oval),w,h);for(const ids of FEATURES)polygon(features,local(ids.map(point)),w,h);
  for(const id of [98,327]){const p=point(id),xx=p[0]-sx,yy=p[1]-sy,rx=Math.max(1.5,fw*.02),ry=Math.max(1.5,fw*.014);for(let y=clamp(Math.floor(yy-ry),0,h);y<Math.min(h,yy+ry+1);y++)for(let x=clamp(Math.floor(xx-rx),0,w);x<Math.min(w,xx+rx+1);x++)if(((x+.5-xx)/rx)**2+((y+.5-yy)/ry)**2<=1)features[y*w+x]=1}
  const featureGuard=mean(features,w,h,guardR,scratch),edge=mean(face,w,h,edgeR,scratch);
  let support=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,gx=x+sx,gy=y+sy,k=(gy*W+gx)*4,c=label(gx,gy);lum[i]=Y(pixels[k],pixels[k+1],pixels[k+2]);
   if((c!==2&&c!==3)||pixels[k+3]!==255||features[i]||featureGuard[i]>.0001)continue;
   const neck=gy>chin[1]+fw*.03&&gy<chin[1]+fw*.74&&Math.abs(gx-cx)<fw*.40;
   const a=face[i]?smooth(.68,.98,edge[i]):neck?.9*(1-smooth(chin[1]+fw*.55,chin[1]+fw*.74,gy)):0;
   if(a>0){coverage[i]=a;support++;if(a>.5&&lum[i]>35&&lum[i]<230){redValues.push(pixels[k]-pixels[k+1]);brownValues.push(pixels[k]-pixels[k+2])}}
  }
  if(support<32)continue;
  const redReference=median(redValues),brownReference=median(brownValues),weighted=new Float32Array(n);for(let i=0;i<n;i++)weighted[i]=lum[i]*coverage[i];
  const weight=mean(coverage,w,h,wideR,scratch),localLight=mean(weighted,w,h,wideR,scratch);for(let i=0;i<n;i++)localLight[i]=weight[i]>.04?localLight[i]/weight[i]:lum[i];
  const candidates=new Uint8Array(n),holeSeen=new Uint8Array(n),acne=new Float32Array(n),marks=new Uint8Array(n),seen=new Uint8Array(n),queue=new Int32Array(n),line=new Float32Array(n),lineTargets=[new Float32Array(n),new Float32Array(n),new Float32Array(n)];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x;if(coverage[i]<.2)continue;const k=((y+sy)*W+x+sx)*4,red=pixels[k]-pixels[k+1]-redReference,brown=pixels[k]-pixels[k+2]-brownReference;
   if(red>6&&brown>7)candidates[i]=1;
   let lo=Infinity,hi=-Infinity,bestA=i,bestB=i,alongA=i,alongB=i;
   for(const [dx,dy]of DIRS){const ax=clamp(Math.round(x+dx*ring),0,w-1),ay=clamp(Math.round(y+dy*ring),0,h-1),bx=clamp(Math.round(x-dx*ring),0,w-1),by=clamp(Math.round(y-dy*ring),0,h-1),a=ay*w+ax,b=by*w+bx,pair=(lum[a]+lum[b])/2;if(pair<lo){lo=pair;alongA=a;alongB=b}if(pair>hi){hi=pair;bestA=a;bestB=b}}
   const darkness=localLight[i]-lum[i],anisotropy=hi-lo;
   if(!candidates[i]&&(lum[i]<Math.max(3,localLight[i]*.30)||darkness>10&&lo-lum[i]>6&&anisotropy<8))marks[i]=1;
   if(lum[i]>Math.max(2,localLight[i]*.12)&&hi-lum[i]>2&&anisotropy>2.5&&Math.max(lum[alongA],lum[alongB])<hi-2&&coverage[bestA]>.35&&coverage[bestB]>.35){
    line[i]=smooth(2.5,6,anisotropy)*smooth(2,5,hi-lum[i]);
    const a=((Math.floor(bestA/w)+sy)*W+bestA%w+sx)*4,b=((Math.floor(bestB/w)+sy)*W+bestB%w+sx)*4;
    for(let c=0;c<3;c++)lineTargets[c][i]=(pixels[a+c]+pixels[b+c])/2;
   }
  }
  // Only compact local red lesions qualify; broad cheek warmth is not acne.
  for(let first=0;first<n;first++)if(candidates[first]&&!seen[first]){
   let head=0,tail=1,minX=first%w,maxX=minX,minY=Math.floor(first/w),maxY=minY;queue[0]=first;seen[first]=1;
   while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const next of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1])if(next>=0&&candidates[next]&&!seen[next]){seen[next]=1;queue[tail++]=next}}
   if(tail<2||tail>fw*fw*.006||maxX-minX>fw*.10||maxY-minY>fw*.10)continue;
   for(let j=0;j<tail;j++)acne[queue[j]]=1;
   // Fill complete enclosed white-head regions, including a flat centre
   // wider than the local pore radius. Background outside the red lesion
   // touches its bounding box and cannot be mistaken for an enclosed head.
   const lesionArea=tail;
   for(let fy=minY;fy<=maxY;fy++)for(let fx=minX;fx<=maxX;fx++){
    const firstHole=fy*w+fx;if(acne[firstHole]||holeSeen[firstHole]||coverage[firstHole]<.2)continue;
    let hHead=0,hTail=1,touches=false;queue[0]=firstHole;holeSeen[firstHole]=1;
    while(hHead<hTail){const i=queue[hHead++],x=i%w,y=Math.floor(i/w);if(x===minX||x===maxX||y===minY||y===maxY)touches=true;
     for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(xx>=minX&&xx<=maxX&&yy>=minY&&yy<=maxY){const next=yy*w+xx;if(!acne[next]&&!holeSeen[next]&&coverage[next]>=.2){holeSeen[next]=1;queue[hTail++]=next}}}
    if(!touches&&hTail<=Math.max(16,lesionArea*.55))for(let j=0;j<hTail;j++)acne[queue[j]]=1;
   }
  }
  // Preserve flat interiors of round dark identifying marks as well as edges.
  let markHead=0,markTail=0;for(let i=0;i<n;i++)if(marks[i]){queue[markTail++]=i;weighted[i]=Math.min(lum[i]+8,localLight[i]-7)}
  while(markHead<markTail){const i=queue[markHead++],x=i%w,limit=weighted[i];for(const next of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1])if(next>=0&&!marks[next]&&!acne[next]&&coverage[next]>.1&&lum[next]<limit){marks[next]=1;weighted[next]=limit;queue[markTail++]=next}}
  // A tiny dark pore on a crease must not seed protection along the whole
  // crease. Keep compact round marks and deep broad shading, but release thin,
  // moderately dark elongated components to the explicit wrinkle repair.
  seen.fill(0);
  for(let first=0;first<n;first++)if(marks[first]&&!seen[first]){
   let head=0,tail=1,minX=first%w,maxX=minX,minY=Math.floor(first/w),maxY=minY,darknessSum=0;queue[0]=first;seen[first]=1;
   while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);darknessSum+=localLight[i]-lum[i];for(const next of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1])if(next>=0&&marks[next]&&!seen[next]){seen[next]=1;queue[tail++]=next}}
   const short=Math.min(maxX-minX+1,maxY-minY+1),long=Math.max(maxX-minX+1,maxY-minY+1);
   if(long>short*3&&short<=Math.max(12,fw*.06)&&darknessSum/tail<35)for(let j=0;j<tail;j++)marks[queue[j]]=0;
  }
  const markGuard=mean(Float32Array.from(marks),w,h,Math.max(1,smallR),scratch),healthy=new Float32Array(n);
  for(let i=0;i<n;i++)healthy[i]=coverage[i]*(1-acne[i])*(marks[i]?0:1)*(1-line[i]);
  const healthyWeight=mean(healthy,w,h,wideR,scratch),healthyRGB=[];
  for(let c=0;c<3;c++){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;weighted[i]=pixels[((y+sy)*W+x+sx)*4+c]*healthy[i]}const channel=mean(weighted,w,h,wideR,scratch);for(let i=0;i<n;i++)channel[i]=healthyWeight[i]>.03?channel[i]/healthyWeight[i]:NaN;healthyRGB.push(channel)}
  const repaired=[new Float32Array(n),new Float32Array(n),new Float32Array(n)],repairLight=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,k=((y+sy)*W+x+sx)*4;const safe=coverage[i]>.01&&markGuard[i]<.0001;
   for(let c=0;c<3;c++){
    let value=pixels[k+c];
    if(safe&&acne[i]&&Number.isFinite(healthyRGB[c][i]))value=healthyRGB[c][i];
    else if(safe&&line[i]>.01)value+=(lineTargets[c][i]-value)*line[i]*.97;
    repaired[c][i]=value;
   }
   repairLight[i]=Y(repaired[0][i],repaired[1][i],repaired[2][i]);
  }
  const textureCoverage=new Float32Array(n);for(let i=0;i<n;i++){textureCoverage[i]=markGuard[i]>.0001?0:coverage[i];weighted[i]=repairLight[i]*textureCoverage[i]}const poreWeight=mean(textureCoverage,w,h,smallR,scratch),poreMean=mean(weighted,w,h,smallR,scratch),fine=new Float32Array(n);
  for(let i=0;i<n;i++){poreMean[i]=poreWeight[i]>.04?poreMean[i]/poreWeight[i]:repairLight[i];fine[i]=repairLight[i]-poreMean[i];weighted[i]=fine[i]*fine[i]*textureCoverage[i]}
  const variance=mean(weighted,w,h,Math.max(4,smallR*4),scratch),varianceWeight=mean(textureCoverage,w,h,Math.max(4,smallR*4),scratch);
  for(let gy=ty;gy<endY;gy++)for(let gx=tx;gx<endX;gx++){
   const i=(gy-sy)*w+gx-sx,k=(gy*W+gx)*4,a=coverage[i];if(a<.01||markGuard[i]>.0001)continue;
   const sourceY=lum[i],rgb=repaired.map(c=>c[i]),L=repairLight[i],sigma=Math.sqrt(Math.max(0,variance[i]/Math.max(.04,varianceWeight[i]))),targetSigma=clamp(localLight[i]*.007,.45,1.05),gain=sigma>targetSigma?clamp(targetSigma/sigma,.08,1):1;
   const added=acne[i]?targetSigma:Math.sqrt(Math.max(0,targetSigma*targetSigma-Math.min(targetSigma,sigma*gain)**2)),detail=acne[i]?-fine[i]+grain(gx,gy)*added:fine[i]*(gain-1)+grain(gx,gy)*added;
   const chroma=Math.max(...rgb)-Math.min(...rgb),excess=L-localLight[i],specular=smooth(6,20,excess)*(1-smooth(45,90,chroma))*smooth(35,75,L);
   const relativeDrop=Math.max(0,excess-4)*.78*specular,rolloff=L>220?(L-220)*.78:0,shineDrop=clamp(Math.max(relativeDrop,rolloff),0,65);
   const targetY=L-shineDrop;let changed=false;
   for(let c=0;c<3;c++){const target=rgb[c]+detail+(targetY-L),next=Math.round(clamp(pixels[k+c]+(target-pixels[k+c])*a,0,255));if(next!==pixels[k+c]){if(!out)out=new Uint8ClampedArray(pixels);out[k+c]=next;changed=true;report.maxChannelDelta=Math.max(report.maxChannelDelta,Math.abs(next-pixels[k+c]))}}
   if(changed){report.changedPixels++;if(acne[i]>.5)report.acnePixels++;if(line[i]>.2&&!acne[i])report.wrinklePixels++;if(shineDrop>.5){report.highlightPixels++;report.maxHighlightReduction=Math.max(report.maxHighlightReduction,sourceY-Y(out[k],out[k+1],out[k+2]))}if(Math.abs(detail)>.15)report.texturePixels++;if(added>.15)report.addedTexturePixels++}
  }
 }
 report.status=out?'applied':'unchanged';return {pixels:out||pixels,changed:Boolean(out),report};
}
