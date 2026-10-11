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
// Fit the FIRST placement at the ears, then softly erase its skin overlap.
// A separate lower-hair copy stays unshifted behind the unchanged portrait.
export function createTwoLayerHairPreview(placed,skin,face,w,h,makeCanvas,{singleLayer=false}={}){
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 const local=p=>({x:(p.x-a.x)*cos+(p.y-a.y)*sin,y:-(p.x-a.x)*sin+(p.y-a.y)*cos});
 const world=p=>({x:a.x+p.x*cos-p.y*sin,y:a.y+p.x*sin+p.y*cos});
 const landmark=i=>local({x:face[i].x*w,y:face[i].y*h});
 if(!skin||![127,356,152].every(i=>face[i]))throw Error('ตรวจกรอบหูและคอไม่สำเร็จ');
 const top=Math.min(landmark(127).y,landmark(356).y)-a.eye*.25,chin=landmark(152).y,bottom=chin+a.eye*1.15;
 const soft=Math.max(2,Math.min(12,a.eye*.035)),margin=Math.max(2,a.eye*.025);
 const expanded=makeCanvas(w,h),ec=expanded.getContext('2d');ec.drawImage(skin,0,0,w,h);
 for(let i=0;i<8;i++){const angle=i*Math.PI/4;ec.drawImage(skin,Math.cos(angle)*margin,Math.sin(angle)*margin,w,h)}
 const eraser=makeCanvas(w,h),ex=eraser.getContext('2d');ex.filter=`blur(${soft}px)`;ex.drawImage(expanded,0,0);
 const ed=ex.getImageData(0,0,w,h).data,sd=skin.getContext('2d').getImageData(0,0,w,h).data;
 const pd=placed.getContext('2d').getImageData(0,0,w,h).data;
 const read=(data,x,y)=>{const q=world({x,y}),px=Math.round(q.x),py=Math.round(q.y);return px<0||px>=w||py<0||py>=h?0:data[(py*w+px)*4+3]};
 const front=makeCanvas(w,h),fx=front.getContext('2d'),fd=fx.createImageData(w,h);
 const back=singleLayer?null:makeCanvas(w,h),bx=back?.getContext('2d'),bd=bx?.createImageData(w,h);
 const step=Math.max(1,a.eye*.01),profiles={};
 for(const sign of [-1,1]){
  const ear=landmark(sign<0?127:356),rows=[];
  for(let k=0;k<=64;k++){
   const y=ear.y-a.eye*.25+k/64*a.eye*1.1;let skinEdge=0,inner=null,outer=0;
   for(let r=0;r<=a.width*.5+a.eye*.25;r+=step)if(read(sd,sign*r,y)>160)skinEdge=r;
   for(let r=Math.max(a.width*.25,skinEdge-a.eye*.1);r<=a.width*.5+a.eye*1.2;r+=step){if(read(pd,sign*r,y)>100){if(inner===null)inner=r;outer=r}}
   // A transparent row stays transparent: no borrowing, patching or filling.
   rows.push({inner,outer,push:inner===null?0:Math.min(a.eye*.3,Math.max(0,inner-skinEdge)+a.eye*.2)});
  }
  profiles[sign]={ear,rows};
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4,q=local({x,y}),sign=q.x<0?-1:1,{ear,rows}=profiles[sign];
  const dy=Math.abs(q.y-(ear.y+a.eye*.3))/a.eye;
  const t=clamp((dy-.15)/.5,0,1),vertical=1-t*t*(3-2*t);
  const st=clamp((Math.abs(q.x)-a.width*.25)/(a.width*.15),0,1),side=st*st*(3-2*st);
  const weight=vertical*side,rowAt=clamp((q.y-(ear.y-a.eye*.25))/(a.eye*1.1)*64,0,64),row=rows[Math.round(rowAt)];
  let sourceR=Math.abs(q.x),sampleY=q.y;
  if(weight>0&&row.inner!==null&&sourceR<row.outer){
   const push=Math.min(row.push*weight,Math.max(0,row.inner-step));
   const moved=r=>r<=row.inner?r*(row.inner-push)/Math.max(step,row.inner):r-push*clamp((row.outer-r)/Math.max(step,row.outer-row.inner),0,1);
   let lo=sourceR,hi=Math.min(row.outer,sourceR+push);for(let k=0;k<10;k++){const mid=(lo+hi)/2;if(moved(mid)<sourceR)lo=mid;else hi=mid}sourceR=(lo+hi)/2;
   sampleY+=a.eye*.2*weight;
  }
  if(weight===0||row.inner===null){for(let k=0;k<4;k++)fd.data[j+k]=pd[j+k]}
  else{
   const p=world({x:sign*sourceR,y:sampleY}),ix=Math.floor(p.x),iy=Math.floor(p.y),dx=p.x-ix,fy=p.y-iy;
   let alpha=0,r=0,g=0,b=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
    const ax=ix+xx,ay=iy+yy;if(ax<0||ax>=w||ay<0||ay>=h)continue;
    const at=(ay*w+ax)*4,part=pd[at+3]*(xx?dx:1-dx)*(yy?fy:1-fy);alpha+=part;r+=pd[at]*part;g+=pd[at+1]*part;b+=pd[at+2]*part;
   }
   fd.data[j]=alpha?r/alpha:0;fd.data[j+1]=alpha?g/alpha:0;fd.data[j+2]=alpha?b/alpha:0;fd.data[j+3]=alpha;
  }
  // Soft eraser operates on the first placement after its local ear fit.
  const earTop=ear.y-a.eye*.3,start=clamp((q.y-earTop)/(a.eye*.3),0,1),end=clamp((bottom-q.y)/(a.eye*.18),0,1),below=clamp((q.y-a.eye*.05)/(a.eye*.25),0,1);
  const gate=start*start*(3-2*start)*end*Math.max(side,below);
  fd.data[j+3]=Math.round(fd.data[j+3]*(1-ed[j+3]/255*gate));
  if(bd){
   // Second placement stays at its original coordinates. No push, row
   // borrowing or opaque sample filling is applied to the rear copy.
   const lower=clamp((q.y-(top-a.eye*.25))/(a.eye*.2),0,1);
   for(let k=0;k<3;k++)bd.data[j+k]=pd[j+k];bd.data[j+3]=Math.round(pd[j+3]*lower);
  }
 }
 fx.putImageData(fd,0,0);if(bd)bx.putImageData(bd,0,0);
 return {front,back,gapAdjusted:true};
}
// Erase only segmented original hair. Portrait RGB and visible skin stay intact;
// hiding/deleting the linked hairstyle restores the original portrait.
export function createOriginalHairEraseMask(hair,skin,face,w,h,makeCanvas){
 if(!hair||!skin)throw Error('ตรวจผมเดิมไม่สำเร็จ · เก็บภาพเดิมไว้');
 const a=anchors(face,w,h),blur=makeCanvas(w,h),bc=blur.getContext('2d');bc.filter=`blur(${Math.max(.5,Math.min(2,a.eye*.008))}px)`;bc.drawImage(hair,0,0,w,h);
 const hd=blur.getContext('2d').getImageData(0,0,w,h).data,original=hair.getContext('2d').getImageData(0,0,w,h).data,sd=skin.getContext('2d').getImageData(0,0,w,h).data;
 const out=makeCanvas(w,h),ctx=out.getContext('2d'),d=ctx.createImageData(w,h);
 for(let i=0;i<w*h;i++){const j=i*4;d.data[j]=d.data[j+1]=d.data[j+2]=255;d.data[j+3]=Math.round(255-Math.max(hd[j+3],original[j+3])*(1-sd[j+3]/255))}
 ctx.putImageData(d,0,0);return out;
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
