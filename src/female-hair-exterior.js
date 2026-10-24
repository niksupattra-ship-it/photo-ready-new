// Female PNG hairstyles keep their own shape. This eraser only removes the
// original portrait's semantically identified hair outside that shape.
// RGB is never painted, resampled or borrowed from the hairstyle reference.
const FACE_OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const skinCategory=c=>c===2||c===3;
const protectedCategory=c=>skinCategory(c)||c===4;
const rgba=(p,n)=>(p instanceof Uint8Array||p instanceof Uint8ClampedArray)&&p.length===n*4;
const luminance=(p,j)=>p[j]*.2126+p[j+1]*.7152+p[j+2]*.0722;

function median(values){
 values.sort((a,b)=>a-b);
 const n=values.length;
 return n?values[n>>1]:null;
}

function rasterPolygon(mask,points,w,h){
 const top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));
 const bottom=Math.min(h-1,Math.ceil(Math.max(...points.map(p=>p.y))));
 for(let y=top;y<=bottom;y++){
  const line=y+.5,xs=[];
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];
   if((a.y>line)!==(b.y>line))xs.push(a.x+(line-a.y)*(b.x-a.x)/(b.y-a.y));
  }
  xs.sort((a,b)=>a-b);
  for(let i=0;i+1<xs.length;i+=2){
   const left=Math.max(0,Math.ceil(xs[i]-.5)),right=Math.min(w-1,Math.floor(xs[i+1]-.5));
   if(right>=left)mask.fill(1,y*w+left,y*w+right+1);
  }
 }
}

// Distance is evaluated at native resolution. In particular, there is no
// dilation by semantic-model cells, which would retain a wide band of old hair.
function distanceTo(seeds,w,h,limit){
 const distance=new Float32Array(w*h),diagonal=Math.SQRT2;
 for(let n=0;n<distance.length;n++)distance[n]=seeds[n]?0:limit;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x;let d=distance[n];
  if(x)d=Math.min(d,distance[n-1]+1);
  if(y){d=Math.min(d,distance[n-w]+1);if(x)d=Math.min(d,distance[n-w-1]+diagonal);if(x+1<w)d=Math.min(d,distance[n-w+1]+diagonal)}
  distance[n]=d;
 }
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
  const n=y*w+x;let d=distance[n];
  if(x+1<w)d=Math.min(d,distance[n+1]+1);
  if(y+1<h){d=Math.min(d,distance[n+w]+1);if(x)d=Math.min(d,distance[n+w-1]+diagonal);if(x+1<w)d=Math.min(d,distance[n+w+1]+diagonal)}
  distance[n]=d;
 }
 return distance;
}

/**
 * Remove only original class-1 hair outside the selected female hair silhouette.
 * `labels` is a MediaPipe category plane {data: Uint8Array, width, height}.
 * All RGBA planes are aligned, native-sized, straight-alpha pixel arrays.
 * `cleaned` may contain previous upper-hair erasure. Its alpha is retained;
 * anatomical skin/face protection restores original alpha when needed. Dark,
 * background-labeled cutout fringes need nearby confirmed old-hair evidence.
 * `aboveEarsOnly` restores the entire original portrait below a conservative
 * upper-ear plane. Free female PNGs additionally protect the complete ear
 * regions and restore interior pixels erased underneath replacement hair.
 * The input planes are never mutated. Invalid evidence fails without an output.
 */
