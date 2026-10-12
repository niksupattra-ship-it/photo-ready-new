const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};
const ovalIds=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
function frame(face,w,h){
 const valid=id=>face?.[id]&&[face[id].x,face[id].y].every(v=>Number.isFinite(v)&&v>=0&&v<=1);
 if([33,263,10,152,234,454,127,356].some(id=>!valid(id)))throw Error('ไม่พบจุดป้องกันใบหน้าสำหรับเก็บขอบผมสั้น');
 const l=face[33],r=face[263],dx=(r.x-l.x)*w,dy=(r.y-l.y)*h,eye=Math.hypot(dx,dy);
 if(eye<5)throw Error('ใบหน้าไม่ชัดพอสำหรับเกลี่ยผิวใต้ขอบผม');
 const c=dx/eye,s=dy/eye,cx=(l.x+r.x)*w/2,cy=(l.y+r.y)*h/2;
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c});
 const p=id=>local(face[id].x*w,face[id].y*h),forehead=p(10),chin=p(152),cheeks=[p(234),p(454)],ears=[p(127),p(356)];
 const center=(cheeks[0].u+cheeks[1].u)/2,half=Math.abs(cheeks[1].u-cheeks[0].u)/2;
 if(half<eye*.5||chin.v<=forehead.v)throw Error('กรอบใบหน้าไม่ชัดพอสำหรับเก็บขอบผมสั้น');
 const oval=ovalIds.every(valid)?ovalIds.map(p):null;
 const inside=(u,v)=>{
  for(const ear of ears)if(((u-ear.u)/(eye*.17))**2+((v-ear.v-eye*.35)/(eye*.55))**2<=1)return true;
  if(!oval)return ((u-center)/(half+eye*.04))**2+((v-(forehead.v+chin.v)/2)/((chin.v-forehead.v)/2+eye*.04))**2<=1;
  let yes=false;for(let i=0,j=oval.length-1;i<oval.length;j=i++){
   const a=oval[i],b=oval[j];if((a.v>v)!==(b.v>v)&&u<(b.u-a.u)*(v-a.v)/(b.v-a.v)+a.u)yes=!yes;
  }return yes;
 };
 // Explicit landmark bounds protect both eyes AND brows even when semantic
 // detection calls them hair/skin. Sparse landmarks use wider eye-axis guards.
 const features=[
  [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
  [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466],
  [70,63,105,66,107,55,65,52,53,46],[300,293,334,296,336,285,295,282,283,276]
 ].map(ids=>ids.every(valid)?ids.map(p):null);
 const bounds=features.filter(Boolean).map(points=>({l:Math.min(...points.map(q=>q.u))-eye*.055,r:Math.max(...points.map(q=>q.u))+eye*.055,t:Math.min(...points.map(q=>q.v))-eye*.055,b:Math.max(...points.map(q=>q.v))+eye*.055}));
 const featureAt=(u,v)=>{
  if(bounds.some(q=>u>=q.l&&u<=q.r&&v>=q.t&&v<=q.b))return true;
  for(const id of [33,263]){const q=p(id);if(Math.abs(u-q.u)<=eye*.30&&v>=q.v-eye*.36&&v<=q.v+eye*.20)return true}
  return false;
 };
 const protectedAt=(u,v)=>{
  if(featureAt(u,v))return true;
  // The bridge of the nose, lower face, visible ears and neck are immutable.
  if(Math.abs(u-center)<eye*.22&&v>-eye*.28)return true;
  for(const ear of ears)if(Math.abs(u-ear.u)<eye*.24&&v>ear.v-eye*.035)return true;
  return v>Math.max(...ears.map(q=>q.v))+eye*.08;
 };
 return {eye,c,s,local,forehead,ears,center,half,inside,featureAt,protectedAt};
}

// Temporary geometry guide only, never stored as an image/layer mask. Fill
// each eye-axis scanline between the actual hair/face outer contours. Holes
// and narrow open joins inside that outline cannot authorize alpha erasure.
export function shortHairInterior(overlay,w,h,face){
 if(overlay.length!==w*h*4)throw Error('ภาพผมสั้นไม่พร้อมสำหรับเก็บขอบ');
 const f=frame(face,w,h),corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]].map(([x,y])=>f.local(x,y).v),origin=Math.floor(Math.min(...corners))-1,count=Math.ceil(Math.max(...corners))-origin+2;
 const left=new Float32Array(count),right=new Float32Array(count);left.fill(Infinity);right.fill(-Infinity);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=f.local(x,y);if(overlay[(y*w+x)*4+3]<=8&&!f.inside(q.u,q.v)&&!f.featureAt(q.u,q.v))continue;
  const row=Math.floor(q.v-origin);left[row]=Math.min(left[row],q.u);right[row]=Math.max(right[row],q.u);
 }
 const interior=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=f.local(x,y),row=Math.floor(q.v-origin);if(q.u>=left[row]&&q.u<=right[row])interior[y*w+x]=1;
 }
 return interior;
}
