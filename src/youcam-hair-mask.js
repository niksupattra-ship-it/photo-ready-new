// Native-grid hair pixels and their editable opacity are deliberately separate.
// Neither an erased mask nor its restore brush can reveal a generated face.
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const BROWS=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const failure=message=>Error(message+' · เก็บภาพเดิมไว้');

function confidence(input,n,name){
 if(!input||input.length!==n)throw failure('ข้อมูล'+name+'ไม่ครบ');
 for(let i=0;i<n;i++)if(!Number.isFinite(input[i])||input[i]<0||input[i]>1)throw failure('ค่าความมั่นใจ'+name+'ไม่ถูกต้อง');
 return input;
}
function frame(face,w,h){
 const required=[...OVAL,33,263,70,105,107,336,334,300,1,4,98,327,...EYES.flat(),...LIPS,...BROWS.flat()];
 if(required.some(i=>!Number.isFinite(face?.[i]?.x)||!Number.isFinite(face?.[i]?.y)))throw failure('ตรวจโครงหน้าสำหรับแยกผมไม่ครบ');
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),left=point(33),right=point(263),d=Math.hypot(right.x-left.x,right.y-left.y);
 if(d<20)throw failure('ใบหน้าเล็กเกินไปสำหรับแยกไรผม');
 const ux=(right.x-left.x)/d,uy=(right.y-left.y)/d,cx=(left.x+right.x)/2,cy=(left.y+right.y)/2;
 let vx=-uy,vy=ux;const chin=point(152);if((chin.x-cx)*vx+(chin.y-cy)*vy<0){vx=-vx;vy=-vy}
 const local=p=>({u:(p.x-cx)*ux+(p.y-cy)*uy,v:(p.x-cx)*vx+(p.y-cy)*vy});
 const brow=[70,105,107,336,334,300].reduce((s,id)=>s+local(point(id)).v,0)/6;
 return {point,d,ux,uy,vx,vy,cx,cy,local,brow,chin:local(chin).v};
}
function fillPolygon(mask,points,w,h){
 const top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))),bottom=Math.min(h-1,Math.ceil(Math.max(...points.map(p=>p.y))));
 for(let y=top;y<=bottom;y++){
  const line=y+.5,xs=[];
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];if((a.y>line)!==(b.y>line))xs.push(a.x+(line-a.y)*(b.x-a.x)/(b.y-a.y));
  }
  xs.sort((a,b)=>a-b);
  for(let i=0;i+1<xs.length;i+=2){const left=Math.max(0,Math.ceil(xs[i]-.5)),right=Math.min(w-1,Math.floor(xs[i+1]-.5));if(right>=left)mask.fill(1,y*w+left,y*w+right+1)}
 }
}
function faceMasks(f,w,h){
 const oval=new Uint8Array(w*h),features=new Uint8Array(w*h),brows=new Uint8Array(w*h);
 fillPolygon(oval,OVAL.map(f.point),w,h);
 for(const ids of [...EYES,LIPS])fillPolygon(features,ids.map(f.point),w,h);
 for(const ids of BROWS)fillPolygon(brows,ids.map(f.point),w,h);
 // A bounded central oval protects the nose without pretending to recover skin.
 const tip=f.point(1),rx=f.d*.12,ry=f.d*.11;
 for(let y=Math.max(0,Math.floor(tip.y-ry-rx));y<Math.min(h,Math.ceil(tip.y+ry+rx));y++)for(let x=Math.max(0,Math.floor(tip.x-rx-ry));x<Math.min(w,Math.ceil(tip.x+rx+ry));x++){
  const dx=x+.5-tip.x,dy=y+.5-tip.y,u=(dx*f.ux+dy*f.uy)/rx,v=(dx*f.vx+dy*f.vy)/ry;if(u*u+v*v<1)features[y*w+x]=1;
 }
 return {oval,features,brows};
}

function boxMean(input,w,h,r){
 const tmp=new Float32Array(input.length),out=new Float32Array(input.length),span=2*r+1;
 for(let y=0;y<h;y++){
  const row=y*w;let sum=0;for(let x=-r;x<=r;x++)sum+=input[row+clamp(x,0,w-1)];
  for(let x=0;x<w;x++){tmp[row+x]=sum/span;sum+=input[row+Math.min(w-1,x+r+1)]-input[row+Math.max(0,x-r)]}
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let y=-r;y<=r;y++)sum+=tmp[clamp(y,0,h-1)*w+x];
  for(let y=0;y<h;y++){out[y*w+x]=sum/span;sum+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]}
 }
 return out;
}

