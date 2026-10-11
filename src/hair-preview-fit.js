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
export function createHairPreviewMesh(from,fw,fh,to,tw,th,bounds,{cols=18,rows=18,sourceToReference=null,earFit=false}={}){
 const m=hairPreviewTransform(from,fw,fh,to,tw,th),f=anchors(from,fw,fh),t=anchors(to,tw,th);
 const calibration=sourceToReference?Object.fromEntries(['a','b','c','d','e','f'].map((k,i)=>[k,sourceToReference[i]])):null;
 if(calibration&&(!Object.values(calibration).every(Number.isFinite)||calibration.a*calibration.d-calibration.b*calibration.c<=0))throw Error('จุดยึด PNG ผมไม่ถูกต้อง');
 const referencePoint=p=>calibration?apply(calibration,p):p;
 const basePoint=p=>apply(m,referencePoint(p));
 if(!bounds||![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite)||bounds.w<=0||bounds.h<=0)throw Error('ขอบเขต PNG ผมไม่ถูกต้อง');
 const ids=[10,109,67,103,54,21,162,127,338,297,332,284,251,389,356];
 const earIds=[234,454,132,361];
 const controls=(earFit?[...ids,...earIds]:ids).flatMap(id=>{
  if(!from[id]||!to[id])return [];
  const source={x:from[id].x*fw,y:from[id].y*fh},target={x:to[id].x*tw,y:to[id].y*th},base=apply(m,source);
  if(![source.x,source.y,target.x,target.y].every(Number.isFinite))return [];
  let dx=target.x-base.x,dy=target.y-base.y;
  const distance=Math.hypot(dx,dy),limit=t.eye*(earFit&&[127,356,...earIds].includes(id)?.25:id===10?.10:.12);
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
// Bake the soft eraser into the front PNG and warp a separate lower-hair copy
// behind the unchanged portrait. No automatic layer/base masks are returned.
export function createTwoLayerHairPreview(placed,skin,face,w,h,makeCanvas,{singleLayer=false}={}){
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 const local=p=>({x:(p.x-a.x)*cos+(p.y-a.y)*sin,y:-(p.x-a.x)*sin+(p.y-a.y)*cos});
 const world=p=>({x:a.x+p.x*cos-p.y*sin,y:a.y+p.x*sin+p.y*cos});
 const landmark=i=>local({x:face[i].x*w,y:face[i].y*h});
 if(!skin||![127,356,152].every(i=>face[i]))throw Error('ตรวจกรอบหูและคอไม่สำเร็จ');
 const top=Math.min(landmark(127).y,landmark(356).y)-a.eye*.25;
 const chin=landmark(152).y,bottom=chin+a.eye*1.15,soft=Math.max(2,Math.min(12,a.eye*.035));
 const blurred=makeCanvas(w,h),bc=blurred.getContext('2d');bc.filter=`blur(${soft}px)`;bc.drawImage(skin,0,0,w,h);
 const sd=bc.getImageData(0,0,w,h).data;
 // Soft eraser extends slightly outside the skin contour; the rear hair
 // supplies the overlap instead of leaving a hard cut exactly at the ear.
 const expanded=makeCanvas(w,h),ec=expanded.getContext('2d'),margin=Math.max(2,a.eye*.025);
 ec.drawImage(skin,0,0,w,h);
 for(let i=0;i<8;i++){const angle=i*Math.PI/4;ec.drawImage(skin,Math.cos(angle)*margin,Math.sin(angle)*margin,w,h)}
 const eraser=makeCanvas(w,h),ex=eraser.getContext('2d');ex.filter=`blur(${soft}px)`;ex.drawImage(expanded,0,0);const ed=ex.getImageData(0,0,w,h).data;
 const front=makeCanvas(w,h),fx=front.getContext('2d');fx.drawImage(placed,0,0);
 const fd=fx.getImageData(0,0,w,h),lower=makeCanvas(w,h),lx=lower.getContext('2d'),ld=lx.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!fd.data[j+3])continue;
  const q=local({x,y}),earTop=(q.x<0?landmark(127).y:landmark(356).y)-a.eye*.3,
  start=clamp((q.y-earTop)/(a.eye*.3),0,1),end=clamp((bottom-q.y)/(a.eye*.18),0,1),
  side=clamp((Math.abs(q.x)-a.width*.22)/(a.width*.12),0,1),
  below=clamp((q.y-a.eye*.05)/(a.eye*.25),0,1),gate=(start*start*(3-2*start))*end*Math.max(side,below);
  // Restrict soft erasure to actual visible skin below the ear roots.
  fd.data[j+3]=Math.round(fd.data[j+3]*(1-ed[j+3]/255*gate));
 }
 fx.putImageData(fd,0,0);
 // The rear copy contains only the lower sections, with a soft ear-level join.
 const pd=placed.getContext('2d').getImageData(0,0,w,h).data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!pd[j+3])continue;
  const q=local({x,y}),gate=clamp((q.y-(top-a.eye*.25))/(a.eye*.2),0,1);
  ld.data[j]=pd[j];ld.data[j+1]=pd[j+1];ld.data[j+2]=pd[j+2];ld.data[j+3]=Math.round(pd[j+3]*gate);
 }
 lx.putImageData(ld,0,0);
 // Measure the actual inner hair edge against visible skin on each side.
 // A fixed percentage cannot close a reference PNG's ear-shaped opening.
 const alphaAt=(data,x,y)=>{
  const p=world({x,y}),px=Math.round(p.x),py=Math.round(p.y);
  return px<0||px>=w||py<0||py>=h?0:data[(py*w+px)*4+3];
 };
 const count=128,profiles={left:[],right:[]},step=Math.max(1,a.eye*.01),limit=a.width*.5+a.eye*1.2;
 for(const [name,sign] of [['left',-1],['right',1]]){
  for(let i=0;i<=count;i++){
   const y=top+(bottom-top)*i/count;let skinEdge=0,hairEdge=null,outerEdge=0;
   const skinLimit=y>chin?a.eye*.8:a.width*.5+a.eye*.25;
   for(let r=0;r<=skinLimit;r+=step)if(alphaAt(sd,sign*r,y)>160)skinEdge=r;
   if(skinEdge>step*3)for(let r=Math.max(0,skinEdge-a.eye*.1);r<=limit;r+=step){
    if(alphaAt(pd,sign*r,y)>100&&alphaAt(pd,sign*(r+step),y)>100){hairEdge=r;break}
   }
   if(hairEdge!==null)for(let r=hairEdge;r<=limit;r+=step)if(alphaAt(pd,sign*r,y)>100)outerEdge=r;
   const gap=hairEdge===null?0:Math.max(0,hairEdge-skinEdge);
   profiles[name].push({push:gap>step?Math.min(Math.max(0,(hairEdge||0)-a.eye*.1),gap+a.eye*.18):0,inner:hairEdge||a.eye,outer:Math.max(outerEdge,(hairEdge||a.eye)+step),skinEdge,sourceY:y,missing:hairEdge===null});
  }
  const raw=profiles[name];
  // Some short styles have a completely open ear row. Borrow only a nearby
  // side-hair row within the ear band, rather than leaving that row empty.
  for(let i=0;i<=count;i++){
   const row=raw[i];if(!row.missing||row.skinEdge<=step*3||row.sourceY>chin)continue;
   let nearest=null;
   for(let d=1;d<=Math.ceil(a.eye*.4/(bottom-top)*count)&&!nearest;d++)for(const j of [i-d,i+d]){
    if(j>=0&&j<=count&&!raw[j].missing&&raw[j].outer>row.skinEdge+step&&[-step,0,step].every(dy=>alphaAt(pd,sign*(raw[j].inner+step*3),raw[j].sourceY+dy)>220)){nearest=raw[j];break}
   }
   if(nearest){row.inner=nearest.inner;row.outer=nearest.outer;row.sourceY=nearest.sourceY;row.push=Math.min(Math.max(0,row.inner-a.eye*.1),Math.max(0,row.inner-row.skinEdge)+a.eye*.18)}
  }
  profiles[name]=raw.map((_,i)=>{
   let sum=0,weight=0;for(let k=-2;k<=2;k++){const j=clamp(i+k,0,count),v=3-Math.abs(k);sum+=raw[j].push*v;weight+=v}return {...raw[i],push:Math.max(raw[i].push,sum/weight)};
  });
 }
 const measuredPush=(sign,y)=>{
  const pos=clamp((y-top)/(bottom-top)*count,0,count),i=Math.floor(pos),t=pos-i,p=profiles[sign<0?'left':'right'];
  const next=p[Math.min(count,i+1)];return {push:p[i].push*(1-t)+next.push*t,inner:p[i].inner*(1-t)+next.inner*t,outer:p[i].outer*(1-t)+next.outer*t,sourceY:(t<.5?p[i]:next).sourceY,borrowed:p[i].missing||next.missing};
 };
 // Inverse pixel warp avoids thousands of full-image triangle draws for the rear copy.
 // Every local row is monotonic: outer silhouette pinned, inner edge stretched inward.
 const back=makeCanvas(w,h),backCtx=back.getContext('2d'),bd=backCtx.createImageData(w,h);
 const movedDistance=(r,push,measured)=>{
  // Piecewise monotonic mapping pins the outer silhouette and moves the
  // actual inner edge fully underneath the unchanged ear/face contour.
  if(r<=measured.inner)return r*(measured.inner-push)/Math.max(step,measured.inner);
  return r-push*clamp((measured.outer-r)/Math.max(step,measured.outer-measured.inner),0,1);
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=local({x,y}),sign=q.x<0?-1:1;
  if(q.y<top||q.y>bottom+a.eye*.3)continue;
  // Additional local ear adjustment requested: 20% of eye spacing upward
  // and 20% inward, tapering to zero away from each ear. Inverse sampling
  // reads lower hair to lift it; portrait pixels are never part of this warp.
  const ear=landmark(sign<0?127:356),earY=ear.y+a.eye*.35;
  const vertical=Math.abs(q.y-earY)/a.eye;
  const earWeight=vertical<=.2?1:1-clamp((vertical-.2)/.6,0,1)**2*(3-2*clamp((vertical-.2)/.6,0,1));
  const sampleY=q.y+a.eye*.2*earWeight;
  const measured=measuredPush(sign,sampleY),fade=clamp((bottom+a.eye*.3-q.y)/(a.eye*.3),0,1),
  push=Math.min(Math.max(0,measured.inner-a.eye*.1),measured.push+a.eye*.2*earWeight)*fade;
  const r=Math.abs(q.x);let sourceR=r;
  if(push>0&&r<measured.outer){let low=r,high=Math.min(measured.outer,r+push);for(let i=0;i<9;i++){const middle=(low+high)/2;if(movedDistance(middle,push,measured)<r)low=middle;else high=middle}sourceR=(low+high)/2}
  const borrowWeight=measured.borrowed&&measured.push>0&&r<measured.outer?1:0;
  const point=world({x:sign*sourceR,y:sampleY+(measured.sourceY-sampleY)*borrowWeight}),px=Math.floor(point.x),py=Math.floor(point.y),dx=point.x-px,dy=point.y-py;
  let alpha=0,red=0,green=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const sx=px+xx,sy=py+yy;if(sx<0||sx>=w||sy<0||sy>=h)continue;
   const j=(sy*w+sx)*4,weight=(xx?dx:1-dx)*(yy?dy:1-dy),part=ld.data[j+3]*weight;
   alpha+=part;red+=ld.data[j]*part;green+=ld.data[j+1]*part;blue+=ld.data[j+2]*part;
  }
  // Raster holes at a short style's ear opening can survive row fitting.
  // Fill only the inward-stretched overlap with a nearby opaque hair sample.
  if(alpha<220&&push>0&&r>=measured.inner-push&&r<measured.inner&&q.y<chin){
   for(let distance=step;distance<=a.eye*.4&&alpha<220;distance+=step){
    for(const direction of [-1,1]){
     const sy=sampleY+distance*direction;
     if(![-step,0,step].every(dy=>alphaAt(pd,sign*sourceR,sy+dy)>235))continue;
     const p=world({x:sign*sourceR,y:sy}),ax=Math.round(p.x),ay=Math.round(p.y);
     if(ax<0||ax>=w||ay<0||ay>=h)continue;
     const at=(ay*w+ax)*4;alpha=pd[at+3];red=pd[at]*alpha;green=pd[at+1]*alpha;blue=pd[at+2]*alpha;break;
    }
   }
  }
  const j=(y*w+x)*4;if(alpha>0){bd.data[j]=Math.round(red/alpha);bd.data[j+1]=Math.round(green/alpha);bd.data[j+2]=Math.round(blue/alpha);bd.data[j+3]=Math.round(alpha)}
 }
 backCtx.putImageData(bd,0,0);
 if(singleLayer){
  // Short cuts use ONE editable PNG. Bake only the local ear warp into it;
  // do not place a second lower-hair copy behind the portrait.
  const merged=makeCanvas(w,h),mx=merged.getContext('2d'),result=mx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const j=(y*w+x)*4,q=local({x,y}),ear=landmark(q.x<0?127:356);
   const dy=Math.abs(q.y-(ear.y+a.eye*.35))/a.eye;
   const v=clamp((dy-.2)/.6,0,1),vertical=1-v*v*(3-2*v);
   const side=clamp((Math.abs(q.x)-a.width*.22)/(a.width*.12),0,1),weight=vertical*side;
   const originalAlpha=pd[j+3]/255,warpedAlpha=bd.data[j+3]/255;
   // Keep untouched hair where no local ear sample exists. Warp and fill the
   // inner edge only; leave crown, fringe and outer style silhouette intact.
   const replacement=warpedAlpha>0?weight:0;
   const alpha=originalAlpha*(1-replacement)+Math.max(originalAlpha,warpedAlpha)*replacement;
   const earTop=ear.y-a.eye*.3,start=clamp((q.y-earTop)/(a.eye*.3),0,1),end=clamp((bottom-q.y)/(a.eye*.18),0,1),below=clamp((q.y-a.eye*.05)/(a.eye*.25),0,1);
   const erase=(start*start*(3-2*start))*end*Math.max(side,below)*ed[j+3]/255;
   for(let k=0;k<3;k++)result.data[j+k]=pd[j+k]*(1-replacement)+bd.data[j+k]*replacement;
   result.data[j+3]=Math.round(alpha*(1-erase)*255);
  }
  mx.putImageData(result,0,0);return {front:merged,back:null,gapAdjusted:profiles.left.some(v=>v.push>0)||profiles.right.some(v=>v.push>0)};
 }
 return {front,back,gapAdjusted:profiles.left.some(v=>v.push>0)||profiles.right.some(v=>v.push>0)};
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
