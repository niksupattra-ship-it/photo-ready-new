// A soft eraser applied to portrait pixels, never a retained layer/clipping mask.
// Detection labels are used only to decide which original hair pixels are safe.
export function eraseUpperHairExcess(portrait,overlay,w,h,face,labels){
 const validPixels=p=>(p instanceof Uint8Array||p instanceof Uint8ClampedArray)&&p.length===w*h*4;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!validPixels(portrait)||!validPixels(overlay))throw Error('ภาพไม่พร้อมสำหรับลบขอบผม');
 const ids=[33,263,10,127,356];
 if(ids.some(i=>!face?.[i]||![face[i].x,face[i].y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('ไม่พบจุดป้องกันหน้าผากและหู · เก็บภาพเดิมไว้');
 const {data,width:mw,height:mh}=labels||{};
 if(!(data instanceof Uint8Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||data.length!==mw*mh)throw Error('ตรวจพื้นที่ผมและผิวไม่สำเร็จ · เก็บภาพเดิมไว้');
 const p=i=>({x:face[i].x*w,y:face[i].y*h}),left=p(33),right=p(263);
 const eye=Math.hypot(right.x-left.x,right.y-left.y);
 if(eye<5)throw Error('ตำแหน่งใบหน้าไม่ชัดพอสำหรับลบขอบผม');
 const cos=(right.x-left.x)/eye,sin=(right.y-left.y)/eye,cx=(left.x+right.x)/2,cy=(left.y+right.y)/2;
 const localX=(x,y)=>(x-cx)*cos+(y-cy)*sin;
 const localY=(x,y)=>-(x-cx)*sin+(y-cy)*cos;
 // Even a mistaken hair label cannot authorize erasure at/below the forehead
 // or either upper ear attachment. This boundary follows the head's rotation.
 const safety=Math.max(2,eye*.035);
 const upperLimit=Math.min(...[10,127,356].map(i=>{const q=p(i);return localY(q.x,q.y)}))-safety;
 // Expand protected detection labels by two model pixels, before any erasure.
 // This is a classification guard, not an image mask applied to the portrait.
 const protectedLabels=new Uint8Array(data.length);
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
  const category=data[y*mw+x];if(category!==2&&category!==3&&category!==4)continue;
  for(let yy=Math.max(0,y-2);yy<=Math.min(mh-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(mw-1,x+2);xx++)protectedLabels[yy*mw+xx]=1;
 }
 // Find only the upper contour of the new hair, in face-aligned columns.
 // Columns with no hair stay untouched; there is no side/bottom clipping.
 const corners=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>localX(x,y));
 const origin=Math.floor(Math.min(...corners))-1,count=Math.ceil(Math.max(...corners))-origin+2;
 const top=new Float32Array(count),originalTop=new Float32Array(count);top.fill(Infinity);originalTop.fill(Infinity);
 const column=(x,y)=>Math.floor(localX(x,y)-origin);
 const labelAt=(x,y)=>Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w));
 let covered=false;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4,i=column(x,y),v=localY(x,y);
  if(overlay[j+3]>8){top[i]=Math.min(top[i],v);covered=true}
  if(portrait[j+3]>8&&v<upperLimit){
   const label=labelAt(x,y);
   if(data[label]===1&&!protectedLabels[label])originalTop[i]=Math.min(originalTop[i],v);
  }
 }
 if(!covered)throw Error('ไม่พบขอบบนของทรงผม · เก็บภาพเดิมไว้');
 const out=new Uint8ClampedArray(portrait),margin=Math.max(1,eye*.008),feather=Math.max(4,Math.min(20,eye*.05));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!portrait[j+3])continue;
  const v=localY(x,y);if(v>=upperLimit)continue;
  const label=labelAt(x,y);
  if(data[label]!==1||protectedLabels[label])continue;
  const i=column(x,y),edge=top[i];if(!Number.isFinite(edge))continue;
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
