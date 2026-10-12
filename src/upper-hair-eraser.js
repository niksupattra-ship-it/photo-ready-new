import {softHairEraser} from './soft-hair-eraser.js';
// A soft eraser applied to portrait pixels, never a retained layer/clipping mask.
// Detection labels are used only to decide which original hair pixels are safe.
function upperFrame(face,w,h){
 const ids=[33,263,10,127,356];
 if(ids.some(i=>!face?.[i]||![face[i].x,face[i].y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('ไม่พบจุดป้องกันหน้าผากและหู · เก็บภาพเดิมไว้');
 const p=i=>({x:face[i].x*w,y:face[i].y*h}),left=p(33),right=p(263),eye=Math.hypot(right.x-left.x,right.y-left.y);
 if(eye<5)throw Error('ตำแหน่งใบหน้าไม่ชัดพอสำหรับลบขอบผม');
 const cos=(right.x-left.x)/eye,sin=(right.y-left.y)/eye,cx=(left.x+right.x)/2,cy=(left.y+right.y)/2;
 const localX=(x,y)=>(x-cx)*cos+(y-cy)*sin,localY=(x,y)=>-(x-cx)*sin+(y-cy)*cos;
 const upperLimit=Math.min(...[10,127,356].map(i=>{const q=p(i);return localY(q.x,q.y)}))-Math.max(2,eye*.035);
 return {eye,localX,localY,upperLimit};
}

// Foreground connectivity catches tiny floating fragments that a 256px
// semantic model can label as background. These labels never clip the image.
function foregroundGroups(pixels,w,h){
 const ids=new Int32Array(w*h),queue=new Int32Array(w*h);let group=0,main=0,largest=0;
 for(let n=0;n<ids.length;n++){
  if(ids[n]||pixels[n*4+3]<=8)continue;
  group++;let read=0,write=1;queue[0]=n;ids[n]=group;
  while(read<write){
   const at=queue[read++],x=at%w,y=(at-x)/w;
   for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
    const next=yy*w+xx;if(ids[next]||pixels[next*4+3]<=8)continue;
    ids[next]=group;queue[write++]=next;
   }
  }
  if(write>largest){largest=write;main=group}
 }
 return {ids,main};
}

function mainUpperContour(pixels,w,h,frame,groups){
 const corners=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>frame.localX(x,y));
 const origin=Math.floor(Math.min(...corners))-1,count=Math.ceil(Math.max(...corners))-origin+2;
 const top=new Float32Array(count);top.fill(Infinity);
 const column=(x,y)=>Math.floor(frame.localX(x,y)-origin);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(groups.main&&groups.ids[y*w+x]===groups.main)top[column(x,y)]=Math.min(top[column(x,y)],frame.localY(x,y));
 const edgeAt=(i,allowGap=false)=>{
  if(Number.isFinite(top[i])||!allowGap)return top[i];
  // Extend only across a short gap next to the crown, never to the lower sides.
  for(let d=1;d<=Math.max(2,Math.ceil(frame.eye*.15));d++){
   const edges=[top[i-d],top[i+d]].filter(Number.isFinite);if(edges.length)return Math.min(...edges);
  }
  return Infinity;
 };
 return {top,column,edgeAt};
}

// Clean detached fragments in a fitted PNG too, before it defines the crown
// contour. Connected strands, its shape, all RGB and lower hair stay intact.
export function eraseDetachedUpperHair(pixels,w,h,face,{softEdges=false}={}){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==w*h*4)throw Error('ภาพไม่พร้อมสำหรับเก็บเศษผม');
 const frame=upperFrame(face,w,h),groups=foregroundGroups(pixels,w,h),out=new Uint8ClampedArray(pixels),strength=softEdges?new Float32Array(w*h):null,limit=softEdges?new Float32Array(w*h):null;
 if(!groups.main)return out;
 const contour=mainUpperContour(pixels,w,h,frame,groups),feather=Math.max(4,Math.min(20,frame.eye*.05));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,j=n*4;if((!softEdges&&!pixels[j+3])||groups.ids[n]===groups.main)continue;
  const v=frame.localY(x,y);if(v>=frame.upperLimit)continue;
  const edge=contour.edgeAt(contour.column(x,y),true);if(!Number.isFinite(edge))continue;
  const distance=edge-v-1;if(distance<=0)continue;
  const t=Math.min(1,distance/feather);if(strength){strength[n]=t*t*(3-2*t);limit[n]=1}else out[j+3]=Math.round(pixels[j+3]*(1-t*t*(3-2*t)));
 }
 return strength?softHairEraser(pixels,w,h,strength,Math.max(1.25,Math.min(5,frame.eye*.018)),limit):out;
}

