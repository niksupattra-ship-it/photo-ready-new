import {softHairEraser} from './soft-hair-eraser.js';
import {fillLongHairGaps} from './long-hair-gap-fill.js';
import {eraseLongUpperFront} from './long-upper-hair-eraser.js';
// Local fitting changes hair coordinates only; it never changes face pixels.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function anchors(face,w,h){
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||[33,263,234,454,10,152].some(i=>!face?.[i]||![face[i].x,face[i].y].every(Number.isFinite)))throw Error('ไม่พบจุดใบหน้าครบสำหรับวางผม');
 const p=i=>({x:face[i].x*w,y:face[i].y*h}),left=p(33),right=p(263),l=p(234),r=p(454);
 const angle=Math.atan2(right.y-left.y,right.x-left.x),eye=Math.hypot(right.x-left.x,right.y-left.y);
 const width=Math.abs((r.x-l.x)*Math.cos(angle)+(r.y-l.y)*Math.sin(angle)),forehead=p(10),chin=p(152);
 const height=-(chin.x-forehead.x)*Math.sin(angle)+(chin.y-forehead.y)*Math.cos(angle);
 if(![angle,eye,width,height].every(Number.isFinite)||eye<5||width<eye||height<eye)throw Error('ตำแหน่งใบหน้าไม่ชัดพอสำหรับวางผม');
 return {x:(left.x+right.x)/2,y:(left.y+right.y)/2,angle,eye,width,height};
}
export function hairPreviewTransform(from,fw,fh,to,tw,th){
 const f=anchors(from,fw,fh),t=anchors(to,tw,th);
 // Fit the upper face as one rigid similarity transform. The forehead and
 // both temples participate; a narrow face must never squeeze the PNG.
 // Keep rotation on the eye axis so asymmetric cheeks cannot tilt the rear.
 const local=(face,w,h,frame,id)=>{
  const p=face[id];if(!p||![p.x,p.y].every(Number.isFinite))throw Error('ไม่พบจุดขมับสำหรับวางผม');
  const dx=p.x*w-frame.x,dy=p.y*h-frame.y,c=Math.cos(frame.angle),s=Math.sin(frame.angle);
  return {x:dx*c+dy*s,y:-dx*s+dy*c};
 };
 const points=[[33,1.5],[263,1.5],[10,4],[127,1],[356,1],[234,.25],[454,.25]].map(([id,weight])=>({id,weight,f:local(from,fw,fh,f,id),t:local(to,tw,th,t,id)}));
 for(const p of points.filter(p=>p.id===127||p.id===356)){
  if([['f',f],['t',t]].some(([key,frame])=>Math.abs(p[key].x)>frame.eye*1.5||Math.abs(p[key].y)>frame.eye))throw Error('ตำแหน่งขมับไม่ชัดพอ · เก็บภาพเดิมไว้');
 }
 const weight=points.reduce((sum,p)=>sum+p.weight,0);
 const center=key=>({x:points.reduce((sum,p)=>sum+p[key].x*p.weight,0)/weight,y:points.reduce((sum,p)=>sum+p[key].y*p.weight,0)/weight});
 const fc=center('f'),tc=center('t');let covariance=0,variance=0;
 for(const p of points){const fx=p.f.x-fc.x,fy=p.f.y-fc.y;covariance+=p.weight*(fx*(p.t.x-tc.x)+fy*(p.t.y-tc.y));variance+=p.weight*(fx*fx+fy*fy)}
 const eyeScale=t.eye/f.eye,scale=clamp(covariance/variance,eyeScale*.9,eyeScale*1.12);
 const angle=t.angle-f.angle,a=scale*Math.cos(angle),b=scale*Math.sin(angle),c=-b,d=a;
 const dx=tc.x-scale*fc.x,dy=tc.y-scale*fc.y,ct=Math.cos(t.angle),st=Math.sin(t.angle);
 return {a,b,c,d,e:t.x+dx*ct-dy*st-a*f.x-c*f.y,f:t.y+dx*st+dy*ct-b*f.x-d*f.y};
}
const apply=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
const area=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function createHairPreviewMesh(from,fw,fh,to,tw,th,bounds,{cols=18,rows=18,sourceToReference=null}={}){
 const m=hairPreviewTransform(from,fw,fh,to,tw,th),f=anchors(from,fw,fh),t=anchors(to,tw,th);
 const calibration=sourceToReference?Object.fromEntries(['a','b','c','d','e','f'].map((k,i)=>[k,sourceToReference[i]])):null;
 if(calibration&&(!Object.values(calibration).every(Number.isFinite)||calibration.a*calibration.d-calibration.b*calibration.c<=0))throw Error('จุดยึด PNG ผมไม่ถูกต้อง');
 const referencePoint=p=>calibration?apply(calibration,p):p;
 const basePoint=p=>apply(m,referencePoint(p));
 if(!bounds||![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite)||bounds.w<=0||bounds.h<=0)throw Error('ขอบเขต PNG ผมไม่ถูกต้อง');
 const ids=[10,109,67,103,54,21,162,127,338,297,332,284,251,389,356];
 const controls=ids.flatMap(id=>{
  if(!from[id]||!to[id])return [];
  const source={x:from[id].x*fw,y:from[id].y*fh},target={x:to[id].x*tw,y:to[id].y*th},base=apply(m,source);
  if(![source.x,source.y,target.x,target.y].every(Number.isFinite))return [];
  let dx=target.x-base.x,dy=target.y-base.y;
  const distance=Math.hypot(dx,dy),limit=t.eye*(id===10?.10:.12);
  if(distance>limit){dx*=limit/distance;dy*=limit/distance}
  return [{...source,dx,dy}];
 });
 const localY=p=>-(p.x-f.x)*Math.sin(f.angle)+(p.y-f.y)*Math.cos(f.angle);
 const forehead=from[10]?localY({x:from[10].x*fw,y:from[10].y*fh}):-f.eye*.7;
 const vertices=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
  const source={x:bounds.x+bounds.w*x/cols,y:bounds.y+bounds.h*y/rows},base=basePoint(source),ref=referencePoint(source);
  let dx=0,dy=0,weight=.4;
  for(const p of controls){const w=Math.exp(-((ref.x-p.x)**2+(ref.y-p.y)**2)/(2*(f.eye*.55)**2));dx+=w*p.dx;dy+=w*p.dy;weight+=w}
  // Pin the crown and long ends; flex only the roots and temples like Puppet Warp.
  const ly=localY(ref),fade=(y===0?0:1)*clamp((ly-(forehead-f.eye*.75))/(f.eye*.75),0,1)*clamp((f.eye*.8-ly)/(f.eye*.5),0,1);
  vertices.push({source,target:{x:base.x+dx/weight*fade,y:base.y+dy/weight*fade}});
 }
 const triangles=[];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;triangles.push([a,b,d],[a,d,c])}
 // Reduce local corrections if an unusually occluded face would fold the mesh.
 for(let attempt=0;attempt<5;attempt++){
  if(triangles.every(ids=>{const [a,b,c]=ids.map(i=>vertices[i]);return area(a.target,b.target,c.target)>area(basePoint(a.source),basePoint(b.source),basePoint(c.source))*.3}))break;
  for(const v of vertices){const base=basePoint(v.source);v.target={x:(v.target.x+base.x)/2,y:(v.target.y+base.y)/2}}
 }
 if(!triangles.every(ids=>area(...ids.map(i=>vertices[i].target))>0))throw Error('ปรับตาข่ายผมไม่สำเร็จ · เก็บภาพเดิมไว้');
 return {vertices,triangles,bounds,matrix:m,directSource:Boolean(calibration)};
}
export function renderHairPreviewMesh(ctx,image,sourceBounds,mesh){
 // Rasterize the inverse mapping once per pixel. Triangle clip antialiasing
 // otherwise leaves visible grid lines in fine, semi-transparent hair.
 const w=ctx.canvas.width,h=ctx.canvas.height;
 const sample=documentCanvas(image.width,image.height),sc=sample.getContext('2d');sc.drawImage(image,0,0);
 const pixels=sc.getImageData(0,0,sample.width,sample.height).data,out=ctx.getImageData(0,0,w,h),written=new Uint8Array(w*h);
 const sx=mesh.bounds.w/sourceBounds.w,sy=mesh.bounds.h/sourceBounds.h;
 for(const ids of mesh.triangles){
  const v=ids.map(i=>mesh.vertices[i]),[a,b,c]=v.map(p=>p.target),det=area(a,b,c);
  const src=v.map(p=>mesh.directSource?p.source:{x:sourceBounds.x+(p.source.x-mesh.bounds.x)/sx,y:sourceBounds.y+(p.source.y-mesh.bounds.y)/sy});
  const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),x1=Math.min(w-1,Math.ceil(Math.max(a.x,b.x,c.x)));
  const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),y1=Math.min(h-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const at=y*w+x;if(written[at])continue;
   const p={x:x+.5,y:y+.5},u=area(p,b,c)/det,t=area(a,p,c)/det,z=1-u-t;
   if(u<-.00001||t<-.00001||z<-.00001)continue;written[at]=1;
   const px=u*src[0].x+t*src[1].x+z*src[2].x-.5,py=u*src[0].y+t*src[1].y+z*src[2].y-.5;
   const ix=Math.floor(px),iy=Math.floor(py),dx=px-ix,dy=py-iy;let alpha=0,r=0,g=0,bv=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
    const ax=ix+xx,ay=iy+yy;if(ax<0||ax>=sample.width||ay<0||ay>=sample.height)continue;
    const j=(ay*sample.width+ax)*4,part=pixels[j+3]*(xx?dx:1-dx)*(yy?dy:1-dy);
    alpha+=part;r+=pixels[j]*part;g+=pixels[j+1]*part;bv+=pixels[j+2]*part;
   }
   const j=at*4;out.data[j]=alpha?r/alpha:0;out.data[j+1]=alpha?g/alpha:0;out.data[j+2]=alpha?bv/alpha:0;out.data[j+3]=alpha;
  }
 }
 ctx.putImageData(out,0,0);
 function documentCanvas(width,height){
  // Reuse the destination canvas factory, including OffscreenCanvas/test canvases.
  if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=width;c.height=height;return c}
  return new ctx.canvas.constructor(width,height);
 }
}
// Check skin pixels at reference ear positions, not the whole PNG's skin.
// Assets retaining an ear keep their existing two-layer placement policy.
export function referenceContainsEarSkin(mask,face,w,h,sourceToReference){
 if(!mask||!face?.[127]||!face?.[356])return false;
 const anchor=anchors(face,w,h),[a,b,c,d,e,f]=sourceToReference,det=a*d-b*c;
 const data=mask.getContext('2d').getImageData(0,0,mask.width,mask.height).data;
 for(const [id,sign] of [[127,-1],[356,1]]){
  let hits=0;
  for(const dx of [.04,.1,.16,.22])for(const dy of [.12,.22,.32,.42]){
   const x=face[id].x*w+sign*anchor.eye*dx,y=face[id].y*h+anchor.eye*dy;
   const px=Math.round((d*(x-e)-c*(y-f))/det),py=Math.round((-b*(x-e)+a*(y-f))/det);
   if(px>=0&&px<mask.width&&py>=0&&py<mask.height&&data[(py*mask.width+px)*4+3]>180)hits++;
  }
  if(hits>=3)return true;
 }
 return false;
}
export const headPose=head=>({x:head.x||0,y:head.y||0,scale:head.scale||1,rotation:head.rotation||0});
// Refine only the male PNG's temple/upper-ear join before it becomes a layer.
// Skin is a positioning/protection guide; portrait pixels are never written.
export function fitMaleHairEarJoin(placed,skin,face,w,h,makeCanvas){
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 const local=(x,y)=>({x:(x-a.x)*cos+(y-a.y)*sin,y:-(x-a.x)*sin+(y-a.y)*cos});
 const world=(x,y)=>({x:a.x+x*cos-y*sin,y:a.y+x*sin+y*cos});
 if(!skin||!face[127]||!face[356])throw Error('ตรวจรอยต่อหูไม่สำเร็จ · เก็บภาพเดิมไว้');
 const pixels=placed.getContext('2d').getImageData(0,0,w,h).data,sd=skin.getContext('2d').getImageData(0,0,w,h).data;
 const softSkin=makeCanvas(w,h),sc=softSkin.getContext('2d');sc.filter=`blur(${Math.max(1,Math.min(5,a.eye*.018))}px)`;sc.drawImage(skin,0,0);
 const softSkinPixels=sc.getImageData(0,0,w,h).data;
 const alpha=(data,x,y)=>{const p=world(x,y),px=Math.round(p.x),py=Math.round(p.y);return px>=0&&px<w&&py>=0&&py<h?data[(py*w+px)*4+3]:0};
 const profiles=new Map(),count=48,step=Math.max(1,a.eye*.015);
 for(const sign of [-1,1]){
  const ear=local(face[sign<0?127:356].x*w,face[sign<0?127:356].y*h),top=ear.y-a.eye*.12,bottom=ear.y+a.eye*.9,rows=[];
  for(let i=0;i<=count;i++){
   const y=top+(bottom-top)*i/count;let edge=0,inner=null;
   for(let r=a.width*.34;r<=a.width*.72;r+=step){if(alpha(sd,sign*r,y)>128)edge=r;if(inner===null&&alpha(pixels,sign*r,y)>96)inner=r}
   const shift=edge&&inner!==null?clamp(edge-a.eye*.035-inner,-a.eye*.09,a.eye*.09):0;
   rows.push({y,edge,inner,shift});
  }
  for(const row of rows){
   row.sourceY=row.y;
   if(row.inner===null){let nearest=null;for(const candidate of rows)if(candidate.inner!==null&&Math.abs(candidate.y-row.y)<=a.eye*.10&&(!nearest||Math.abs(candidate.y-row.y)<Math.abs(nearest.y-row.y)))nearest=candidate;if(nearest)row.sourceY=nearest.y}
  }
  profiles.set(sign,{ear,top,bottom,rows});
 }
 const out=makeCanvas(w,h),ctx=out.getContext('2d'),result=ctx.createImageData(w,h);
 result.data.set(pixels);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=local(x,y),sign=q.x<0?-1:1,r=Math.abs(q.x),p=profiles.get(sign);
  if(q.y<p.top||q.y>p.bottom||r<a.width*.34||r>a.width*.8)continue;
  const index=clamp((q.y-p.top)/(p.bottom-p.top)*count,0,count),i=Math.floor(index),t=index-i,row=p.rows[i],next=p.rows[Math.min(count,i+1)];
  const edge=row.edge*(1-t)+next.edge*t;
  if(!edge)continue;
  const start=clamp((q.y-p.top)/(a.eye*.14),0,1),end=clamp((p.bottom-q.y)/(a.eye*.2),0,1);
  const vertical=start*start*(3-2*start)*end*end*(3-2*end);
  const radial=Math.exp(-(((r-edge)/(a.eye*.24))**2)),weight=vertical*radial;
  const shift=(row.shift*(1-t)+next.shift*t)*weight;
  // If the PNG opens just above an ear, stretch a nearby existing hair row.
  // Limit the displacement rather than inventing or duplicating hair.
  const sourceY=q.y+((row.sourceY-row.y)*(1-t)+(next.sourceY-next.y)*t)*weight;
  const point=world(sign*(r-shift),sourceY),px=Math.floor(point.x),py=Math.floor(point.y),dx=point.x-px,dy=point.y-py;
  let opacity=0,red=0,green=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const sx=px+xx,sy=py+yy;if(sx<0||sx>=w||sy<0||sy>=h)continue;
   const j=(sy*w+sx)*4,part=pixels[j+3]*(xx?dx:1-dx)*(yy?dy:1-dy);
   opacity+=part;red+=pixels[j]*part;green+=pixels[j+1]*part;blue+=pixels[j+2]*part;
  }
  const j=(y*w+x)*4;
  // Feather only the overlaid hair that crosses the exposed ear-side skin.
  // Retain the original crown, fringe and forehead hairline exactly.
  const side=clamp((r-a.width*.38)/(a.width*.07),0,1),erase=softSkinPixels[j+3]/255*vertical*side;
  result.data[j]=opacity?Math.round(red/opacity):0;result.data[j+1]=opacity?Math.round(green/opacity):0;result.data[j+2]=opacity?Math.round(blue/opacity):0;
  result.data[j+3]=Math.round(opacity*(1-erase));
 }
 ctx.putImageData(result,0,0);return out;
}
// Distance to the skin boundary measured INSIDE classified skin only. Unlike
// dilation/blur, this guide cannot erase hair outside the visible skin contour.
function skinInteriorDistance(pixels,w,h,cap){
 const distance=new Float32Array(w*h),diagonal=Math.SQRT2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>=128)distance[y*w+x]=Math.min(cap,x+1,y+1,w-x,h-y);
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
 return distance;
}
const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t)};

