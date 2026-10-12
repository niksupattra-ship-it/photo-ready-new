import {softHairEraser} from './soft-hair-eraser.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};
const ovalIds=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const browIds=[70,63,105,66,107,55,65,52,53,46,300,293,334,296,336,285,295,282,283,276];
function frame(face,w,h){
 const valid=i=>face?.[i]&&[face[i].x,face[i].y].every(Number.isFinite);
 if([33,263,10,234,454].some(i=>!valid(i)))throw Error('ไม่พบจุดล็อกหน้าผาก คิ้ว และตา');
 const l=face[33],r=face[263],dx=(r.x-l.x)*w,dy=(r.y-l.y)*h,eye=Math.hypot(dx,dy);
 if(eye<5)throw Error('ใบหน้าไม่ชัดพอสำหรับดันหน้าผาก');
 const c=dx/eye,s=dy/eye,cx=(l.x+r.x)*w/2,cy=(l.y+r.y)*h/2;
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c});
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c}),p=i=>local(face[i].x*w,face[i].y*h),forehead=p(10),width=Math.abs(p(454).u-p(234).u);
 // All deformation ends above the highest actual eyebrow. This also keeps
 // every eye and lower facial feature on the identity part of the mapping.
 const brows=browIds.filter(valid).map(p),anchor=(brows.length?Math.min(...brows.map(q=>q.v)):-eye*.32)-Math.max(2,eye*.06);
 const oval=ovalIds.every(valid)?ovalIds.map(p):null;
 const insideFace=(u,v)=>{
  if(!oval)return v>=forehead.v&&Math.abs(u)<=width*.43;
  let yes=false;for(let i=0,j=oval.length-1;i<oval.length;j=i++){const a=oval[i],b=oval[j];if((a.v>v)!==(b.v>v)&&u<(b.u-a.u)*(v-a.v)/(b.v-a.v)+a.u)yes=!yes}return yes;
 };
 return {eye,width,local,world,forehead,anchor,insideFace};
}

