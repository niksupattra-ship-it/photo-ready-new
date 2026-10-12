import {softHairEraser} from './soft-hair-eraser.js';
import {isSingleLayerHair} from './short-female-hair.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t)};
function frame(face,w,h){
 if([33,263,127,356,234,454,152].some(i=>!face?.[i]||![face[i].x,face[i].y].every(Number.isFinite)))throw Error('ตรวจแนวใบหน้าและหูสำหรับผมสองเลเยอร์ไม่สำเร็จ');
 const dx=(face[263].x-face[33].x)*w,dy=(face[263].y-face[33].y)*h,eye=Math.hypot(dx,dy);if(eye<5)throw Error('แนวหูไม่ชัดพอสำหรับดันผมด้านหลัง');
 const c=dx/eye,s=dy/eye,cx=(face[263].x+face[33].x)*w/2,cy=(face[263].y+face[33].y)*h/2;
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c}),world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c}),p=i=>local(face[i].x*w,face[i].y*h);
 return {eye,local,world,ears:[p(127),p(356)],chin:p(152),width:Math.abs(p(454).u-p(234).u)};
}
function check(w,h,...images){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||images.some(p=>p?.length!==w*h*4))throw Error('พิกเซลผมสองเลเยอร์ไม่ตรงกับภาพ')}
function distance(seed,w,h){
 const d=new Float32Array(w*h),root=Math.SQRT2;for(let n=0;n<d.length;n++)d[n]=seed[n]?0:w+h;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=y*w+x;if(x)d[n]=Math.min(d[n],d[n-1]+1);if(y){d[n]=Math.min(d[n],d[n-w]+1);if(x)d[n]=Math.min(d[n],d[n-w-1]+root);if(x+1<w)d[n]=Math.min(d[n],d[n-w+1]+root)}}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const n=y*w+x;if(x+1<w)d[n]=Math.min(d[n],d[n+1]+1);if(y+1<h){d[n]=Math.min(d[n],d[n+w]+1);if(x)d[n]=Math.min(d[n],d[n+w-1]+root);if(x+1<w)d[n]=Math.min(d[n],d[n+w+1]+root)}}return d;
}
// Direct alpha erasure on the FRONT PNG only. Expand the strength a little
// past the true skin edge, then feather that field to remove stepped labels.
// The original photograph and every hair RGB byte remain immutable.
export function eraseLongHairInner(original,skin,portrait,w,h,face){
 check(w,h,original,skin,portrait);const f=frame(face,w,h),seed=new Uint8Array(w*h),strength=new Float32Array(w*h),limit=new Float32Array(w*h);
 for(let n=0;n<seed.length;n++)seed[n]=skin[n*4+3]>=128&&portrait[n*4+3]>=128?1:0;
 const near=distance(seed,w,h),sigma=clamp(f.eye*.018,1,6),margin=Math.max(1.5,sigma*1.4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y),ear=f.ears[q.u<0?0:1];
  strength[n]=near[n]<=margin?1:0;
  const side=smooth((Math.abs(q.u)-f.width*.28)/(f.width*.12)),earGate=smooth((q.v-ear.v+f.eye*.09)/(sigma*3)),lower=smooth((q.v-f.eye*.25)/(f.eye*.18));
  limit[n]=Math.max(side*earGate,lower);
 }
 return softHairEraser(original,w,h,strength,sigma,limit);
}
function composite(front,portrait,back,n){const j=n*4,a=front[j+3]/255,b=portrait[j+3]/255,c=back[j+3]/255;return (a+(1-a)*(b+(1-b)*c))*255}