// Remove the template person's skin before placement, in calibrated reference
// coordinates. This changes alpha directly; it never stretches native hair RGB
// or keeps an automatic layer mask. Detection runs on the reference portrait.
export function eraseHairTemplateSkin(pixels,w,h,skin,face,rw,rh,sourceToReference,{softEdges=false}={}){
 if(pixels.length!==w*h*4||skin?.width!==rw||skin?.height!==rh||!Array.isArray(sourceToReference)||sourceToReference.length!==6||!sourceToReference.every(Number.isFinite))throw Error('จุดยึดผิวต้นแบบไม่ตรงกับ PNG');
 const [a,b,c,d,e,f]=sourceToReference,norm=a*a+b*b;
 if(norm<=0||a*d-b*c<=0||Math.abs(norm-c*c-d*d)>norm*1e-5||Math.abs(a*c+b*d)>norm*1e-5)throw Error('จุดยึดต้นแบบต้องรักษาสัดส่วนทรงผม');
 const ref=anchors(face,rw,rh),feather=Math.max(1,ref.eye*.02);
 const mask=skin.getContext('2d').getImageData(0,0,rw,rh).data;
 const distance=skinInteriorDistance(mask,rw,rh,feather),out=new Uint8ClampedArray(pixels),strength=softEdges?new Float32Array(w*h):null;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!softEdges&&!out[j+3])continue;
  const rx=a*(x+.5)+c*(y+.5)+e-.5,ry=b*(x+.5)+d*(y+.5)+f-.5;
  const nx=Math.round(rx),ny=Math.round(ry);
  if(nx<0||nx>=rw||ny<0||ny>=rh||mask[(ny*rw+nx)*4+3]<128)continue;
  const px=Math.floor(rx),py=Math.floor(ry),fx=rx-px,fy=ry-py;let depth=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const sx=px+xx,sy=py+yy;if(sx<0||sx>=rw||sy<0||sy>=rh)continue;
   depth+=distance[sy*rw+sx]*(xx?fx:1-fx)*(yy?fy:1-fy);
  }
  if(strength)strength[y*w+x]=smooth(depth/feather);
  else out[j+3]=Math.round(out[j+3]*(1-smooth(depth/feather)));
 }
 return strength?softHairEraser(pixels,w,h,strength,Math.max(1.25,Math.min(12,ref.eye*.018/Math.sqrt(norm)))):out;
}

