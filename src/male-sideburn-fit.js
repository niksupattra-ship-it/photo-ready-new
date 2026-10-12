// Male-only, local inverse liquify. Read the portrait to locate the attachment;
// move existing PNG pixels only. No eraser, skin fill or whole-hair squeeze.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t)};
const median=values=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]};
function frame(face,w,h){
 if([33,263,10,127,356,234,454].some(id=>!face?.[id]||![face[id].x,face[id].y].every(Number.isFinite)))return null;
 const dx=(face[263].x-face[33].x)*w,dy=(face[263].y-face[33].y)*h,eye=Math.hypot(dx,dy);
 if(eye<8)return null;
 const c=dx/eye,s=dy/eye,cx=(face[33].x+face[263].x)*w/2,cy=(face[33].y+face[263].y)*h/2;
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c}),world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c}),p=id=>local(face[id].x*w,face[id].y*h);
 const width=Math.abs(p(454).u-p(234).u);
 if(width<eye||width>eye*2.5)return null;
 return {local,world,p,eye,width};
}
function pixel(pixels,w,h,p){
 const x=Math.round(p.x),y=Math.round(p.y);
 return x>=0&&x<w&&y>=0&&y<h?pixels.subarray((y*w+x)*4,(y*w+x)*4+4):null;
}
function skinReference(pixels,w,h,f){
 const samples=[[],[],[]];
 for(let v=.2;v<=.7;v+=.08)for(let u=-.25;u<=.25;u+=.08){const p=pixel(pixels,w,h,f.world(u*f.eye,v*f.eye));if(!p||p[3]<200)continue;for(let k=0;k<3;k++)samples[k].push(p[k])}
 if(samples[0].length<12)return null;
 const colour=samples.map(median),luma=colour.reduce((a,b)=>a+b,0)/3;
 return {colour,luma,match:p=>p&&p[3]>=200&&(p[0]+p[1]+p[2])/3>=luma*.62&&colour.reduce((sum,v,k)=>sum+Math.abs(v-p[k]),0)<=Math.max(24,luma*.60)};
}
function contour(f,face,sign,w,h){
 const ids=sign<0?[21,162,127,234,93]:[251,389,356,454,323];
 const points=ids.filter(id=>face[id]&&[face[id].x,face[id].y].every(Number.isFinite)).map(id=>f.local(face[id].x*w,face[id].y*h)).filter(p=>sign*p.u>f.eye*.5).sort((a,b)=>a.v-b.v);
 return v=>{
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(v>=a.v&&v<=b.v&&b.v-a.v>.1){const t=(v-a.v)/(b.v-a.v);return sign*(a.u+(b.u-a.u)*t)}}
  const temple=f.p(sign<0?127:356);return Math.abs(v-temple.v)<=f.eye*.4?sign*temple.u:null;
 };
}
// Infer each template's actual root/edge/tip from native PNG material within
// the reference temple band. Alpha alone would mistake retained face skin for
// a sideburn. The reference is positioning evidence, never pasted into output.
export function createMaleSideburnGuide(native,sw,sh,reference,rw,rh,face,matrix){
 const f=frame(face,rw,rh);
 if(!f||native?.length!==sw*sh*4||reference?.length!==rw*rh*4||matrix?.length!==6||!matrix.every(Number.isFinite))return null;
 const [a,b,c,d,e,g]=matrix,det=a*d-b*c;if(det<=0)return null;
 const skin=skinReference(reference,rw,rh,f);if(!skin)return null;
 const nativeAt=p=>pixel(native,sw,sh,{x:(d*(p.x-e)-c*(p.y-g))/det,y:(a*(p.y-g)-b*(p.x-e))/det});
 const hair=p=>{const n=nativeAt(p),r=pixel(reference,rw,rh,p);return n&&r&&n[3]>=96&&(n[0]+n[1]+n[2])/3<skin.luma*.60&&(r[0]+r[1]+r[2])/3<skin.luma*.65&&Math.max(n[0],n[1],n[2])-Math.min(n[0],n[1],n[2])<90};
 const sides=[-1,1].map(sign=>{
  const temple=f.p(sign<0?127:356),root=Math.max(f.p(10).v+f.eye*.20,temple.v-f.eye*.28),bottom=temple.v+f.eye*.45,edgeAt=contour(f,face,sign,rw,rh),rows=[];
  const step=Math.max(1,f.eye/96),run=Math.max(2,f.eye*.018);
  for(let v=root;v<=bottom;v+=step){
   const expected=edgeAt(v);if(expected===null)continue;
   let inner=null,outer=null,start=null;
   for(let r=Math.max(f.width*.32,expected-f.eye*.18);r<=expected+f.eye*.22;r+=step){
    if(hair(f.world(sign*r,v))){if(start===null)start=r;if(r-start>=run){if(inner===null)inner=start;outer=r}}
    else if(inner!==null)break;else start=null;
   }
   if(inner!==null&&outer-inner>=run)rows.push({v,inner:inner-step*.5,outer:outer+step*.5});
  }
  if(rows.length<5||rows.at(-1).v-rows[0].v<f.eye*.08)return null;
  let jump=0;for(let i=1;i<rows.length;i++)if(Math.abs(rows[i].inner-rows[i-1].inner)>f.eye*.14||rows[i].v-rows[i-1].v>step*3)jump++;
  if(jump>1)return null;
  return {sign,root:rows[0].v,tip:rows.at(-1).v,rows:rows.map(row=>({...row,point:f.world(sign*row.inner,row.v),outerPoint:f.world(sign*row.outer,row.v)}))};
 });
 return {sides,eye:f.eye};
}
function sample(input,w,h,p){
 const x=Math.floor(p.x),y=Math.floor(p.y),fx=p.x-x,fy=p.y-y;let alpha=0,r=0,g=0,b=0;
 for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
  const px=x+xx,py=y+yy;if(px<0||px>=w||py<0||py>=h)continue;
  const j=(py*w+px)*4,part=input[j+3]*(xx?fx:1-fx)*(yy?fy:1-fy);alpha+=part;r+=input[j]*part;g+=input[j+1]*part;b+=input[j+2]*part;
 }
 return [alpha?r/alpha:0,alpha?g/alpha:0,alpha?b/alpha:0,alpha];
}
// A compact, pinned horizontal mapping in the face's own eye-axis frame.
// Its minimum radial derivative stays above .45; no folding or narrow spikes.
function shiftAt(profile,r,v){
 if(v<=profile.root||v>=profile.end)return 0;
 const rows=profile.rows;let i=0;while(i+1<rows.length&&rows[i+1].v<v)i++;
 const row=rows[i],next=rows[Math.min(i+1,rows.length-1)],t=clamp((v-row.v)/Math.max(.1,next.v-row.v),0,1),get=k=>row[k]+(next[k]-row[k])*t;
 const target=get('target'),left=get('left'),right=get('right');if(r<=left||r>=right)return 0;
 const radial=r<=target?smooth((r-left)/(target-left)):smooth((right-r)/(right-target));
 const vertical=smooth((v-profile.root)/profile.fade)*smooth((profile.end-v)/profile.fade);
 return get('shift')*radial*vertical;
}
export function fitMaleSideburns(original,portrait,w,h,face,labels,guide,matrix){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||original?.length!==w*h*4||portrait?.length!==w*h*4)throw Error('พิกเซลจอนผมไม่ตรงกับภาพ');
 const out=new Uint8ClampedArray(original),f=frame(face,w,h),skin=f&&skinReference(portrait,w,h,f),report={adjusted:false,sides:[],unavailable:false};
 const validLabels=labels?.data instanceof Uint8Array&&Number.isInteger(labels.width)&&Number.isInteger(labels.height)&&labels.width>0&&labels.height>0&&labels.data.length===labels.width*labels.height;
 if(!f||!skin||!validLabels||!guide?.sides||!matrix||!['a','b','c','d','e','f'].every(k=>Number.isFinite(matrix[k]))){report.unavailable=true;return {pixels:out,report}}
 const labelAt=p=>{const x=Math.floor(p.x*labels.width/w),y=Math.floor(p.y*labels.height/h);return x>=0&&x<labels.width&&y>=0&&y<labels.height?labels.data[y*labels.width+x]:0};
 const transform=p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f}),scale=Math.hypot(matrix.a,matrix.b);
 if(scale<=0||matrix.a*matrix.d-matrix.b*matrix.c<=0||Math.abs(matrix.a*matrix.c+matrix.b*matrix.d)>1e-5||Math.abs(scale-Math.hypot(matrix.c,matrix.d))>1e-5){report.unavailable=true;return {pixels:out,report}}
 const profiles=[];
 for(let index=0;index<2;index++){
  const sign=index?1:-1,source=guide.sides[index],side={sign,adjusted:false,reason:null,before:null,after:null};report.sides.push(side);
  if(!source){side.reason='template-unclear';continue}
  const edgeAt=contour(f,face,sign,w,h),rows=[];
  for(const row of source.rows){
   const p=transform(row.point),op=transform(row.outerPoint),q=f.local(p.x,p.y),outer=f.local(op.x,op.y),expected=edgeAt(q.v);if(expected===null)continue;
   let edge=null,run=0,seen=false;
   const step=Math.max(.75,f.eye/160),start=Math.max(f.width*.30,expected-f.eye*.22),finish=expected+f.eye*.06;
   for(let r=start;r<=finish;r+=step){const p=f.world(sign*r,q.v),rgba=pixel(portrait,w,h,p),cat=labelAt(p),yes=skin.match(rgba);
    if(yes){run++;if(run>=3){edge=r;seen=true}}
    else if(seen){break}
    else run=0;
    // A hair label with a matching face colour may be a coarse boundary;
    // category alone must never move the attachment onto background/ear skin.
    if(cat===4||cat===5){edge=null;break}
   }
   if(edge===null||run<3||edge>=finish-step)continue;
   const inner=sign*q.u,target=edge-Math.max(.5,f.eye*.003),shift=target-inner;
   const half=Math.max(f.eye*.20,Math.abs(shift)*3.2),left=Math.max(f.width*.24,Math.min(inner,target)-half),right=Math.max(sign*outer.u,inner,target)+half;
   if(Math.abs(shift)>f.eye*.12||Math.abs(shift)*1.5/Math.min(target-left,right-target)>.55)continue;
   const hair=pixel(original,w,h,f.world(sign*(inner+Math.max(.75,f.eye/192)),q.v));if(!hair||hair[3]<96)continue;
   rows.push({v:q.v,inner,outer:sign*outer.u,target,shift,left,right});
  }
  if(rows.length<5||rows.length<source.rows.length*.65){side.reason='portrait-edge-unclear';continue}
  rows.sort((a,b)=>a.v-b.v);
  const spacing=Math.max(1,guide.eye/96*scale),maxGap=Math.max(spacing*3.5,Math.min(6,f.eye*.12));let safe=true;
  for(let i=1;i<rows.length;i++)if(rows[i].v-rows[i-1].v>maxGap||Math.abs(rows[i].shift-rows[i-1].shift)>f.eye*.06)safe=false;
  if(!safe){side.reason='discontinuous-edge';continue}
  // Smooth only displacement controls. Do not blur the hair image or alpha.
  const raw=rows.map(row=>row.shift);
  for(let i=0;i<rows.length;i++){
   const row=rows[i],nearby=raw.slice(Math.max(0,i-2),i+3);row.shift=nearby.reduce((a,b)=>a+b,0)/nearby.length;row.target=row.inner+row.shift;
   const half=Math.max(f.eye*.20,Math.abs(row.shift)*3.2);row.left=Math.max(f.width*.24,Math.min(row.inner,row.target)-half);row.right=Math.max(row.outer,row.inner,row.target)+half;
  }
  if(rows.some(row=>row.target<=row.left||row.target>=row.right||Math.abs(row.shift)*1.5/Math.min(row.target-row.left,row.right-row.target)>.55)){side.reason='unsafe-deformation';continue}
  const fade=Math.max(1,Math.min(f.eye*.075,(rows.at(-1).v-rows[0].v)*.18)),root=rows[0].v,end=rows.at(-1).v+fade,profile={sign,rows,root,end,fade,side};
  side.before=rows.reduce((sum,r)=>sum+Math.abs(r.shift),0)/rows.length;
  if(side.before<Math.max(.6,f.eye*.003)){side.after=side.before;side.reason='already-aligned';continue}
  profiles.push(profile);
 }
 for(const profile of profiles){
  const trial=new Uint8ClampedArray(out),corners=profile.rows.flatMap(row=>[f.world(profile.sign*row.left,profile.root),f.world(profile.sign*row.right,profile.end)]);
  const x0=clamp(Math.floor(Math.min(...corners.map(p=>p.x)))-2,0,w-1),x1=clamp(Math.ceil(Math.max(...corners.map(p=>p.x)))+2,0,w-1),y0=clamp(Math.floor(Math.min(...corners.map(p=>p.y)))-2,0,h-1),y1=clamp(Math.ceil(Math.max(...corners.map(p=>p.y)))+2,0,h-1);
  let changed=0;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const q=f.local(x,y);if(profile.sign*q.u<=0)continue;
   const r=Math.abs(q.u),shift=shiftAt(profile,r,q.v);if(Math.abs(shift)<.001)continue;
   const j=(y*w+x)*4,rgba=sample(original,w,h,f.world(profile.sign*(r-shift),q.v));trial.set(rgba,j);changed++;
  }
  // Re-measure the visible material boundary after rasterization. Reject a
  // move that increases error, makes a hole, or produces an unsafe fold.
  let before=0,after=0,checked=0,holes=0;
  for(const row of profile.rows){
   if(row.v-profile.root<profile.fade||profile.end-row.v<profile.fade)continue;
   const wanted=row.target,scan=input=>{for(let r=wanted-f.eye*.13;r<=wanted+f.eye*.13;r+=.5){const p=pixel(input,w,h,f.world(profile.sign*r,row.v));if(p&&p[3]>=96&&(p[0]+p[1]+p[2])/3<skin.luma*.65)return r}return null};
   const prior=scan(original),now=scan(trial);if(prior===null||now===null){holes++;continue}
   before+=Math.abs(prior-wanted);after+=Math.abs(now-wanted);checked++;
  }
  profile.side.before=checked?before/checked:profile.side.before;profile.side.after=checked?after/checked:null;
  if(!changed||checked<3||holes>0||after>=before-.1||after/checked>Math.max(1.25,Math.min(2.5,f.eye*.008))){profile.side.reason='postcheck-failed';continue}
  // Only this side's bounded patch is committed. The other side is independent.
  for(let y=y0;y<=y1;y++)out.set(trial.subarray((y*w+x0)*4,(y*w+x1+1)*4),(y*w+x0)*4);
  profile.side.adjusted=true;report.adjusted=true;
 }
 report.unavailable=report.sides.some(side=>side.reason&&side.reason!=='already-aligned');
 return {pixels:out,report};
}
