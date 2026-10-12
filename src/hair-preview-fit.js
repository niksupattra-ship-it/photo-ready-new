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
 // Resize the entire PNG uniformly from eye spacing. The crown must keep
 // its proportions; width compression is a separate operation on the sides.
 const sx=t.eye/f.eye,sy=sx;
 const cf=Math.cos(f.angle),sf=Math.sin(f.angle),ct=Math.cos(t.angle),st=Math.sin(t.angle);
 const a=ct*sx*cf+st*sy*sf,b=st*sx*cf-ct*sy*sf;
 const c=ct*sx*sf-st*sy*cf,d=st*sx*sf+ct*sy*cf;
 return {a,b,c,d,e:t.x-a*f.x-c*f.y,f:t.y-b*f.x-d*f.y};
}
// Geometry for horizontal compression of the two side sections only.
// The eye-to-eye axis defines horizontal even when the portrait is tilted.
export function hairSideFit(from,fw,fh,to,tw,th){
 const f=anchors(from,fw,fh),t=anchors(to,tw,th),scale=t.eye/f.eye;
 const referenceHalf=f.width*scale/2,targetHalf=t.width/2,inner=Math.min(referenceHalf,targetHalf)*.4;
 const sideScale=Math.min(1,targetHalf/referenceHalf),sideSpan=targetHalf-inner;
 if(![127,356].every(i=>to?.[i]&&[to[i].x,to[i].y].every(Number.isFinite)))throw Error('ไม่พบจุดขมับสำหรับปรับผมด้านข้าง');
 const cos=Math.cos(t.angle),sin=Math.sin(t.angle);
 const localY=i=>-(to[i].x*tw-t.x)*sin+(to[i].y*th-t.y)*cos;
 return {x:t.x,y:t.y,cos,sin,inner,sideScale,sideSpan,start:Math.min(localY(127),localY(356)),transition:Math.max(2,t.eye*.3)};
}