// Translate existing rear strands into the inner ear/neck gaps only. Opaque
// hair, the outside silhouette and the crown remain in their original pixels.
// The reference hair guide prevents skin from the template becoming a donor.
function pushRearIntoGaps(back,skin,hairGuide,face,w,h){
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 if(hairGuide.width!==w||hairGuide.height!==h||!face[152])throw Error('ตรวจช่องว่างผมด้านหลังไม่สำเร็จ');
 const local=(x,y)=>({x:(x-a.x)*cos+(y-a.y)*sin,y:-(x-a.x)*sin+(y-a.y)*cos});
 const world=(u,v)=>({x:a.x+u*cos-v*sin,y:a.y+u*sin+v*cos});
 const at=(u,v)=>{const p=world(u,v),x=Math.round(p.x),y=Math.round(p.y);return x>=0&&x<w&&y>=0&&y<h?(y*w+x)*4:-1};
 const left=local(face[127].x*w,face[127].y*h),right=local(face[356].x*w,face[356].y*h),chin=local(face[152].x*w,face[152].y*h).y;
 const start=Math.min(left.y,right.y)-a.eye*.1,bottom=chin+a.eye*.9,count=Math.max(1,Math.ceil(bottom-start));
 const maxPush=a.eye*.4,overlap=Math.max(1,a.eye*.035),step=Math.max(1,a.eye*.012),feather=Math.max(1.5,Math.min(7,a.eye*.03));
 const bx=back.getContext('2d'),image=bx.getImageData(0,0,w,h),source=new Uint8ClampedArray(image.data);
 const sd=skin.getContext('2d').getImageData(0,0,w,h).data,guide=hairGuide.getContext('2d').getImageData(0,0,w,h).data;
 const profiles=new Map();
 for(const sign of [-1,1]){
  const rows=[];
  for(let i=0;i<=count;i++){
   const v=start+(bottom-start)*i/count;let edge=0,hair=null;
   for(let r=0;r<=a.width*.8;r+=step){const j=at(sign*r,v);if(j>=0&&sd[j+3]>=160)edge=r}
   if(edge)for(let r=Math.max(0,edge-overlap);r<=edge+maxPush;r+=step){const j=at(sign*r,v);if(j>=0&&guide[j+3]>=160&&source[j+3]>=192){hair=r;break}}
   rows.push({edge,hair,v,sourceV:v});
  }
  const raw=rows.map(row=>({...row})),maxLift=Math.ceil(a.eye*.28*count/(bottom-start));
  for(let i=0;i<=count;i++){
   const row=rows[i];if(!row.edge||row.hair!==null||row.v>chin)continue;
   // A genuinely open ear row can be covered by a nearby lower strand. Keep
   // this small, behind the portrait, and never resample the visible front.
   for(let d=1;d<=maxLift&&row.hair===null;d++)for(const k of [i+d,i-d]){
    const donor=raw[k];if(!donor||donor.hair===null||donor.hair<row.edge-overlap||donor.hair>row.edge+maxPush)continue;
    row.hair=donor.hair;row.sourceV=donor.v;break;
   }
  }
  profiles.set(sign,rows);
 }
 let adjusted=false;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(source[j+3]!==0)continue;
  const q=local(x,y);if(q.y<start||q.y>bottom)continue;
  const sign=q.x<0?-1:1,r=Math.abs(q.x),pos=clamp((q.y-start)/(bottom-start)*count,0,count),i=Math.round(pos),row=profiles.get(sign)[i];
  if(!row.edge||row.hair===null||r<row.edge-overlap-feather||r>row.hair+feather)continue;
  const push=clamp(row.hair-row.edge+overlap,0,maxPush);if(!push)continue;
  const sourceV=q.y+row.sourceV-row.v,point=world(sign*(r+push),sourceV),px=Math.floor(point.x),py=Math.floor(point.y),dx=point.x-px,dy=point.y-py;
  const guideAt=at(sign*(r+push),sourceV);if(guideAt<0||guide[guideAt+3]<128)continue;
  let alpha=0,red=0,green=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const sx=px+xx,sy=py+yy;if(sx<0||sx>=w||sy<0||sy>=h)continue;
   const k=(sy*w+sx)*4,part=source[k+3]*(xx?dx:1-dx)*(yy?dy:1-dy);
   alpha+=part;red+=source[k]*part;green+=source[k+1]*part;blue+=source[k+2]*part;
  }
  const band=smooth((q.y-start)/(a.eye*.15))*smooth((bottom-q.y)/(a.eye*.22));
  const radial=smooth((r-row.edge+overlap+feather)/feather),opacity=Math.round(alpha*band*radial);
  if(!opacity)continue;
  image.data[j]=Math.round(red/alpha);image.data[j+1]=Math.round(green/alpha);image.data[j+2]=Math.round(blue/alpha);image.data[j+3]=opacity;adjusted=true;
 }
 if(adjusted)bx.putImageData(image,0,0);
 return adjusted;
}

