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

// Chamfer distance from a seed set; used for local hair proximity and safe
// skin depth. No RGB is blurred and no face coordinates are changed.
function distanceFrom(seed,w,h){
 const d=new Float32Array(w*h);for(let n=0;n<d.length;n++)d[n]=seed[n]?0:Math.hypot(w,h);
 const root=Math.SQRT2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x;if(x)d[n]=Math.min(d[n],d[n-1]+1);if(y){d[n]=Math.min(d[n],d[n-w]+1);if(x)d[n]=Math.min(d[n],d[n-w-1]+root);if(x+1<w)d[n]=Math.min(d[n],d[n-w+1]+root)}
 }
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
  const n=y*w+x;if(x+1<w)d[n]=Math.min(d[n],d[n+1]+1);if(y+1<h){d[n]=Math.min(d[n],d[n+w]+1);if(x)d[n]=Math.min(d[n],d[n+w-1]+root);if(x+1<w)d[n]=Math.min(d[n],d[n+w+1]+root)}
 }return d;
}

// Cover small ORIGINAL-hair/transparent joins with translated neighbouring
// forehead/temple skin, below the fitted PNG. Donors come from the untouched
// portrait. Brows, eyes and ears cannot be targets or donors; existing opaque
// skin is never a target. Small shared translations preserve skin texture.
export function extendShortHairSkin(portrait,overlay,w,h,face,labels,interior){
 const {data,width:mw,height:mh}=labels||{};
 if(portrait.length!==w*h*4||overlay.length!==w*h*4||interior?.length!==w*h||!(data instanceof Uint8Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||data.length!==mw*mh)throw Error('ตรวจผิวสำหรับเก็บขอบผมสั้นไม่สำเร็จ');
 const f=frame(face,w,h),out=new Uint8ClampedArray(portrait),hair=new Uint8Array(w*h),unsafe=new Uint8Array(w*h),category=new Uint8Array(w*h);
 const top=f.forehead.v-f.eye*.22,bottom=Math.max(...f.ears.map(q=>q.v))+f.eye*.08;
 const within=q=>q.v>=top&&q.v<=bottom&&Math.abs(q.u-f.center)<=f.half+f.eye*.04&&!f.protectedAt(q.u,q.v);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y),cat=data[Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w))];category[n]=cat;
  hair[n]=overlay[n*4+3]>8?1:0;
  unsafe[n]=within(q)&&interior[n]&&(cat===2||cat===3)&&portrait[n*4+3]>=248?0:1;
 }
 const hairDistance=distanceFrom(hair,w,h),skinDepth=distanceFrom(unsafe,w,h),band=Math.max(3,Math.min(32,f.eye*.18)),feather=Math.max(1.5,f.eye*.03),depth=Math.max(1.5,Math.min(6,f.eye*.025)),tileSize=Math.max(4,Math.round(f.eye*.08));
 const tiles=new Map();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y);if(!interior[n]||!within(q)||hairDistance[n]>=band||overlay[n*4+3]>=248)continue;
  if(category[n]!==1&&!(category[n]===0&&portrait[n*4+3]<248))continue;
  const key=`${Math.floor(q.u/tileSize)},${Math.floor(q.v/tileSize)}`;
  if(!tiles.has(key))tiles.set(key,{points:[],u:0,v:0,offset:null});
  const tile=tiles.get(key);tile.points.push({x,y,n,amount:smooth((band-hairDistance[n])/feather)});tile.u+=q.u;tile.v+=q.v;
 }
 const safeAt=(x,y)=>{
  const px=Math.floor(x),py=Math.floor(y);if(px<0||py<0||px+1>=w||py+1>=h)return false;
  return [py*w+px,py*w+px+1,(py+1)*w+px,(py+1)*w+px+1].every(n=>!unsafe[n]&&skinDepth[n]>=depth);
 };
 const offsets=tile=>{
  const u=tile.u/tile.points.length-f.center,sign=Math.sign(u),directions=Math.abs(u)<f.eye*.25?[[0,1],[-.25,1],[.25,1]]:[[0,1],[-sign,.5],[-sign,0],[-sign,1],[-sign,.25]];
  const found=[],step=Math.max(1,f.eye*.018);
  for(let r=Math.max(2,f.eye*.035);r<=f.eye*.45;r+=step)for(const [du,dv] of directions){const norm=Math.hypot(du,dv),a=du*r/norm,b=dv*r/norm;found.push({x:a*f.c-b*f.s,y:a*f.s+b*f.c})}return found;
 };
 let filled=0,remaining=0;
 for(const tile of tiles.values()){
  const choices=offsets(tile);tile.choices=choices;let best=0;
  for(const offset of choices){let count=0;for(const p of tile.points)if(safeAt(p.x+offset.x,p.y+offset.y))count++;
   if(count>best){best=count;tile.offset=offset}if(count===tile.points.length)break;
  }
 }
 for(const tile of tiles.values()){
  for(const p of tile.points){
   const choices=tile.choices;let offset=tile.offset;if(!offset||!safeAt(p.x+offset.x,p.y+offset.y))offset=choices.find(o=>safeAt(p.x+o.x,p.y+o.y));
   if(!offset){remaining++;continue}
   // Interpolate only donor translations at tile joins, then recheck skin
   // safety. This smooths copied skin without touching brows/eyes or PNG RGB.
   const q=f.local(p.x,p.y),u=q.u/tileSize-.5,v=q.v/tileSize-.5,tx=Math.floor(u),ty=Math.floor(v);let dx=0,dy=0,total=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
    const neighbour=tiles.get(`${tx+xx},${ty+yy}`)?.offset;if(!neighbour)continue;
    const weight=(xx?u-tx:1-u+tx)*(yy?v-ty:1-v+ty);dx+=neighbour.x*weight;dy+=neighbour.y*weight;total+=weight;
   }
   if(total&&safeAt(p.x+dx/total,p.y+dy/total))offset={x:dx/total,y:dy/total};
   const x=p.x+offset.x,y=p.y+offset.y,px=Math.floor(x),py=Math.floor(y),fx=x-px,fy=y-py,color=[0,0,0];let alpha=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
    const j=((py+yy)*w+px+xx)*4,weight=(xx?fx:1-fx)*(yy?fy:1-fy)*portrait[j+3]/255;alpha+=weight;
    for(let k=0;k<3;k++)color[k]+=portrait[j+k]*weight;
   }
   const j=p.n*4,old=portrait[j+3]/255*(1-p.amount),added=p.amount,next=old+added;
   for(let k=0;k<3;k++)out[j+k]=Math.round((portrait[j+k]*old+color[k]/alpha*added)/next);
   out[j+3]=Math.round(next*255);filled++;
  }
 }
 return {pixels:out,filled,remaining};
}