export function eraseFemaleHairExterior({original,cleaned=original,overlay,width:w,height:h,face,labels,aboveEarsOnly=false,preserveInterior=false}={}){
 const n=w*h;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!rgba(original,n)||!rgba(cleaned,n)||!rgba(overlay,n))throw Error('ภาพไม่พร้อมสำหรับเก็บขอบผมหญิง');
 const {data,width:mw,height:mh}=labels||{};
 if(!(data instanceof Uint8Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||data.length!==mw*mh)throw Error('ตรวจพื้นที่ผมและผิวไม่สำเร็จ · เก็บภาพเดิมไว้');
 const ids=[...FACE_OVAL,33,263];
 if(ids.some(i=>!face?.[i]||![face[i].x,face[i].y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('ไม่พบกรอบใบหน้าเพื่อป้องกันผิวและหู');
 const point=i=>({x:face[i].x*w,y:face[i].y*h});
 const left=point(33),right=point(263),eye=Math.hypot(right.x-left.x,right.y-left.y);
 if(eye<5)throw Error('ตำแหน่งใบหน้าไม่ชัดพอสำหรับเก็บขอบผม');
 const ex=(right.x-left.x)/eye,ey=(right.y-left.y)/eye,cx=(left.x+right.x)/2,cy=(left.y+right.y)/2;
 const local=p=>({u:(p.x-cx)*ex+(p.y-cy)*ey,v:-(p.x-cx)*ey+(p.y-cy)*ex});
 const forehead=local(point(10)),chin=local(point(152)),cheeks=[local(point(234)),local(point(454))],ears=[local(point(127)),local(point(356))];
 if(chin.v-forehead.v<eye*.6||Math.abs(cheeks[1].u-cheeks[0].u)<eye)throw Error('กรอบใบหน้าไม่ชัดพอสำหรับเก็บขอบ');
 // Face-mesh attachment points can sit below the actual upper helix. Use
 // the higher attachment and a conservative offset, in the head's eye axis.
 const earCutoff=aboveEarsOnly?Math.min(ears[0].v,ears[1].v)-Math.max(2,eye*.26):Infinity;
 const center=(cheeks[0].u+cheeks[1].u)/2;
 const categories=new Uint8Array(n),faceSupport=new Uint8Array(n),skinSeeds=new Uint8Array(n),protect=new Uint8Array(n);
 rasterPolygon(faceSupport,FACE_OVAL.map(point),w,h);
 const cornerV=[local({x:0,y:0}).v,local({x:w,y:0}).v,local({x:0,y:h}).v,local({x:w,y:h}).v];
 const rowOrigin=Math.floor(Math.min(...cornerV))-1,rowCount=Math.ceil(Math.max(...cornerV))-rowOrigin+2;
 const envelopeLeft=new Float32Array(rowCount),envelopeRight=new Float32Array(rowCount);
 envelopeLeft.fill(Infinity);envelopeRight.fill(-Infinity);
 const faceLuma=[],faceRed=[],faceBlue=[];
 let foundHair=false;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=y*w+x,j=at*4,category=data[Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w))];
  categories[at]=category;
  if(overlay[j+3])foundHair=true;
  // A nearly transparent PNG fringe cannot cover opaque original hair. It
  // must not resurrect an old crown/curtain erased by the earlier upper pass.
  const q=local({x:x+.5,y:y+.5});
  const earProtected=(aboveEarsOnly&&q.v>=earCutoff)||(preserveInterior&&ears.some(e=>((q.u-e.u)/(eye*.22))**2+((q.v-e.v-eye*.24)/(eye*.58))**2<=1));
  protect[at]=earProtected||faceSupport[at]||protectedCategory(category)?1:overlay[j+3]>=192?2:0;
  if(overlay[j+3]>=192){
   const {u,v}=local({x:x+.5,y:y+.5}),row=Math.floor(v)-rowOrigin;
   envelopeLeft[row]=Math.min(envelopeLeft[row],u);envelopeRight[row]=Math.max(envelopeRight[row],u);
  }
  if(skinCategory(category)&&original[j+3]>32)skinSeeds[at]=1;
  if(category===3&&faceSupport[at]&&original[j+3]>192){
   // Sample sparsely without depending on model resolution or portrait size.
   if((x%3)||(y%3))continue;
   const sum=original[j]+original[j+1]+original[j+2];
   if(sum<30)continue;
   faceLuma.push(luminance(original,j));faceRed.push(original[j]/sum);faceBlue.push(original[j+2]/sum);
  }
 }
 if(!foundHair)throw Error('ไม่พบทรงผมหลักสำหรับเก็บขอบ · เก็บภาพเดิมไว้');
 // An inner forehead opening is not exterior hair. Preserve the native
 // portrait between actual left/right opaque hair at the same eye-axis row.
 // Empty rows below a short cap have no span, so this cannot retain an old bob.
 // Directly covered pixels still keep any stronger existing upper erasure.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=y*w+x;if(protect[at]&&!(preserveInterior&&protect[at]===2))continue;
  const {u,v}=local({x:x+.5,y:y+.5}),row=Math.floor(v)-rowOrigin;
  if(u>envelopeLeft[row]&&u<envelopeRight[row])protect[at]=1;
 }
 const medianLuma=median(faceLuma),medianRed=median(faceRed),medianBlue=median(faceBlue);
 if(medianLuma===null)throw Error('ตรวจผิวใบหน้าไม่สำเร็จ · เก็บภาพเดิมไว้');
 if(medianLuma!==null){
  const reach=clamp(eye*.08,3,12),skinDistance=distanceTo(skinSeeds,w,h,reach+1);
  // An ear ellipse is only a search area. It never protects hair by itself.
  // A shadow must also look like this person's skin AND sit close to actual
  // detected skin; neither black hair nor a warm brown bob can flood this guard.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const at=y*w+x,j=at*4;
   if((categories[at]!==1&&categories[at]!==0)||protect[at]||skinDistance[at]>reach||!original[j+3])continue;
   const {u,v}=local({x:x+.5,y:y+.5});
   const earRegion=ears.some(e=>((u-e.u)/(eye*.32))**2+((v-e.v-eye*.27)/(eye*.52))**2<=1);
   // Central neck shadows can be mislabeled as hair too. This narrow search
   // remains tied to actual nearby skin, rather than preserving a whole column.
   const neckRegion=v>=chin.v-eye*.04&&v<=chin.v+eye*.9&&Math.abs(u-center)<eye*.36;
   if(!earRegion&&!neckRegion)continue;
   const r=original[j],g=original[j+1],b=original[j+2],sum=r+g+b;
   if(sum<30||luminance(original,j)<medianLuma*.45||r<g||r<b||g<b*.94)continue;
   if(categories[at]===0&&(r<g*1.08||r<b*1.12))continue;
   if(Math.abs(r/sum-medianRed)>.095||Math.abs(b/sum-medianBlue)>.085)continue;
   protect[at]=1;
  }
 }
 // A coarse model often calls the thin cutout rim background. Clear only
 // dark native foreground close to proven old hair, never unrelated scenery
 // or an entire background-labeled region. This also catches a long strand
 // below the crown, where the separate upper-only eraser cannot reach.
 const fringeReach=Math.max(1,Math.min(24,eye*.08,Math.max(w/mw,h/mh)*2.5));
 for(let at=0;at<n;at++)skinSeeds[at]=categories[at]===1&&!faceSupport[at]&&original[at*4+3]>8?1:0;
 const oldHairDistance=distanceTo(skinSeeds,w,h,fringeReach+1);
 const feather=clamp(eye*.012,1,4),distance=distanceTo(protect,w,h,feather+.5);
 const out=new Uint8ClampedArray(original);
 for(let at=0;at<n;at++){
  const j=at*4;
  out[j+3]=protect[at]===1?original[j+3]:Math.min(original[j+3],cleaned[j+3]);
  const debris=categories[at]===0&&original[j+3]>0&&oldHairDistance[at]<=fringeReach&&luminance(original,j)<medianLuma*.70;
  if((categories[at]!==1&&!debris)||protect[at])continue;
  const t=clamp((distance[at]-.5)/feather,0,1),erase=t*t*(3-2*t);
  // Previous eligible upper-hair cleanup may be stronger; do not undo it.
  out[j+3]=Math.min(cleaned[j+3],Math.round(original[j+3]*(1-erase)));
  if(overlay[j+3]>0&&overlay[j+3]<192)out[j+3]=Math.min(out[j+3],overlay[j+3]);
 }
 // Apply this last as well: neither prior cleanup nor feathering, model
 // categories, hair opacity or shadow colour may remove any part of an ear.
 if(aboveEarsOnly)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(local({x:x+.5,y:y+.5}).v>=earCutoff){const j=(y*w+x)*4;out[j+3]=original[j+3]}
 }
 return out;
}