// Small native-guided refinement removes the resampled semantic stair steps.
// Its result is subsequently intersected with the original confidence support.
export function refineYoucamHairConfidence(rgba,hair,w,h,radius=2){
 const n=w*h;if(rgba?.length!==n*4||hair?.length!==n)throw failure('ขนาดข้อมูลไรผมไม่ตรงกัน');
 const r=clamp(Math.round(radius),1,5),I=new Float32Array(n),II=new Float32Array(n),IP=new Float32Array(n);
 for(let i=0;i<n;i++){const j=i*4,v=(rgba[j]*.2126+rgba[j+1]*.7152+rgba[j+2]*.0722)/255;I[i]=v;II[i]=v*v;IP[i]=v*hair[i]}
 const meanI=boxMean(I,w,h,r),meanP=boxMean(hair,w,h,r),meanII=boxMean(II,w,h,r),meanIP=boxMean(IP,w,h,r),a=new Float32Array(n),b=new Float32Array(n);
 for(let i=0;i<n;i++){a[i]=(meanIP[i]-meanI[i]*meanP[i])/(Math.max(0,meanII[i]-meanI[i]*meanI[i])+.001);b[i]=meanP[i]-a[i]*meanI[i]}
 const meanA=boxMean(a,w,h,r),meanB=boxMean(b,w,h,r),out=new Float32Array(n);
 for(let i=0;i<n;i++)out[i]=clamp(meanA[i]*I[i]+meanB[i]);
 return out;
}

function connectedHair(rgba,hair,skin,f,masks,w,h){
 const n=w*h,candidate=new Uint8Array(n),labels=new Int32Array(n),queue=new Int32Array(n),components=[];
 for(let i=0;i<n;i++){
  const translucent=rgba[i*4+3]<192;
  candidate[i]=rgba[i*4+3]>0&&hair[i]>(translucent?.075:.45)&&(hair[i]>.94||hair[i]>skin[i]*1.6+.025)&&(translucent||hair[i]>=1-hair[i]-skin[i])?1:0;
 }
 // A tiny crown seed must never turn a connected field of weak background or
 // skin probabilities into a fully restorable source. Keep uncertain edges
 // within a small native-pixel band of genuinely confident hair.
 const reach=clamp(Math.round(f.d*.035),2,12),coreDistance=new Uint16Array(n);coreDistance.fill(65535);
 let coreRead=0,coreCount=0;
 for(let i=0;i<n;i++)if(candidate[i]&&hair[i]>.72){coreDistance[i]=0;queue[coreCount++]=i}
 while(coreRead<coreCount){
  const i=queue[coreRead++],distance=coreDistance[i]+1;if(distance>reach)continue;
  const x=i%w,y=Math.floor(i/w);
  for(const next of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(next>=0&&candidate[next]&&coreDistance[next]===65535){coreDistance[next]=distance;queue[coreCount++]=next}
 }
 for(let i=0;i<n;i++)if(coreDistance[i]===65535)candidate[i]=0;
 let label=0;
 for(let seed=0;seed<n;seed++){
  if(!candidate[seed]||labels[seed])continue;
  label++;let read=0,count=1,high=0,crown=0,feature=0,minX=w,minY=h,maxX=-1,maxY=-1;queue[0]=seed;labels[seed]=label;
  while(read<count){
   const i=queue[read++],x=i%w,y=Math.floor(i/w),q=f.local({x:x+.5,y:y+.5});
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   if(hair[i]>.72){high++;if(q.v<f.brow-f.d*.075&&Math.abs(q.u)<f.d*1.65)crown++}
   if(masks.features[i]||masks.brows[i])feature++;
   for(const next of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(next>=0&&candidate[next]&&!labels[next]){labels[next]=label;queue[count++]=next}
  }
  components.push({label,count,high,crown,feature,minX,minY,maxX,maxY});
 }
 const main=components.filter(c=>c.crown>=Math.max(2,f.d*f.d*.0003)&&c.high>=Math.max(4,c.count*.20)).sort((a,b)=>b.count-a.count)[0];
 if(!main)return {support:new Uint8Array(n),count:0};
 const accepted=new Set([main.label]),componentReach=f.d*.12;
 for(const c of components){
  if(c===main)continue;
  const dx=Math.max(0,main.minX-c.maxX,c.minX-main.maxX),dy=Math.max(0,main.minY-c.maxY,c.minY-main.maxY);
  // Do not turn detached eyebrow/face pixels into restorable hair source.
  if(c.high>=Math.max(3,c.count*.50)&&c.feature<c.count*.08&&Math.hypot(dx,dy)<=componentReach&&(c.crown>0||c.count>=Math.max(8,f.d*f.d*.0005)))accepted.add(c.label);
 }
 const support=new Uint8Array(n);let count=0;
 for(let i=0;i<n;i++)if(accepted.has(labels[i])){support[i]=1;count++}
 return {support,count};
}

function innerDistance(support,oldSkin,newSkin,face,w,h,limit){
 const n=w*h,out=new Float32Array(n),far=limit+3;out.fill(far);
 for(let i=0;i<n;i++)if(!support[i]&&(newSkin[i]>.24||oldSkin[i]>.42||(face[i]&&newSkin[i]>.08)))out[i]=0;
 const diag=Math.SQRT2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;let v=out[i];if(x)v=Math.min(v,out[i-1]+1);if(y){v=Math.min(v,out[i-w]+1);if(x)v=Math.min(v,out[i-w-1]+diag);if(x+1<w)v=Math.min(v,out[i-w+1]+diag)}out[i]=v;
 }
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
  const i=y*w+x;let v=out[i];if(x+1<w)v=Math.min(v,out[i+1]+1);if(y+1<h){v=Math.min(v,out[i+w]+1);if(x)v=Math.min(v,out[i+w-1]+diag);if(x+1<w)v=Math.min(v,out[i+w+1]+diag)}out[i]=v;
 }
 return out;
}