export function eraseUpperHairExcess(portrait,overlay,w,h,face,labels){
 const validPixels=p=>(p instanceof Uint8Array||p instanceof Uint8ClampedArray)&&p.length===w*h*4;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!validPixels(portrait)||!validPixels(overlay))throw Error('ภาพไม่พร้อมสำหรับลบขอบผม');
 const frame=upperFrame(face,w,h),{eye,localX,localY,upperLimit}=frame;
 const {data,width:mw,height:mh}=labels||{};
 if(!(data instanceof Uint8Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||data.length!==mw*mh)throw Error('ตรวจพื้นที่ผมและผิวไม่สำเร็จ · เก็บภาพเดิมไว้');
 // Even a mistaken hair label cannot authorize erasure at/below the forehead
 // or either upper ear attachment. This boundary follows the head's rotation.
 // Expand protected detection labels by two model pixels, before any erasure.
 // This is a classification guard, not an image mask applied to the portrait.
 const protectedLabels=new Uint8Array(data.length);
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
  const category=data[y*mw+x];if(category!==2&&category!==3&&category!==4)continue;
  for(let yy=Math.max(0,y-2);yy<=Math.min(mh-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(mw-1,x+2);xx++)protectedLabels[yy*mw+xx]=1;
 }
 // Find only the upper contour of the new hair, in face-aligned columns.
 // Columns with no hair stay untouched; there is no side/bottom clipping.
 const originalGroups=foregroundGroups(portrait,w,h),overlayGroups=foregroundGroups(overlay,w,h);
 if(!overlayGroups.main)throw Error('ไม่พบขอบบนของทรงผม · เก็บภาพเดิมไว้');
 const {top,column,edgeAt}=mainUpperContour(overlay,w,h,frame,overlayGroups),originalTop=new Float32Array(top.length);originalTop.fill(Infinity);
 const detached=n=>originalGroups.main&&originalGroups.ids[n]!==originalGroups.main;
 const labelAt=(x,y)=>Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4,i=column(x,y),v=localY(x,y);
  if(portrait[j+3]>8&&v<upperLimit){
   const label=labelAt(x,y);
   if((data[label]===1||(data[label]===0&&detached(y*w+x)))&&!protectedLabels[label])originalTop[i]=Math.min(originalTop[i],v);
  }
 }
 const out=new Uint8ClampedArray(portrait),margin=Math.max(1,eye*.008),feather=Math.max(4,Math.min(20,eye*.05));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!portrait[j+3])continue;
  const v=localY(x,y);if(v>=upperLimit)continue;
  const label=labelAt(x,y);
  const floating=detached(y*w+x);
  if(protectedLabels[label]||(data[label]!==1&&!(data[label]===0&&floating)))continue;
  const i=column(x,y),edge=edgeAt(i,floating);if(!Number.isFinite(edge))continue;
  // Extra erasure under the fitted crown is safe only where opaque new hair
  // actually covers it. A transparent PNG opening must never reveal a hole.
  if(v>=edge-margin&&overlay[j+3]<240)continue;
  // Extend into the covered upper edge by exactly 40% of this column's
  // measured excess height. Skin/ear guards and the upper-only limit still win.
  const excess=Number.isFinite(originalTop[i])?Math.max(0,edge-originalTop[i]):0;
  const distance=edge+excess*.4-v-margin;if(distance<=0)continue;
  const t=Math.min(1,distance/feather),strength=t*t*(3-2*t);
  // The soft eraser changes only eligible original-hair alpha. All RGB,
  // protected skin/ears and every pixel beneath the upper boundary stay exact.
  out[j+3]=Math.round(portrait[j+3]*(1-strength));
 }
 return out;
}