// Short styles use one working PNG with a feathered template-skin eraser.
// Inner portrait joins are covered with nearby skin below this one layer.
function createSingleHairPreview(placed,skin,face,w,h,makeCanvas,hairGuide){
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 const local=(x,y)=>({x:(x-a.x)*cos+(y-a.y)*sin,y:-(x-a.x)*sin+(y-a.y)*cos});
 const ears=[local(face[127].x*w,face[127].y*h),local(face[356].x*w,face[356].y*h)];
 const front=makeCanvas(w,h),fx=front.getContext('2d');fx.drawImage(placed,0,0);
 // Inner joins are covered by neighbouring portrait skin below this PNG.
 // Short styles must not stretch/copy hair into those joins.
 const gapAdjusted=false;
 const pixels=fx.getImageData(0,0,w,h),sd=skin.getContext('2d').getImageData(0,0,w,h).data;
 const feather=Math.max(2,Math.min(10,a.eye*.045)),distance=skinInteriorDistance(sd,w,h,feather),strength=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x;if(sd[n*4+3]<128)continue;
  const q=local(x,y),ear=ears[q.x<0?0:1];
  const side=smooth((Math.abs(q.x)-a.width*.30)/(a.width*.10));
  const earGate=smooth((q.y-ear.y+a.eye*.12)/(a.eye*.28)),below=smooth((q.y-a.eye*.40)/(a.eye*.20));
  strength[n]=smooth(distance[n]/feather)*Math.max(side*earGate,below);
 }
 pixels.data.set(softHairEraser(pixels.data,w,h,strength,Math.max(1.25,Math.min(6,a.eye*.018))));fx.putImageData(pixels,0,0);
 return {front,back:null,gapAdjusted};
}

