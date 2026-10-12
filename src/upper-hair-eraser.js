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
export function eraseDetachedUpperHair(pixels,w,h,face){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==w*h*4)throw Error('ภาพไม่พร้อมสำหรับเก็บเศษผม');
 const frame=upperFrame(face,w,h),groups=foregroundGroups(pixels,w,h),out=new Uint8ClampedArray(pixels);
 if(!groups.main)return out;
 const contour=mainUpperContour(pixels,w,h,frame,groups),feather=Math.max(4,Math.min(20,frame.eye*.05));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,j=n*4;if(!pixels[j+3]||groups.ids[n]===groups.main)continue;
  const v=frame.localY(x,y);if(v>=frame.upperLimit)continue;
  const edge=contour.edgeAt(contour.column(x,y),true);if(!Number.isFinite(edge))continue;
  const distance=edge-v-1;if(distance<=0)continue;
  const t=Math.min(1,distance/feather);out[j+3]=Math.round(pixels[j+3]*(1-t*t*(3-2*t)));
 }
 return out;
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