// Exterior cleanup follows the complete final hair/head silhouette, including
// both sides. Detection and anatomical guards guide a direct pixel eraser;
// no clipping or retained layer mask is produced.
export function eraseHeadExteriorExcess(portrait,overlay,w,h,face,labels,{softEdges=false,interior=null}={}){
 const valid=p=>(p instanceof Uint8Array||p instanceof Uint8ClampedArray)&&p.length===w*h*4;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!valid(portrait)||!valid(overlay))throw Error('ภาพไม่พร้อมสำหรับเก็บขอบศีรษะ');
 if(interior&&(!(interior instanceof Uint8Array)||interior.length!==w*h))throw Error('กรอบด้านในทรงผมไม่ตรงกับภาพ');
 const frame=upperFrame(face,w,h),{eye,localX,localY}=frame;
 if([152,234,454].some(i=>!face?.[i]||![face[i].x,face[i].y].every(Number.isFinite)))throw Error('ไม่พบกรอบใบหน้าเพื่อป้องกันผิวและหู');
 const {data,width:mw,height:mh}=labels||{};
 if(!(data instanceof Uint8Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||data.length!==mw*mh)throw Error('ตรวจพื้นที่ผมและผิวไม่สำเร็จ · เก็บภาพเดิมไว้');
 const p=i=>({x:localX(face[i].x*w,face[i].y*h),y:localY(face[i].x*w,face[i].y*h)});
 const forehead=p(10),chin=p(152),cheeks=[p(234),p(454)],ears=[p(127),p(356)],center=(cheeks[0].x+cheeks[1].x)/2;
 const half=Math.abs(cheeks[1].x-cheeks[0].x)/2;
 if(half<eye*.5||chin.y<=forehead.y)throw Error('กรอบใบหน้าไม่ชัดพอสำหรับเก็บขอบ');
 const ovalIds=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 const oval=ovalIds.every(i=>face[i]&&[face[i].x,face[i].y].every(Number.isFinite))?ovalIds.map(p):null;
 const insideFace=(u,v)=>{
  // Ear landmarks mark upper attachments, so explicitly protect the visible
  // ear below and slightly outside each attachment, even if it is mislabeled.
  for(const ear of ears)if(((u-ear.x)/(eye*.17))**2+((v-ear.y-eye*.35)/(eye*.55))**2<=1)return true;
  if(v<forehead.y-eye*.04||v>chin.y+eye*.04||Math.abs(u-center)>half+eye*.06)return false;
  if(!oval)return ((u-center)/(half+eye*.04))**2+((v-(forehead.y+chin.y)/2)/((chin.y-forehead.y)/2+eye*.04))**2<=1;
  let inside=false;
  for(let i=0,j=oval.length-1;i<oval.length;j=i++){
   const a=oval[i],b=oval[j];if((a.y>v)!==(b.y>v)&&u<(b.x-a.x)*(v-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
 };
 const protectedLabels=new Uint8Array(data.length);
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
  if(![2,3,4].includes(data[y*mw+x]))continue;
  for(let yy=Math.max(0,y-2);yy<=Math.min(mh-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(mw-1,x+2);xx++)protectedLabels[yy*mw+xx]=1;
 }
 const labelAt=(x,y)=>Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w));
 const feather=Math.max(4,Math.min(20,eye*.045)),distance=new Float32Array(w*h),out=new Uint8ClampedArray(portrait),strength=softEdges?new Float32Array(w*h):null;
 let foundHair=false;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,label=labelAt(x,y),u=localX(x,y),v=localY(x,y),hair=overlay[n*4+3]>8;
  if(hair)foundHair=true;
  distance[n]=hair||interior?.[n]||protectedLabels[label]||insideFace(u,v)?0:feather;
 }
 if(!foundHair)throw Error('ไม่พบทรงผมหลักสำหรับเก็บขอบ · เก็บภาพเดิมไว้');
 const diagonal=Math.SQRT2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;let d=distance[i];
  if(x)d=Math.min(d,distance[i-1]+1);
  if(y){d=Math.min(d,distance[i-w]+1);if(x)d=Math.min(d,distance[i-w-1]+diagonal);if(x+1<w)d=Math.min(d,distance[i-w+1]+diagonal)}
  distance[i]=d;
 }
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
  const i=y*w+x;let d=distance[i];
  if(x+1<w)d=Math.min(d,distance[i+1]+1);
  if(y+1<h){d=Math.min(d,distance[i+w]+1);if(x)d=Math.min(d,distance[i+w-1]+diagonal);if(x+1<w)d=Math.min(d,distance[i+w+1]+diagonal)}
  distance[i]=d;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,j=n*4;if((!softEdges&&!portrait[j+3])||!distance[n])continue;
  const category=data[labelAt(x,y)];
  // Background-labeled remnants near the head can still be connected by
  // a thin strand. Erase them outside the protected silhouette as well.
  // Clothing and other objects never become eraser targets.
  const debris=category===0&&Math.abs(localX(x,y)-center)<half+eye*.9&&localY(x,y)<chin.y+eye*.25;
  if(category!==1&&!debris)continue;
  const t=Math.min(1,distance[n]/feather),erase=t*t*(3-2*t);
  if(strength)strength[n]=erase;else out[j+3]=Math.round(portrait[j+3]*(1-erase));
 }
 return strength?softHairEraser(portrait,w,h,strength,Math.max(1.25,Math.min(6,eye*.018)),strength):out;
}