// This edits the PROCESSED portrait only. PNG placement, both hair layers and
// rear gap filling are inputs, never outputs. The front PNG alone measures the
// upper excess and inner forehead join; rear opacity cannot protect old hair.
export function fitProcessedForehead(original,front,w,h,face,labels,lowerResult=original){
 const {data,width:mw,height:mh}=labels||{};
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||[original,front,lowerResult].some(p=>p?.length!==w*h*4)||!(data instanceof Uint8Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||data.length!==mw*mh)throw Error('ภาพหน้าตรงไม่พร้อมสำหรับเก็บผมและดันหน้าผาก');
 const f=frame(face,w,h),out=new Uint8ClampedArray(lowerResult),classes=new Uint8Array(w*h),protectedLabels=new Uint8Array(data.length),nearHair=new Uint8Array(data.length);
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
  const cat=data[y*mw+x];if(![1,2,3,4].includes(cat))continue;
  for(let yy=Math.max(0,y-2);yy<=Math.min(mh-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(mw-1,x+2);xx++){
   if(cat===1)nearHair[yy*mw+xx]=1;else protectedLabels[yy*mw+xx]=1;
  }
 }
 const labelAt=(x,y)=>Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w));
 const at=(u,v)=>{const p=f.world(u,v),x=Math.round(p.x),y=Math.round(p.y);return x>=0&&x<w&&y>=0&&y<h?y*w+x:-1};
 const origin=Math.floor(-f.width*.85),count=Math.ceil(f.width*1.7)+1,top=new Float32Array(count);top.fill(Infinity);
 // Restore the original upper portrait before this replacement pass. Older
 // erasures must never be inherited by the forehead. Lower results stay exact.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y);classes[n]=data[labelAt(x,y)];
  if(q.v>=f.anchor||Math.abs(q.u)>f.width*.85)continue;
  out.set(original.subarray(n*4,n*4+4),n*4);
  if(q.v<f.forehead.v&&front[n*4+3]>=128){const i=Math.round(q.u-origin);if(i>=0&&i<count)top[i]=Math.min(top[i],q.v)}
 }
 const contour=new Float32Array(top),radius=Math.max(1,Math.min(5,Math.round(f.eye*.012)));
 for(let i=0;i<count;i++){
  let sum=0,total=0;for(let k=Math.max(0,i-radius);k<=Math.min(count-1,i+radius);k++)if(Number.isFinite(top[k])){sum+=top[k];total++}
  if(total)contour[i]=sum/total;
 }
 const field=new Float32Array(w*h),limit=new Float32Array(w*h),feather=Math.max(2,Math.min(10,f.eye*.02));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,j=n*4,q=f.local(x,y),label=labelAt(x,y),cat=classes[n];
  if(q.v>=f.forehead.v-f.eye*.03||Math.abs(q.u)>f.width*.85||protectedLabels[label]||f.insideFace(q.u,q.v))continue;
  // Low-resolution detection may call a dark edge strand background. Accept
  // only remnants adjacent to confirmed hair, never the blue photo backdrop.
  const rgb=original.subarray(j,j+3),debris=cat===0&&nearHair[label]&&Math.max(...rgb)-Math.min(...rgb)<70&&Math.max(...rgb)<180;
  if(cat!==1&&!debris)continue;
  const edge=contour[clamp(Math.round(q.u-origin),0,count-1)];
  field[n]=Number.isFinite(edge)?smooth((edge+feather-q.v)/(2*feather)):1;limit[n]=1;
 }
 const erased=softHairEraser(out,w,h,field,Math.max(1,Math.min(4,f.eye*.012)),limit);let erasedPixels=0;
 for(let n=0;n<w*h;n++)if(erased[n*4+3]<out[n*4+3])erasedPixels++;
 out.set(erased);

 // Build a skin-to-hairline displacement profile, not donor patches. A
 // monotone inverse warp stretches this same forehead skin upwards and ends
 // with unit derivative at the fixed brow boundary. No colours/skin are made
 // up, no whole-face transform is used and no source ever reaches a brow/eye.
 const profiles=new Map(),maxU=f.width*.40,overlap=Math.max(2,f.eye*.035),run=Math.max(3,Math.ceil(f.eye*.02)),sourcePad=Math.max(1.5,f.eye*.012);
 const safeSkin=n=>n>=0&&(classes[n]===2||classes[n]===3)&&original[n*4+3]===255;
 for(let u=Math.ceil(-maxU);u<=Math.floor(maxU);u++){
  let skinTop=null,hairline=null,foundHair=false,gap=0,skinRun=0;
  for(let v=f.forehead.v-f.eye*.65;v<f.anchor;v++){
   const n=at(u,v);if(n<0)continue;
   if(front[n*4+3]>=128){foundHair=true;hairline=v;gap=0}else if(foundHair&&++gap>=run)break;
  }
  if(hairline===null)continue;
  for(let v=f.forehead.v-f.eye*.25;v<f.anchor;v++){
   const n=at(u,v);skinRun=safeSkin(n)?skinRun+1:0;
   if(skinRun>=run){skinTop=v-run+1+sourcePad;break}
  }
  const target=hairline-overlap;
  if(skinTop!==null&&skinTop<=target)continue;
  if(skinTop===null||f.anchor-skinTop<2){profiles.set(u,{unresolved:true,target});continue}
  const pull=skinTop-target;
  if(pull>f.eye*.65){profiles.set(u,{unresolved:true,target});continue}
  profiles.set(u,{source:skinTop,target,ratio:(f.anchor-target)/(f.anchor-skinTop)});
 }
 // Smooth neighbouring skin/hairline control points. Keep the source point
 // inside known skin and the destination point covered by the front hair.
 const raw=new Map([...profiles].map(([u,row])=>[u,{...row}])),controlRadius=Math.max(1,Math.min(5,Math.round(f.eye*.018)));
 for(const [u,row] of profiles){
  if(row.unresolved)continue;let source=0,target=0,total=0;
  for(let k=u-controlRadius;k<=u+controlRadius;k++){const neighbour=raw.get(k);if(!neighbour||neighbour.unresolved)continue;const weight=controlRadius+1-Math.abs(k-u);source+=neighbour.source*weight;target+=neighbour.target*weight;total+=weight}
  if(!total)continue;
  row.source=Math.max(row.source,source/total);row.target=Math.min(row.target,target/total);
  if(f.anchor-row.source<2){row.unresolved=true;continue}row.ratio=(f.anchor-row.target)/(f.anchor-row.source);
 }
 const sourceAt=(x,y)=>{
  const px=Math.floor(x),py=Math.floor(y);if(px<0||py<0||px+1>=w||py+1>=h)return null;
  const fx=x-px,fy=y-py,color=[0,0,0,0];
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const n=(py+yy)*w+px+xx;if(!safeSkin(n))return null;
   const weight=(xx?fx:1-fx)*(yy?fy:1-fy);for(let k=0;k<4;k++)color[k]+=original[n*4+k]*weight;
  }return color;
 };
 let warpedPixels=0,unresolvedColumns=0;
 for(const row of profiles.values())if(row.unresolved)unresolvedColumns++;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y);if(q.v>=f.anchor||Math.abs(q.u)>=maxU)continue;
  const row=profiles.get(Math.round(q.u));if(!row||row.unresolved||q.v<row.target)continue;
  const t=clamp((f.anchor-q.v)/(f.anchor-row.target),0,1),sourceV=f.anchor-(f.anchor-row.source)*(1-(1-t)**row.ratio);
  const lateral=smooth((maxU-Math.abs(q.u))/(f.eye*.10)),v=q.v+(sourceV-q.v)*lateral;
  const p=f.world(q.u,v),rgba=sourceAt(p.x,p.y);if(!rgba)continue;
  for(let k=0;k<4;k++)out[n*4+k]=Math.round(rgba[k]);warpedPixels++;
 }
 return {pixels:out,erasedPixels,warpedPixels,unresolvedColumns};
}