export function partitionYoucamHairAlpha(alpha,backWeight){
 const a=clamp(alpha),t=clamp(backWeight),front=a*(1-t);
 return {front,back:front>=1?0:clamp(a*t/(1-front))};
}
function rgbaMask(n){return new Uint8ClampedArray(n*4)}
function writeHair(source,mask,support,rgba,index,opacity){
 const alpha=Math.round(clamp(opacity)*255);if(!alpha)return;
 const j=index*4;source[j]=rgba[j];source[j+1]=rgba[j+1];source[j+2]=rgba[j+2];source[j+3]=255;
 mask[j]=mask[j+1]=mask[j+2]=255;mask[j+3]=alpha;
 support[j]=support[j+1]=support[j+2]=support[j+3]=255;
}

export function buildYoucamHairLayers({original,generated,width:w,height:h,originalHair,generatedHair,originalSkin,generatedSkin,originalFace,generatedFace,separateBack=false}){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>33554432)throw failure('ขนาดภาพแยกผมไม่ถูกต้อง');
 const n=w*h;if(original?.length!==n*4||generated?.length!==n*4)throw failure('พิกเซลภาพแยกผมไม่ครบ');
 const oh=confidence(originalHair,n,'ผมต้นฉบับ'),gh=confidence(generatedHair,n,'ผมที่สร้าง'),os=confidence(originalSkin,n,'ผิวต้นฉบับ'),gs=confidence(generatedSkin,n,'ผิวที่สร้าง');
 const f=frame(originalFace,w,h),gf=frame(generatedFace||originalFace,w,h),fm=faceMasks(f,w,h),gm=faceMasks(gf,w,h);
 if(Math.hypot(f.cx-gf.cx,f.cy-gf.cy)>f.d*.06||Math.abs(f.d-gf.d)>f.d*.06||f.ux*gf.ux+f.uy*gf.uy<Math.cos(.05))throw failure('ตำแหน่งใบหน้าจาก YouCam ยังไม่ตรงภาพเดิม');
 const generatedConnected=connectedHair(generated,gh,gs,gf,gm,w,h),nativeSupport=generatedConnected.support;
 if(generatedConnected.count<Math.max(12,f.d*f.d*.002))throw failure('แยกเนื้อผมจาก YouCam ได้ไม่ชัดเจน');
 let featureCount=0,coveredFeatures=0;
 for(let i=0;i<n;i++)if(gm.features[i]){featureCount++;if(nativeSupport[i])coveredFeatures++}
 if(coveredFeatures>Math.max(6,featureCount*.18))throw failure('ผลแยกผมทับรายละเอียดใบหน้ามากเกินไป');
 const refined=refineYoucamHairConfidence(generated,gh,w,h,Math.max(1,Math.min(4,w/256))),feather=clamp(f.d*.015,1.2,5);
 const distance=innerDistance(nativeSupport,os,gs,gm.oval,w,h,feather),alpha=new Float32Array(n);
 let totalAlpha=0,lowerAlpha=0;
 for(let i=0;i<n;i++)if(nativeSupport[i]){
  // Strong hair keeps native alpha; uncertain semantic edges use a native-guided
  // matte, always restricted to supported hair rather than generated skin.
  const matte=gh[i]>=.88?1:smooth(.035,.82,refined[i]);
  // There is no skin hidden beneath photographed old hair. Do not add a
  // translucent cut there: opaque selected hair covers its old colour, while
  // only transitions over genuinely available original skin feather inward.
  const oldHairUnderlay=oh[i]>.9&&os[i]<.025;
  const innerFeather=oldHairUnderlay?1:smooth(0,feather,distance[i]+.25);
  alpha[i]=generated[i*4+3]/255*matte*innerFeather;
  totalAlpha+=alpha[i];const q=f.local({x:i%w+.5,y:Math.floor(i/w)+.5});if(q.v>f.chin+f.d*.2)lowerAlpha+=alpha[i];
 }
 if(totalAlpha<Math.max(8,f.d*f.d*.0015))throw failure('เนื้อผมหลังเกลี่ยขอบไม่เพียงพอ');
 const hasBack=Boolean(separateBack&&lowerAlpha>Math.max(16,f.d*f.d*.025));
 const front=rgbaMask(n),frontMask=rgbaMask(n),frontSupport=rgbaMask(n),back=hasBack?rgbaMask(n):null,backMask=hasBack?rgbaMask(n):null,backSupport=hasBack?rgbaMask(n):null;
 // Hair actually crossing the original face is foreground evidence. Preserve
 // its projected strand corridor rather than cutting every lower lock at chin.
 const corridorSize=Math.ceil(f.d*4)+3,corridors=new Uint8Array(corridorSize),center=Math.floor(corridorSize/2);
 if(hasBack)for(let i=0;i<n;i++)if(alpha[i]>.7&&os[i]>.55&&fm.oval[i]){
  const q=f.local({x:i%w+.5,y:Math.floor(i/w)+.5});if(q.v>f.brow&&q.v<f.chin-f.d*.05){const u=Math.round(q.u)+center;for(let k=Math.max(0,u-Math.ceil(f.d*.035));k<=Math.min(corridorSize-1,u+Math.ceil(f.d*.035));k++)corridors[k]=1}
 }
 for(let i=0;i<n;i++)if(alpha[i]>0){
  const q=f.local({x:i%w+.5,y:Math.floor(i/w)+.5}),u=Math.round(q.u)+center;
  const protectedLock=u>=0&&u<corridorSize&&corridors[u];
  const rear=hasBack&&!protectedLock?smooth(f.chin+f.d*.08,f.chin+f.d*.62,q.v):0;
  const partition=partitionYoucamHairAlpha(alpha[i],rear);
  writeHair(front,frontMask,frontSupport,generated,i,partition.front);
  if(hasBack)writeHair(back,backMask,backSupport,generated,i,partition.back);
 }
 const cleanedHead=new Uint8ClampedArray(original),oldConnected=connectedHair(original,oh,os,f,fm,w,h).support;
 let erased=0,retainedInteriorHair=0,retainedOccludedSkin=0;
 // Generated skin where the original contains hair is missing source data,
 // not exterior excess. Preserve a small existing temple/hairline strip; a
 // larger newly exposed forehead/ear/neck cannot be reconstructed honestly.
 const occludedSkin=new Uint8Array(n);
 for(let i=0;i<n;i++)if(oldConnected[i]&&oh[i]>.6&&os[i]<.12&&gs[i]>.55&&alpha[i]<.985&&original[i*4+3]>192){occludedSkin[i]=1;retainedOccludedSkin++}
 if(retainedOccludedSkin>Math.max(64,f.d*f.d*.025))throw failure('ทรงนี้เปิดผิวที่ถูกผมเดิมบังมากเกินไป จึงยังประกอบโดยรักษาผิวเดิมไม่ได้');
 for(let i=0;i<n;i++){
  const j=i*4;if(!original[j+3]||!oldConnected[i]||os[i]>.12)continue;
  if(occludedSkin[i])continue;
  // Do not punch a hole into an occluded forehead: that skin does not exist.
  // Interior old hair is only hidden when the selected new hair is opaque.
  if(fm.oval[i]&&alpha[i]<.985){if(oh[i]>.7)retainedInteriorHair++;continue}
  if(fm.features[i]||fm.brows[i])continue;
  const remove=smooth(.10,.58,oh[i])*(1-smooth(.025,.12,os[i]));
  const next=Math.round(original[j+3]*(1-remove));if(next!==cleanedHead[j+3]){cleanedHead[j+3]=next;erased++}
 }
 return {width:w,height:h,front,frontMask,frontSupport,back,backMask,backSupport,cleanedHead,report:{hairPixels:generatedConnected.count,erasedOriginalHairPixels:erased,retainedInteriorHair,retainedOccludedSkin,hasBack,featherPixels:feather}};
}