export function compressHairSidePixels(pixels,w,h,fit){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==w*h*4)throw Error('ภาพ PNG ไม่พร้อมสำหรับบีบด้านข้าง');
 if(!fit||!['x','y','cos','sin','inner','sideScale','sideSpan','start','transition'].every(k=>Number.isFinite(fit[k]))||fit.sideScale<=0||fit.sideScale>1||fit.inner<0||fit.sideSpan<=0||fit.transition<=0)throw Error('ตำแหน่งบีบผมด้านข้างไม่ถูกต้อง');
 const out=new Uint8ClampedArray(pixels);if(fit.sideScale===1)return out;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=x-fit.x,dy=y-fit.y,u=dx*fit.cos+dy*fit.sin,v=-dx*fit.sin+dy*fit.cos;
  // The complete crown and central hair stay pixel-identical after placement.
  if(v<=fit.start||Math.abs(u)<=fit.inner)continue;
  const t=clamp((v-fit.start)/fit.transition,0,1),side=clamp((Math.abs(u)-fit.inner)/fit.sideSpan,0,1);
  const blend=t*t*(3-2*t)*side*side*(3-2*side),scale=1-(1-fit.sideScale)*blend;
  if(scale===1)continue;
  // Inverse sampling moves only the horizontal coordinate along the face axis.
  // No vertical squeezing, local upward push, mesh fold or repeated PNG resize.
  // Both side sections contract toward u=0 (the face center), rather than
  // shrinking around separate left/right inner edges. The middle stays locked.
  const sourceU=u/scale;
  const sx=fit.x+sourceU*fit.cos-v*fit.sin,sy=fit.y+sourceU*fit.sin+v*fit.cos;
  const px=Math.floor(sx),py=Math.floor(sy),fx=sx-px,fy=sy-py;
  let alpha=0,red=0,green=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const nx=px+xx,ny=py+yy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
   const j=(ny*w+nx)*4,part=pixels[j+3]*(xx?fx:1-fx)*(yy?fy:1-fy);
   alpha+=part;red+=pixels[j]*part;green+=pixels[j+1]*part;blue+=pixels[j+2]*part;
  }
  const j=(y*w+x)*4;out[j]=alpha?Math.round(red/alpha):0;out[j+1]=alpha?Math.round(green/alpha):0;out[j+2]=alpha?Math.round(blue/alpha):0;out[j+3]=Math.round(alpha);
 }
 return out;
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
// Bake the soft eraser into the front PNG and warp a separate lower-hair copy
// behind the unchanged portrait. No automatic layer/base masks are returned.
export function createTwoLayerHairPreview(placed,skin,face,w,h,makeCanvas,{singleLayer=false,fitLongBack=false,longStyle=null,preserveShape=false}={}){
 const reference19=fitLongBack&&longStyle==='hair-19';
 const a=anchors(face,w,h),cos=Math.cos(a.angle),sin=Math.sin(a.angle);
 const local=p=>({x:(p.x-a.x)*cos+(p.y-a.y)*sin,y:-(p.x-a.x)*sin+(p.y-a.y)*cos});
 const world=p=>({x:a.x+p.x*cos-p.y*sin,y:a.y+p.x*sin+p.y*cos});
 const landmark=i=>local({x:face[i].x*w,y:face[i].y*h});
 if(!skin||![127,356,152].every(i=>face[i]))throw Error('ตรวจกรอบหูและคอไม่สำเร็จ');
 const top=Math.min(landmark(127).y,landmark(356).y)-a.eye*(fitLongBack?.55:.25);
 const earTopLeft=landmark(127).y;
 const earTopRight=landmark(356).y;
 const chin=landmark(152).y,bottom=chin+a.eye*1.15,soft=Math.max(2,Math.min(12,a.eye*.035));
 const blurred=makeCanvas(w,h),bc=blurred.getContext('2d');bc.filter=`blur(${soft}px)`;bc.drawImage(skin,0,0,w,h);
 const sd=bc.getImageData(0,0,w,h).data;
 // Soft eraser extends slightly outside the skin contour; the rear hair
 // supplies the overlap instead of leaving a hard cut exactly at the ear.
 const expanded=makeCanvas(w,h),ec=expanded.getContext('2d'),margin=Math.max(2,a.eye*.025);
 ec.drawImage(skin,0,0,w,h);
 for(let i=0;i<8;i++){const angle=i*Math.PI/4;ec.drawImage(skin,Math.cos(angle)*margin,Math.sin(angle)*margin,w,h)}
 const eraser=makeCanvas(w,h),ex=eraser.getContext('2d');ex.filter=`blur(${soft}px)`;ex.drawImage(expanded,0,0);const ed=ex.getImageData(0,0,w,h).data;
 // Long hair: a fully erased skin core, then a soft opacity ramp outward.
 // Measure distance from the original skin, without blurring hair RGB/detail.
 let skinDistance=null;
 const solid=Math.max(1,a.eye*(reference19?.04:.015)),feather=Math.max(4,Math.min(reference19?48:24,a.eye*(reference19?.22:.12)));
 if(fitLongBack){
  const originalSkin=skin.getContext('2d').getImageData(0,0,w,h).data;
  skinDistance=new Float32Array(w*h);
  const diagonal=Math.SQRT2,cap=solid+feather+2;
  for(let i=0;i<skinDistance.length;i++){
   const q=local({x:i%w,y:Math.floor(i/w)}),earY=q.x<0?earTopLeft:earTopRight;
   // Smooth only the ear contour, keeping the face/neck eraser elsewhere intact.
   const nearEar=q.y>=earY-a.eye*.12&&q.y<=earY+a.eye*.9;
   skinDistance[i]=(nearEar?sd[i*4+3]:originalSkin[i*4+3])>=128?0:cap;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x;let d=skinDistance[i];
   if(x)d=Math.min(d,skinDistance[i-1]+1);
   if(y){d=Math.min(d,skinDistance[i-w]+1);if(x)d=Math.min(d,skinDistance[i-w-1]+diagonal);if(x+1<w)d=Math.min(d,skinDistance[i-w+1]+diagonal)}
   skinDistance[i]=d;
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
   const i=y*w+x;let d=skinDistance[i];
   if(x+1<w)d=Math.min(d,skinDistance[i+1]+1);
   if(y+1<h){d=Math.min(d,skinDistance[i+w]+1);if(x)d=Math.min(d,skinDistance[i+w-1]+diagonal);if(x+1<w)d=Math.min(d,skinDistance[i+w+1]+diagonal)}
   skinDistance[i]=d;
  }
 }
 const front=makeCanvas(w,h),fx=front.getContext('2d');fx.drawImage(placed,0,0);
 const fd=fx.getImageData(0,0,w,h),lower=makeCanvas(w,h),lx=lower.getContext('2d'),ld=lx.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!fd.data[j+3])continue;
  const q=local({x,y}),earTop=(q.x<0?landmark(127).y:landmark(356).y)-a.eye*.3,
  start=clamp((q.y-earTop)/(a.eye*.3),0,1),end=clamp((bottom-q.y)/(a.eye*.18),0,1),
  side=clamp((Math.abs(q.x)-a.width*.22)/(a.width*.12),0,1),
  below=clamp((q.y-a.eye*.05)/(a.eye*.25),0,1),gate=(start*start*(3-2*start))*end*Math.max(side,below);
  // Restrict soft erasure to actual visible skin below the ear roots.
  if(skinDistance){
   const t=clamp((skinDistance[y*w+x]-solid)/feather,0,1),opacity=t*t*(3-2*t);
   // Long front hair stays intact above the upper ear attachment.
   // Start the same soft eraser there and follow the existing face/neck contour.
   const earTop=q.x<0?earTopLeft:earTopRight;
   const underEar=clamp((q.y-earTop)/Math.max(1,a.eye*(reference19?.3:.25)),0,1);
   const region=underEar*underEar*(3-2*underEar)*end;
   let erase=(1-opacity)*region;
   // Follow the visible ear contour instead of an elliptical punched hole.
   // Clear the skin core at the ear root; taper continuously below the ear.
   const earRise=clamp((q.y-earTop+a.eye*.12)/(a.eye*.12),0,1);
   const earFall=1-clamp((q.y-earTop-a.eye*.65)/(a.eye*.25),0,1);
   const earRegion=earRise*earRise*(3-2*earRise)*earFall*earFall*(3-2*earFall);
   erase=Math.max(erase,(1-opacity)*earRegion);
   fd.data[j+3]=Math.round(fd.data[j+3]*(1-erase));
  }else fd.data[j+3]=Math.round(fd.data[j+3]*(1-ed[j+3]/255*gate));
 }
 fx.putImageData(fd,0,0);
 if(preserveShape){
  // Only remove front alpha where visible skin overlaps. The rear keeps the
  // same already-fitted PNG coordinates, without ear/neck lifts or pixel warps.
  const back=singleLayer?null:makeCanvas(w,h);
  if(back)back.getContext('2d').drawImage(placed,0,0);
  return {front,back,gapAdjusted:false};
 }
 // Long rear hair uses the complete native PNG behind the portrait.
 // Never crop it into an ear-to-neck strip: that produces a horizontal seam.
 // Other styles retain their existing lower-section copy.
 const pd=placed.getContext('2d').getImageData(0,0,w,h).data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;if(!pd[j+3])continue;
  const q=local({x,y}),gate=clamp((q.y-(top-a.eye*.25))/(a.eye*.2),0,1);
  ld.data[j]=pd[j];ld.data[j+1]=pd[j+1];ld.data[j+2]=pd[j+2];ld.data[j+3]=fitLongBack?pd[j+3]:Math.round(pd[j+3]*gate);
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
   const skinLimit=y>chin?(fitLongBack?a.width*.8+a.eye*.25:a.eye*.8):a.width*.5+a.eye*.25;
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
   const row=raw[i];if(fitLongBack||!row.missing||row.skinEdge<=step*3||row.sourceY>chin)continue;
   let nearest=null;
   for(let d=1;d<=Math.ceil(a.eye*.4/(bottom-top)*count)&&!nearest;d++)for(const j of [i-d,i+d]){
    if(j>=0&&j<=count&&!raw[j].missing&&raw[j].outer>row.skinEdge+step&&[-step,0,step].every(dy=>alphaAt(pd,sign*(raw[j].inner+step*3),raw[j].sourceY+dy)>220)){nearest=raw[j];break}
   }
   if(nearest){row.inner=nearest.inner;row.outer=nearest.outer;row.sourceY=nearest.sourceY;row.push=Math.min(Math.max(0,row.inner-a.eye*.1),Math.max(0,row.inner-row.skinEdge)+a.eye*.18)}
  }
  if(fitLongBack){
   // Interpolate geometry across open ear rows, never copy hair pixels from another row.
   const valid=raw.map((v,i)=>v.missing?-1:i).filter(i=>i>=0);
   for(let i=0;i<=count;i++)if(raw[i].missing&&valid.length){
    const lo=valid.filter(j=>j<i).at(-1)??valid[0],hi=valid.find(j=>j>i)??valid.at(-1);
    const t=hi===lo?0:clamp((i-lo)/(hi-lo),0,1),row=raw[i];
    for(const key of ['inner','outer'])row[key]=raw[lo][key]*(1-t)+raw[hi][key]*t;
    row.push=row.skinEdge>step*3?Math.max(0,row.inner-row.skinEdge)+a.eye*.08:0;
    // The PNG may contain a genuinely empty ear opening. Interpolating its
    // geometry alone cannot provide hair pixels: use the nearest intact row,
    // only inside the rear overlap, with a smooth displacement field below.
    const nearest=i-lo<=hi-i?lo:hi;
    row.repairY=clamp(raw[nearest].sourceY-row.sourceY,-a.eye*.45,a.eye*.45);
   }
   profiles[name]=raw.map((row,i)=>{
    const sums={inner:0,outer:0,push:0,repairY:0};let weight=0;
    for(let k=-4;k<=4;k++){const v=raw[clamp(i+k,0,count)],wt=Math.exp(-k*k/8);weight+=wt;for(const key of Object.keys(sums))sums[key]+=(v[key]||0)*wt}
    return {...row,inner:sums.inner/weight,outer:sums.outer/weight,push:sums.push/weight,repairY:sums.repairY/weight};
   });
  }else{
  profiles[name]=raw.map((_,i)=>{
   let sum=0,weight=0;for(let k=-2;k<=2;k++){const j=clamp(i+k,0,count),v=3-Math.abs(k);sum+=raw[j].push*v;weight+=v}return {...raw[i],push:Math.max(raw[i].push,sum/weight)};
  });
  }
 }
 const measuredPush=(sign,y)=>{
  const pos=clamp((y-top)/(bottom-top)*count,0,count),i=Math.floor(pos),t=pos-i,p=profiles[sign<0?'left':'right'];
  const next=p[Math.min(count,i+1)];return {push:p[i].push*(1-t)+next.push*t,inner:p[i].inner*(1-t)+next.inner*t,outer:p[i].outer*(1-t)+next.outer*t,sourceY:(t<.5?p[i]:next).sourceY,repairY:(p[i].repairY||0)*(1-t)+(next.repairY||0)*t,borrowed:p[i].missing||next.missing};
 };
 // Inverse pixel warp avoids thousands of full-image triangle draws for the rear copy.
 // Every local row is monotonic: outer silhouette pinned, inner edge stretched inward.
 const back=makeCanvas(w,h),backCtx=back.getContext('2d'),bd=backCtx.createImageData(w,h);
 if(fitLongBack)bd.data.set(pd);
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
  // Long rear: move only the inner strands; preserve the outer silhouette.
  const originalRow=fitLongBack?measuredPush(sign,q.y):null;
  const r=Math.abs(q.x);
  const outerGuard=Math.max(2,a.eye*.04);
  const innerBlend=fitLongBack?clamp((originalRow.outer-outerGuard-r)/Math.max(step,originalRow.outer-outerGuard-originalRow.inner),0,1):1;
  const radialWeight=innerBlend*innerBlend*(3-2*innerBlend);
  if(fitLongBack&&radialWeight===0)continue;
  const liftStart=clamp((q.y-(ear.y-a.eye*.55))/Math.max(1,a.eye*.3),0,1);
  const liftEnd=clamp((bottom+a.eye*.3-q.y)/Math.max(1,a.eye*.5),0,1);
  const liftWeight=reference19?earWeight*radialWeight:fitLongBack?liftStart*liftStart*(3-2*liftStart)*liftEnd*liftEnd*(3-2*liftEnd)*radialWeight:earWeight;
  const sampleY=q.y+a.eye*(reference19?.28:.2)*liftWeight+(fitLongBack?originalRow.repairY*radialWeight:0);
  // Continue the long rear's inward overlap along jaw, neck and shoulders,
  // rather than stopping its extra push at the ear band.
  const neckStart=clamp((q.y-ear.y)/Math.max(1,a.eye*.2),0,1);
  const neckWeight=neckStart*neckStart*(3-2*neckStart);
  // Style 19: smooth inner bulges at the ear and lower neck, while the
  // outer hair stays pinned. Lift only the ear, not the entire long ends.
  const inwardWeight=reference19?Math.max(earWeight,neckWeight*(.55+.45*Math.exp(-(((q.y-chin-a.eye*.35)/(a.eye*.45))**2)))):fitLongBack?Math.max(earWeight,neckWeight):earWeight;
  const measured=measuredPush(sign,sampleY),fade=clamp((bottom+a.eye*.3-q.y)/(a.eye*.3),0,1),
  push=Math.min(Math.max(0,measured.inner-a.eye*.1),Math.max(
   measured.push+a.eye*(reference19?.28:.2)*inwardWeight,
   // Close the actual OUTPUT-row ear contour, including the feather overlap.
   // Sampling a lifted source row alone can leave an exposed gap at the ear.
   fitLongBack&&originalRow.skinEdge>step*3&&q.y>=ear.y-a.eye*.12&&q.y<=ear.y+a.eye*.65?Math.max(0,measured.inner-originalRow.skinEdge+solid+feather)*earWeight:0
  ))*fade;
  let sourceR=r;
  if(push>0&&r<measured.outer){let low=r,high=Math.min(measured.outer,r+push);for(let i=0;i<9;i++){const middle=(low+high)/2;if(movedDistance(middle,push,measured)<r)low=middle;else high=middle}sourceR=(low+high)/2}
  const borrowWeight=!fitLongBack&&measured.borrowed&&measured.push>0&&r<measured.outer?1:0;
  const point=world({x:sign*sourceR,y:sampleY+(measured.sourceY-sampleY)*borrowWeight}),px=Math.floor(point.x),py=Math.floor(point.y),dx=point.x-px,dy=point.y-py;
  let alpha=0,red=0,green=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const sx=px+xx,sy=py+yy;if(sx<0||sx>=w||sy<0||sy>=h)continue;
   const j=(sy*w+sx)*4,weight=(xx?dx:1-dx)*(yy?dy:1-dy),part=ld.data[j+3]*weight;
   alpha+=part;red+=ld.data[j]*part;green+=ld.data[j+1]*part;blue+=ld.data[j+2]*part;
  }
  // Raster holes at a short style's ear opening can survive row fitting.
  // Fill only the inward-stretched overlap with a nearby opaque hair sample.
  if(!fitLongBack&&alpha<220&&push>0&&r>=measured.inner-push&&r<measured.inner&&q.y<chin){
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
  const j=(y*w+x)*4;if(alpha>0){bd.data[j]=Math.round(red/alpha);bd.data[j+1]=Math.round(green/alpha);bd.data[j+2]=Math.round(blue/alpha);bd.data[j+3]=Math.round(alpha)}else if(fitLongBack)bd.data.fill(0,j,j+4);
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

