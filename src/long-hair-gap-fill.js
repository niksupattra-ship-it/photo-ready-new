const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};

// Thickness is measured inside confirmed, opaque hair, not inside the PNG's
// bounding box. A thin wisp or leftover template skin cannot supply a patch.
function hairDepth(source,guide,w,h){
 const d=new Float32Array(w*h),diagonal=Math.SQRT2;
 for(let i=0;i<d.length;i++)d[i]=source[i*4+3]>=248&&guide[i*4+3]>=128?Math.min(w,h):0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!d[i])continue;
  d[i]=Math.min(d[i],x?d[i-1]+1:1,y?d[i-w]+1:1,x&&y?d[i-w-1]+diagonal:1,x+1<w&&y?d[i-w+1]+diagonal:1);
 }
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
  const i=y*w+x;if(!d[i])continue;
  d[i]=Math.min(d[i],x+1<w?d[i+1]+1:1,y+1<h?d[i+w]+1:1,x+1<w&&y+1<h?d[i+w+1]+diagonal:1,x&&y+1<h?d[i+w-1]+diagonal:1);
 }
 return d;
}

// Fill only the inner joins of long hair. Each side follows this portrait's
// actual skin/ear contour in its eye-axis frame. Donor strips are translated
// (including upwards from lower dense hair), never scaled or bent. The front
// PNG, portrait and original opaque rear texture remain untouched.
export function fillLongHairGaps(back,skin,hairGuide,frame,ears,chin,w,h){
 if(hairGuide.width!==w||hairGuide.height!==h)throw Error('ตรวจเนื้อผมด้านหลังไม่สำเร็จ');
 const bx=back.getContext('2d'),image=bx.getImageData(0,0,w,h),source=new Uint8ClampedArray(image.data);
 const sd=skin.getContext('2d').getImageData(0,0,w,h).data,guide=hairGuide.getContext('2d').getImageData(0,0,w,h).data,depth=hairDepth(source,guide,w,h);
 const {x:cx,y:cy,angle,eye,width}=frame,c=Math.cos(angle),s=Math.sin(angle);
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c});
 const at=(u,v)=>{const p=world(u,v),x=Math.round(p.x),y=Math.round(p.y);return x>=0&&x<w&&y>=0&&y<h?(y*w+x):-1};
 const start=Math.min(...ears.map(e=>e.y))-eye*.1,bottom=chin+eye*.9,count=Math.ceil(bottom-start);
 const radius=Math.min(Math.hypot(w,h),Math.max(width*.9,eye*1.8)),overlap=Math.max(1,eye*.035),feather=Math.max(1.5,Math.min(7,eye*.035)),thickness=Math.max(2,Math.min(8,eye*.045)),maxLift=Math.ceil(eye*.65);
 const profiles=new Map();
 for(const sign of [-1,1]){
  const rows=[];
  for(let i=0;i<=count;i++){
   const v=start+i,ear=ears[sign<0?0:1];let edge=0,inner=null,outer=null;
   for(let r=0;r<=radius;r++){const n=at(sign*r,v);if(n>=0&&sd[n*4+3]>=160)edge=r}
   // Start independently at each detected ear. Neck rows use their own skin
   // width, instead of a mirrored face or an ear ellipse shared by all models.
   if(edge&&v>=ear.y-eye*.1)for(let r=Math.max(0,edge-overlap);r<=radius;r++){
    const n=at(sign*r,v);if(n>=0&&guide[n*4+3]>=128&&source[n*4+3]>=248){if(inner===null)inner=r;outer=r}
   }
   rows.push({v,edge,inner,outer,active:v>=ear.y-eye*.1,donor:null});
  }
  const original=rows.map(row=>({...row}));
  for(let i=0;i<=count;i++){
   const row=rows[i];if(!row.edge||!row.active)continue;
   // A whole missing ear band has no hair edge of its own. Recover the inner
   // silhouette from nearby rows, without extending the outside silhouette.
   if(row.inner===null){
    let before=null,after=null;
    for(let d=1;d<=maxLift&&(!before||!after);d++){
     if(!before&&original[i-d]?.inner!==null&&original[i-d]?.inner!==undefined)before=original[i-d];
     if(!after&&original[i+d]?.inner!==null&&original[i+d]?.inner!==undefined)after=original[i+d];
    }
    if(before&&after){const t=(row.v-before.v)/(after.v-before.v);row.inner=before.inner*(1-t)+after.inner*t;row.outer=before.outer*(1-t)+after.outer*t}
    else if(after&&row.v<=chin){row.inner=after.inner;row.outer=after.outer}
   }
   if(row.inner===null||row.inner-row.edge>eye*.9)continue;
   const lo=row.edge-overlap,hi=Math.max(row.edge+1,row.inner),span=hi-lo;
   // Prefer the same row, then lower hair that can be lifted into the opening.
   // Search for a continuous thick strip wide enough to cover the whole gap.
   let best=null;
   for(let d=0;d<=maxLift;d++){
    if(best&&d*2>best.score)break;
    for(const k of d?[i+d,i-d]:[i]){
    const donor=original[k];if(!donor||donor.inner===null)continue;
    let runStart=null;
    for(let r=Math.max(0,donor.inner);r<=donor.outer;r++){
     const n=at(sign*r,donor.v),dense=n>=0&&depth[n]>=thickness;
     if(!dense){runStart=null;continue}if(runStart===null)runStart=r;
     if(r-runStart<span)continue;
     const sourceLo=runStart,score=Math.abs(donor.v-row.v)*2+Math.abs(sourceLo-lo)+(k<i?eye*.06:0);
     if(!best||score<best.score)best={dx:sourceLo-lo,dy:donor.v-row.v,score};break;
    }
    }
   }
   row.donor=best;
  }
  profiles.set(sign,rows);
 }
 const sample=(u,v)=>{
  const p=world(u,v),x=Math.floor(p.x),y=Math.floor(p.y),fx=p.x-x,fy=p.y-y;let a=0,r=0,g=0,b=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const sx=x+xx,sy=y+yy;if(sx<0||sx>=w||sy<0||sy>=h)continue;const n=sy*w+sx,j=n*4;
   if(guide[j+3]<128)continue;
   const part=source[j+3]*(xx?fx:1-fx)*(yy?fy:1-fy);a+=part;r+=source[j]*part;g+=source[j+1]*part;b+=source[j+2]*part;
  }
  return {a,r:a?r/a:0,g:a?g/a:0,b:a?b/a:0};
 };
 let detected=0,filled=0,remaining=0,changed=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,j=n*4;if(source[j+3]>=248)continue;
  const u=(x-cx)*c+(y-cy)*s,v=-(x-cx)*s+(y-cy)*c;if(v<start||v>bottom)continue;
  const sign=u<0?-1:1,r=Math.abs(u),rows=profiles.get(sign),row=rows[clamp(Math.round(v-start),0,count)];
  if(!row.edge||!row.active||row.inner===null||r<row.edge-overlap-feather||r>row.inner+feather)continue;
  const band=smooth((v-start)/(eye*.15))*smooth((bottom-v)/(eye*.22));
  const radial=smooth((r-row.edge+overlap+feather)/feather)*smooth((row.inner+feather-r)/feather);
  const core=r>row.edge+.5&&r<row.inner+.5&&band>.99&&sd[j+3]<128;
  if(core)detected++;
  if(row.donor){
   // Blend neighbouring translation offsets to avoid seams. Fall back to the
   // selected complete strip if interpolation crosses a notch in the donor.
   let dx=0,dy=0,total=0;
   for(let k=Math.max(0,Math.round(v-start)-2);k<=Math.min(count,Math.round(v-start)+2);k++){
    const d=rows[k].donor;if(!d)continue;const weight=3-Math.abs(k-Math.round(v-start));dx+=d.dx*weight;dy+=d.dy*weight;total+=weight;
   }
   let p=sample(sign*(r+dx/total),v+dy/total);
   if(p.a<248)p=sample(sign*(r+row.donor.dx),v+row.donor.dy);
   const added=p.a/255*band*radial,old=source[j+3]/255;
   if(added>0){
    // Preserve existing hair strands over the fill. Non-hair translucent
    // template residue is covered by hair, rather than used as donor texture.
    const keep=guide[j+3]>=128,top=keep?old:added,under=keep?added:old,alpha=top+under*(1-top);
    for(let k=0;k<3;k++){const color=[p.r,p.g,p.b][k],a=keep?source[j+k]:color,b=keep?color:source[j+k];image.data[j+k]=Math.round((a*top+b*under*(1-top))/alpha)}
    image.data[j+3]=Math.round(alpha*255);if(image.data[j+3]>source[j+3])changed++;
   }
  }
  if(core){if(image.data[j+3]>=248)filled++;else remaining++}
 }
 if(changed)bx.putImageData(image,0,0);
 return {adjusted:changed>0,detected,filled,remaining,unavailable:!depth.some(v=>v>=thickness)||![...profiles.values()].some(rows=>rows.some(row=>row.edge&&row.active))};
}