// Both layers share exactly the placed PNG's coordinates and texture. The
// portrait itself occludes the rear; only confirmed skin can erase front alpha.
// Rear filling includes weak alpha inside the actual ear/neck joins.
export function createTwoLayerHairPreview(placed,skin,face,w,h,makeCanvas,{singleLayer=false,rearHairGuide=null,portrait=null}={}){
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 if(!skin||skin.width!==w||skin.height!==h||![127,356].every(i=>face[i]))throw Error('ตรวจกรอบหูและคอไม่สำเร็จ');
 if(singleLayer)return createSingleHairPreview(placed,skin,face,w,h,makeCanvas,rearHairGuide);
 const local=(x,y)=>({x:(x-a.x)*cos+(y-a.y)*sin,y:-(x-a.x)*sin+(y-a.y)*cos});
 const earLeft=local(face[127].x*w,face[127].y*h),earRight=local(face[356].x*w,face[356].y*h);
 const sd=skin.getContext('2d').getImageData(0,0,w,h).data,feather=Math.max(1.25,Math.min(6,a.eye*.025));
 const distance=skinInteriorDistance(sd,w,h,feather);
 const front=makeCanvas(w,h),fx=front.getContext('2d');fx.drawImage(placed,0,0);
 const pixels=fx.getImageData(0,0,w,h),original=new Uint8ClampedArray(pixels.data);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,j=n*4;if(!pixels.data[j+3]||sd[j+3]<128)continue;
  const q=local(x,y),ear=q.x<0?earLeft:earRight;
  // Retain the crown and central fringe, including bangs over the eyebrows.
  // Taper near each temple independently; the skin outline determines the
  // ear/neck contour. Nothing outside skin is cut at any horizontal level.
  const side=smooth((Math.abs(q.x)-a.width*.30)/(a.width*.10));
  const earGate=smooth((q.y-ear.y+a.eye*.12)/(a.eye*.28));
  const below=smooth((q.y-a.eye*.40)/(a.eye*.20));
  const erase=smooth(distance[n]/feather)*Math.max(side*earGate,below);
  pixels.data[j+3]=Math.round(pixels.data[j+3]*(1-erase));
 }
 const guard=portrait?makeCanvas(w,h):null;
 if(guard)guard.getContext('2d').drawImage(portrait,0,0,w,h);
 pixels.data.set(eraseLongUpperFront(pixels.data,original,sd,w,h,face,guard?guard.getContext('2d').getImageData(0,0,w,h).data:null));
 fx.putImageData(pixels,0,0);
 const back=singleLayer?null:makeCanvas(w,h);
 // Restore the full PNG behind the portrait. Its original alpha overlaps
 // the front, instead of being divided between the two layers. Both copies
 // still use the latest shared placement. Dense hair fills their inner joins.
 if(back)back.getContext('2d').drawImage(placed,0,0);
 const chin=local(face[152].x*w,face[152].y*h).y;
 const gapReport=rearHairGuide?fillLongHairGaps(back,skin,rearHairGuide,a,[earLeft,earRight],chin,w,h):null;
 return {front,back,gapAdjusted:Boolean(gapReport?.adjusted),gapReport};
}
// Erase the overlay over visible skin from the ear/temple level down to the neck.
// Keep it as a separate mask so Studio's restore brush can bring hair back.
export function createHairSkinEraseMask(skin,face,w,h,makeCanvas){
 const a=anchors(face,w,h),p=i=>({x:face[i].x*w,y:face[i].y*h});
 const cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 const localY=q=>-(q.x-a.x)*sin+(q.y-a.y)*cos;
 if(!face[127]||!face[356]||!face[152]||!skin)throw Error('ตรวจพื้นที่หูและคอไม่สำเร็จ · เก็บภาพเดิมไว้');
 const top=Math.min(localY(p(127)),localY(p(356)))-a.eye*.08;
 const bottom=localY(p(152))+a.eye*1.15,half=a.width*.5+a.eye*.35;
 if(![top,bottom,half].every(Number.isFinite)||bottom<=top)throw Error('พื้นที่ลบผมไม่ถูกต้อง');
 const world=(x,y)=>({x:a.x+x*cos-y*sin,y:a.y+x*sin+y*cos});
 const points=[world(-half,top),world(half,top),world(half,bottom),world(-half,bottom)];
 const mask=makeCanvas(w,h),ctx=mask.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
 ctx.save();ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
 for(const q of points.slice(1))ctx.lineTo(q.x,q.y);
 ctx.closePath();ctx.clip();ctx.globalCompositeOperation='destination-out';
 ctx.filter=`blur(${Math.max(.5,Math.min(2,a.eye*.004))}px)`;
 ctx.drawImage(skin,0,0,w,h);ctx.restore();
 return mask;
}
export function syncHairAttachments(layers){
 const heads=new Map(layers.filter(l=>!l.hairHeadId).map(l=>[l.id,l]));
 return layers.filter(l=>!l.hairHeadId||heads.has(l.hairHeadId)).map(l=>{
  if(!l.hairHeadId)return l;
  const p=headPose(heads.get(l.hairHeadId)),old=l.hairHeadPose;
  if(!old)return {...l,hairHeadPose:p};
  if(p.x===old.x&&p.y===old.y&&p.scale===old.scale&&p.rotation===old.rotation)return l;
  const ratio=p.scale/old.scale,angle=(p.rotation-old.rotation)*Math.PI/180;
  const dx=l.x-old.x,dy=l.y-old.y;
  return {...l,x:p.x+ratio*(dx*Math.cos(angle)-dy*Math.sin(angle)),y:p.y+ratio*(dx*Math.sin(angle)+dy*Math.cos(angle)),scale:l.scale*ratio,rotation:l.rotation+p.rotation-old.rotation,hairHeadPose:p};
 });
}
// Apply one shared transform delta to the two long-hair PNGs, without moving
// the portrait. Brush masks and pixel warps remain independent layer edits.
export function syncHairPairTransforms(layers,pending){
 const patches=new Map(pending),visited=new Set();
 for(const [id,patch] of pending){
  const lead=layers.find(l=>l.id===id);
  if(!lead?.hairLinked||!lead.hairHeadId||visited.has(lead.hairHeadId)||!['x','y','scale','rotation'].some(k=>patch[k]!==undefined))continue;
  const next={...lead,...patch},ratio=next.scale/lead.scale,angle=(next.rotation-lead.rotation)*Math.PI/180;
  for(const sibling of layers){
   if(sibling.id===id||!sibling.hairLinked||sibling.hairHeadId!==lead.hairHeadId||sibling.hairId!==lead.hairId)continue;
   const dx=sibling.x-lead.x,dy=sibling.y-lead.y;
   patches.set(sibling.id,{...patches.get(sibling.id),x:next.x+ratio*(dx*Math.cos(angle)-dy*Math.sin(angle)),y:next.y+ratio*(dx*Math.sin(angle)+dy*Math.cos(angle)),scale:sibling.scale*ratio,rotation:sibling.rotation+next.rotation-lead.rotation});
  }
  visited.add(lead.hairHeadId);
 }
 return layers.map(l=>patches.has(l.id)?{...l,...patches.get(l.id)}:l);
}