// Continuous inverse liquify of the ORIGINAL rear texture. The crown and
// outside edge stay pinned. A monotone radial mapping stretches dense hair
// inward under the unchanged person, instead of copying strips into a gap.
export function pushLongHairRear(original,front,portrait,skin,guide,w,h,face){
 check(w,h,original,front,portrait,skin,guide);const f=frame(face,w,h),out=new Uint8ClampedArray(original),unsafe=new Uint8Array(w*h);
 // A rear layer must never become visible through an eye/face hole. Reject
 // a damaged middle photograph rather than repainting or inventing its skin.
 for(const id of [33,263,1,4,61,291])if(face[id]){const x=Math.round(face[id].x*w),y=Math.round(face[id].y*h);if(x<0||y<0||x>=w||y>=h||portrait[(y*w+x)*4+3]<248)throw Error('รูปคนมีช่องโปร่งบริเวณใบหน้า · เก็บภาพเดิมไว้')}
 const radius=Math.min(Math.hypot(w,h),Math.max(f.width,f.eye*2));let skinBottom=f.chin.v;
 for(let n=0;n<unsafe.length;n++){unsafe[n]=original[n*4+3]>=248&&guide[n*4+3]>=128?0:1;if(skin[n*4+3]>=128&&portrait[n*4+3]>=128){const q=f.local(n%w,Math.floor(n/w));if(Math.abs(q.u)<=radius)skinBottom=Math.max(skinBottom,q.v)}}
 const depth=distance(unsafe,w,h),thick=clamp(f.eye*.018,1.25,5),overlap=Math.max(2,f.eye*.035),reach=f.eye*.85,lift=Math.ceil(f.eye*.7),start=Math.floor(Math.min(...f.ears.map(e=>e.v))-f.eye*.12),end=Math.ceil(skinBottom+Math.max(3,f.eye*.04)),count=Math.max(1,end-start+1);
 const at=(u,v)=>{const q=f.world(u,v),x=Math.round(q.x),y=Math.round(q.y);return x>=0&&y>=0&&x<w&&y<h?y*w+x:-1};
 const profiles=[[],[]];let expected=0;
 for(let side=0;side<2;side++)for(let i=0;i<count;i++){
  const sign=side?1:-1,v=start+i;let edge=0,inner=null,pin=null,envelope=null;
  for(let r=0;r<=radius;r++){const n=at(sign*r,v);if(n>=0&&skin[n*4+3]>=128&&portrait[n*4+3]>=128)edge=r}
  if(edge&&v>=f.ears[side].v-f.eye*.08){
   let run=null;for(let r=Math.max(0,edge-overlap);r<=radius;r++){
    const n=at(sign*r,v),dense=n>=0&&depth[n]>=thick;if(envelope===null&&n>=0&&original[n*4+3]>=128)envelope=r;
    if(dense){if(run===null)run=r;if(r-run>=Math.max(2,f.eye*.055)){if(inner===null)inner=run;pin=r}}
    else if(inner!==null)break;else run=null;
   }
  }
  profiles[side].push({v,edge,inner,pin,envelope,sourceV:v,needs:false,target:edge-overlap});
 }
 for(let side=0;side<2;side++){
  const sign=side?1:-1,rows=profiles[side],raw=rows.map(r=>({...r}));
  for(let i=0;i<count;i++){
   const row=rows[i];if(!row.edge||row.v<f.ears[side].v-f.eye*.08)continue;
   // A missing entire ear band may borrow a nearby dense source row, as one
   // smoothly deformed surface. Prefer lower hair with enough opaque depth.
   if(row.inner===null){
    let candidate=null;for(const direction of [1,-1]){for(let d=1;d<=lift;d++){const r=raw[i+direction*d];if(r?.inner!==null&&r?.inner!==undefined&&r.pin-r.inner>=Math.max(3,f.eye*.08)){candidate=r;break}}if(candidate)break}
    if(candidate){row.inner=candidate.inner;row.pin=candidate.pin;row.sourceV=candidate.v}
   }
   if(row.inner===null||row.inner-row.edge>reach||row.pin<=row.inner+1)continue;
   for(let r=row.edge+.5;r<row.inner;r+=.75){const n=at(sign*r,row.v);if(n>=0&&composite(front,portrait,original,n)<248){row.needs=true;break}}
   if(!row.needs)continue;expected++;
  }
  // Keep source rows ordered, including a lifted band. Return gradually to
  // identity as the original rows catch up; never fold the vertical mapping.
  let prior=-Infinity;for(const row of rows)if(row.inner!==null){row.sourceV=Math.max(row.sourceV,prior+.4);prior=row.sourceV}
  for(let i=0;i<count;i++){
   const row=rows[i];if(!row.needs)continue;
   const k=clamp(Math.round(row.sourceV-start),0,count-1),sourceRow=raw[k];
   if(sourceRow?.inner===null||sourceRow?.inner===undefined){row.needs=false;continue}
   const cushion=Math.max(1.5,thick*.6);row.inner=sourceRow.inner+cushion;row.pin=sourceRow.pin-cushion;
  }
 }
 const sample=(u,v)=>{
  const q=f.world(u,v),x=Math.floor(q.x),y=Math.floor(q.y),fx=q.x-x,fy=q.y-y;let alpha=0,r=0,g=0,b=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const ax=x+xx,ay=y+yy;if(ax<0||ay<0||ax>=w||ay>=h)continue;const j=(ay*w+ax)*4;if(guide[j+3]<128)continue;const part=original[j+3]*(xx?fx:1-fx)*(yy?fy:1-fy);alpha+=part;r+=original[j]*part;g+=original[j+1]*part;b+=original[j+2]*part}return [alpha?r/alpha:0,alpha?g/alpha:0,alpha?b/alpha:0,alpha];
 };
 let changed=0;const gapPixels=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,j=n*4,q=f.local(x,y),side=q.u<0?0:1,r=Math.abs(q.u),i=Math.floor(q.v-start),rows=profiles[side];if(i<0||i>=count)continue;
  const row=rows[i],joint=row.inner??row.envelope;if(!row.edge||q.v<f.ears[side].v-f.eye*.08||joint===null||joint-row.edge>reach)continue;
  const visible=portrait[j+3]<248&&skin[j+3]<128,rInside=r>row.edge+.25&&r<joint-.25;
  if(visible&&rInside&&composite(front,portrait,original,n)<248)gapPixels.push(n);
  if(!row.needs||r<row.target||r>=row.pin)continue;
  // Interpolate adjacent controls only where both share available dense hair.
  const next=rows[i+1]?.needs?rows[i+1]:row,tv=q.v-start-i,lerp=k=>row[k]*(1-tv)+next[k]*tv,target=lerp('target'),inner=lerp('inner'),pin=lerp('pin'),sourceV=lerp('sourceV');
  if(pin<=inner+1||r<target||r>=pin)continue;
  const t=clamp((r-target)/(pin-target),0,1),ratio=(pin-target)/(pin-inner),sr=inner+(pin-inner)*Math.pow(t,ratio),present=smooth((original[j+3]-128)/120),sv=q.v+(sourceV-q.v)*(1-present*smooth(t)),pixel=sample((side?1:-1)*sr,sv);
  if(pixel[3]<244)continue;
  const fade=smooth((q.v-(f.ears[side].v-f.eye*.08))/Math.max(1,f.eye*.025))*smooth((r-target)/Math.max(1,overlap*.5));
  const amount=portrait[j+3]>=248?fade:1;
  for(let k=0;k<4;k++)out[j+k]=Math.round(original[j+k]*(1-amount)+pixel[k]*amount);changed++;
 }
 let filled=0;for(const n of gapPixels)if(composite(front,portrait,out,n)>=248)filled++;
 return {pixels:out,report:{adjusted:changed>0,detected:gapPixels.length,filled,remaining:gapPixels.length-filled,unavailable:(expected>0||gapPixels.length>0)&&changed===0},profiles};
}

export function longHairWarpTarget(layers,selected){
 const current=layers.find(l=>l.id===selected);if(!current||current.kind!=='hair-preview'||isSingleLayerHair(current.hairId)||current.hairRole==='back')return current||null;
 return layers.find(l=>l.kind==='hair-preview'&&l.hairRole==='back'&&l.hairHeadId===current.hairHeadId&&l.hairId===current.hairId)||null;
}
