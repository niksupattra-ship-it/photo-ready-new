// Local fitting changes hair coordinates only; it never changes face pixels.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function anchors(face,w,h){
 if(!face?.[454])throw Error('ไม่พบจุดใบหน้าครบสำหรับวางผม');
 const p=i=>({x:face[i].x*w,y:face[i].y*h}),left=p(33),right=p(263),l=p(234),r=p(454);
 const angle=Math.atan2(right.y-left.y,right.x-left.x),eye=Math.hypot(right.x-left.x,right.y-left.y);
 const width=Math.abs((r.x-l.x)*Math.cos(angle)+(r.y-l.y)*Math.sin(angle));
 if(![angle,eye,width].every(Number.isFinite)||eye<5||width<eye)throw Error('ตำแหน่งใบหน้าไม่ชัดพอสำหรับวางผม');
 return {x:(left.x+right.x)/2,y:(left.y+right.y)/2,angle,eye,width};
}
export function hairPreviewTransform(from,fw,fh,to,tw,th){
 const f=anchors(from,fw,fh),t=anchors(to,tw,th),eyeScale=t.eye/f.eye;
 // Adapt temple width modestly, retain the reference crown/length proportions.
 const sx=clamp(t.width/f.width,eyeScale*.88,eyeScale*1.12),sy=eyeScale;
 const cf=Math.cos(f.angle),sf=Math.sin(f.angle),ct=Math.cos(t.angle),st=Math.sin(t.angle);
 const a=ct*sx*cf+st*sy*sf,b=st*sx*cf-ct*sy*sf;
 const c=ct*sx*sf-st*sy*cf,d=st*sx*sf+ct*sy*cf;
 return {a,b,c,d,e:t.x-a*f.x-c*f.y,f:t.y-b*f.x-d*f.y};
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
 const sx=mesh.bounds.w/sourceBounds.w,sy=mesh.bounds.h/sourceBounds.h;
 for(const ids of mesh.triangles){
  const vertices=ids.map(i=>mesh.vertices[i]);
  const src=vertices.map(v=>mesh.directSource?v.source:({x:sourceBounds.x+(v.source.x-mesh.bounds.x)/sx,y:sourceBounds.y+(v.source.y-mesh.bounds.y)/sy}));
  const [p,q,r]=src,[a,b,c]=vertices.map(v=>v.target),det=area(p,q,r);
  const ux=q.x-p.x,uy=q.y-p.y,vx=r.x-p.x,vy=r.y-p.y;
  const ma=((b.x-a.x)*vy-(c.x-a.x)*uy)/det,mc=((c.x-a.x)*ux-(b.x-a.x)*vx)/det;
  const mb=((b.y-a.y)*vy-(c.y-a.y)*uy)/det,md=((c.y-a.y)*ux-(b.y-a.y)*vx)/det;
  // Tiny overlap prevents anti-aliased triangle clips leaving a visible grid.
  const la=Math.hypot(b.x-c.x,b.y-c.y),lb=Math.hypot(c.x-a.x,c.y-a.y),lc=Math.hypot(a.x-b.x,a.y-b.y),perimeter=la+lb+lc;
  const center={x:(la*a.x+lb*b.x+lc*c.x)/perimeter,y:(la*a.y+lb*b.y+lc*c.y)/perimeter};
  const radius=Math.abs(area(a,b,c))/perimeter,grow=1+1/Math.max(.001,radius);
  const expand=p=>({x:center.x+(p.x-center.x)*grow,y:center.y+(p.y-center.y)*grow});
  const clip=[a,b,c].map(expand);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.moveTo(clip[0].x,clip[0].y);ctx.lineTo(clip[1].x,clip[1].y);ctx.lineTo(clip[2].x,clip[2].y);ctx.closePath();ctx.clip();
  ctx.setTransform(ma,mb,mc,md,a.x-ma*p.x-mc*p.y,a.y-mb*p.x-md*p.y);
  ctx.globalCompositeOperation='copy'; // Overlap must not double the opacity of fine transparent root hairs.
  ctx.drawImage(image,sourceBounds.x,sourceBounds.y,sourceBounds.w,sourceBounds.h,sourceBounds.x,sourceBounds.y,sourceBounds.w,sourceBounds.h);ctx.restore();
 }
}
export const headPose=head=>({x:head.x||0,y:head.y||0,scale:head.scale||1,rotation:head.rotation||0});
// Bake the soft eraser into the front PNG and warp a separate lower-hair copy
// behind the unchanged portrait. No automatic layer/base masks are returned.
export function createTwoLayerHairPreview(placed,skin,face,w,h,makeCanvas){
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 const local=p=>({x:(p.x-a.x)*cos+(p.y-a.y)*sin,y:-(p.x-a.x)*sin+(p.y-a.y)*cos});
 const world=p=>({x:a.x+p.x*cos-p.y*sin,y:a.y+p.x*sin+p.y*cos});
 const landmark=i=>local({x:face[i].x*w,y:face[i].y*h});
 if(!skin||![127,356,152].every(i=>face[i]))throw Error('ตรวจกรอบหูและคอไม่สำเร็จ');
 const top=Math.min(landmark(127).y,landmark(356).y)-a.eye*.08;
 const chin=landmark(152).y,bottom=chin+a.eye*1.15,soft=Math.max(1,Math.min(3,a.eye*.008));
 const blurred=makeCanvas(w,h),bc=blurred.getContext('2d');bc.filter=`blur(${soft}px)`;bc.drawImage(skin,0,0,w,h);
 const sd=bc.getImageData(0,0,w,h).data;
 const front=makeCanvas(w,h),fx=front.getContext('2d');fx.drawImage(placed,0,0);
 const fd=fx.getImageData(0,0,w,h),lower=makeCanvas(w,h),lx=lower.getContext('2d'),ld=lx.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!fd.data[j+3])continue;
  const q=local({x,y}),start=clamp((q.y-top)/(soft*2),0,1),end=clamp((bottom-q.y)/(soft*2),0,1),gate=start*end;
  // Restrict soft erasure to actual visible skin below the ear roots.
  fd.data[j+3]=Math.round(fd.data[j+3]*(1-sd[j+3]/255*gate));
 }
 fx.putImageData(fd,0,0);
 // The rear copy contains only the lower sections, with a soft ear-level join.
 const pd=placed.getContext('2d').getImageData(0,0,w,h).data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!pd[j+3])continue;
  const q=local({x,y}),gate=clamp((q.y-top)/(a.eye*.18),0,1);
  ld.data[j]=pd[j];ld.data[j+1]=pd[j+1];ld.data[j+2]=pd[j+2];ld.data[j+3]=Math.round(pd[j+3]*gate);
 }
 lx.putImageData(ld,0,0);
 const contour=ids=>ids.flatMap(i=>face[i]?[landmark(i)]:[]).sort((p,q)=>p.y-q.y);
 const left=contour([127,234,132,58,172,136,150,149,176,148,152]);
 const right=contour([356,454,361,288,397,365,379,378,400,377,152]);
 const edge=(points,y,sign)=>{
  if(y>chin)return sign*a.eye*.42;
  for(let i=1;i<points.length;i++)if(y<=points[i].y){const p=points[i-1],q=points[i],t=clamp((y-p.y)/Math.max(.001,q.y-p.y),0,1);return p.x+(q.x-p.x)*t}
  return sign*a.eye*.42;
 };
 const cols=20,rows=24,vertices=[],triangles=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
  const source={x:w*x/cols,y:h*y/rows},q=local(source),sign=q.x<0?-1:1,boundary=edge(sign<0?left:right,q.y,sign);
  const fade=clamp((q.y-top)/(a.eye*.35),0,1)*clamp((bottom+a.eye*.3-q.y)/(a.eye*.3),0,1);
  const gap=Math.max(0,sign*(q.x-boundary)),push=Math.min(a.eye*.28,gap*.25)*fade;
  vertices.push({source,target:world({x:q.x-sign*push,y:q.y})});
 }
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*(cols+1)+x;triangles.push([i,i+1,i+cols+2],[i,i+cols+2,i+cols+1])}
 if(!triangles.every(ids=>area(...ids.map(i=>vertices[i].target))>0))throw Error('บิดผมด้านหลังไม่สำเร็จ · เก็บภาพเดิมไว้');
 const back=makeCanvas(w,h);renderHairPreviewMesh(back.getContext('2d'),lower,{x:0,y:0,w,h},{vertices,triangles,bounds:{x:0,y:0,w,h},directSource:true});
 return {front,back};
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
