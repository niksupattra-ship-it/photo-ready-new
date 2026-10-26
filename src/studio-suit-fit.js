import {decodedStudioImage} from './studio-image-cache.js';
import {measureUniformAnchors} from './portrait-uniform-fit.js';
import {warpStudioCollar} from './studio-collar.js';
import {layerToScene,sceneToLayer} from './studio-transform.js';
import {measureCollarOpeningProfile,measureSkinNeckProfile,solveAutoCollarWidth} from './studio-auto-collar-fit.js';

export const STUDIO_SUIT_FIT_VERSION='fixed-suit-head-fit-v2';
const W=900,H=1200;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const kind=layer=>layer.kind||({'หัว · คอ · ผม':'head','ชุด':'suit','เข็มปกคอ':'collar','เข็มติดอก':'chest','แพรแถบ':'ribbon'})[layer.name];
const frame=layer=>layer.sourceFrame||{x:0,y:0,w:W,h:H};
const pose=layer=>({x:layer.x||0,y:layer.y||0,scale:layer.scale||1,rotation:layer.rotation||0,squeezeX:layer.squeezeX??1,squeezeY:layer.squeezeY??1});
const validFrame=f=>f&&['x','y','w','h'].every(key=>Number.isFinite(f[key]))&&f.w>0&&f.h>0;
const templateMeasurements=new WeakMap();

async function sampleSurface(source,mask=null){
 const image=typeof source==='string'?await decodedStudioImage(source):source;
 const iw=image?.naturalWidth||image?.width,ih=image?.naturalHeight||image?.height;
 if(![iw,ih].every(n=>Number.isFinite(n)&&n>1))throw Error('ไม่พบภาพสำหรับจัดชุดอัตโนมัติ');
 const ratio=Math.min(1,1024/Math.max(iw,ih));
 const canvas=Object.assign(document.createElement('canvas'),{width:Math.max(2,Math.round(iw*ratio)),height:Math.max(2,Math.round(ih*ratio))});
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('หน่วยความจำสำหรับจัดชุดไม่พอ กรุณาลองใหม่');
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 if(mask){ctx.globalCompositeOperation='destination-in';ctx.drawImage(typeof mask==='string'?await decodedStudioImage(mask):mask,0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over'}
 return {image,canvas,width:canvas.width,height:canvas.height,originalWidth:iw,originalHeight:ih,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
}

async function garmentMeasurement(source){
 let entry=typeof source==='object'&&source?templateMeasurements.get(source):null;
 if(entry)return entry;
 entry=await sampleSurface(source);
 entry.uniform=measureUniformAnchors(entry.pixels,entry.width,entry.height);
 entry.uniform.nativeAspect=entry.originalHeight/entry.originalWidth;
 entry.opening=measureCollarOpeningProfile({pixels:entry.pixels,width:entry.width,height:entry.height,centerX:entry.uniform.centerX,minY:entry.uniform.bounds.t,maxY:Math.min(entry.uniform.bounds.b,entry.uniform.bounds.t+entry.uniform.bounds.w*.55)});
 if(!entry.opening.length)throw Error('ไม่พบช่องคอของชุดสำหรับจัดตำแหน่งอัตโนมัติ');
 // A tie or one lapel can cross the centre before the side of the V closes.
 // Anchor the existing neck to the first solid strip across the whole tip.
 const last=entry.opening[entry.opening.length-1],cx=median(entry.opening.slice(-5).map(row=>row.centerX)),left=Math.max(0,Math.floor(Math.min(last.left,cx-entry.width*.02))),right=Math.min(entry.width-1,Math.ceil(Math.max(last.right,cx+entry.width*.02)));
 let solid=0;
 for(let y=Math.max(0,Math.floor(last.y));y<Math.min(entry.height,last.y+entry.width*.2);y++){
  let opaque=true;for(let x=left;x<=right;x++)if(entry.pixels[(y*entry.width+x)*4+3]<160){opaque=false;break}
  if(opaque){if(++solid>=3){entry.uniform.neckSocketY=y-2+1.5;break}}else solid=0;
 }
 if(typeof source==='object'&&source)templateMeasurements.set(source,entry);
 return entry;
}

function faceMeasurement(face,width,height,pixels){
 if([10,33,152,234,263,454].some(id=>!face?.[id]||![face[id].x,face[id].y].every(Number.isFinite)))throw Error('ไม่พบจุดใบหน้าครบสำหรับจัดชุด');
 const point=id=>({x:face[id].x*width,y:face[id].y*height});
 const l=point(234),r=point(454),chin=point(152),forehead=point(10),le=point(33),re=point(263);
 const fw=Math.hypot(r.x-l.x,r.y-l.y),fh=Math.hypot(chin.x-forehead.x,chin.y-forehead.y),eye=Math.hypot(re.x-le.x,re.y-le.y);
 if(fw<12||fh<12||eye<6||fw>width*.98||fh>height*.98)throw Error('จุดใบหน้าไม่ชัดพอสำหรับจัดชุดอัตโนมัติ');
 const cx=(l.x+r.x)/2,x0=Math.max(0,Math.floor(cx-fw*.85)),x1=Math.min(width-1,Math.ceil(cx+fw*.85));
 let top=forehead.y;
 outer:for(let y=0;y<=Math.floor(forehead.y);y++){
  let count=0;for(let x=x0;x<=x1;x++)if(pixels[(y*width+x)*4+3]>96)count++;
  if(count>=Math.max(3,fw*.035)){top=y;break outer}
 }
 return {width,height,cx,chin,forehead,left:l,right:r,leftEye:le,rightEye:re,faceWidth:fw,faceHeight:fh,eyeWidth:eye,opaqueTop:top,oval:[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109].filter(id=>face[id]&&[face[id].x,face[id].y].every(Number.isFinite)).map(id=>point(id)),protectedFace:[33,263,1,61,291,152,172,397,150,379,149,378,136,365].filter(id=>face[id]&&[face[id].x,face[id].y].every(Number.isFinite)).map(id=>({id,...point(id)}))};
}

export function planStudioSuitGeometry({uniform,opening,face,head,suit,neckProfile=null}){
 const hf=frame(head),garmentFrame=frame(suit);
 if(!validFrame(hf)||!validFrame(garmentFrame)||!uniform||!opening?.length)throw Error('ตำแหน่งหัวหรือชุดไม่ถูกต้อง');
 const headPoint=p=>({x:hf.x+p.x/face.width*hf.w,y:hf.y+p.y/face.height*hf.h});
 const left=headPoint(face.left),right=headPoint(face.right),le=headPoint(face.leftEye),re=headPoint(face.rightEye);
 const eyeAngle=Math.atan2(re.y-le.y,re.x-le.x),crown=headPoint({x:face.cx,y:face.opaqueTop});
 const rows=neckProfile?.rows||[],end=rows.length?rows[rows.length-1]:null;
 const neck=headPoint(end?{x:(end.left+end.right)/2,y:end.y}:{x:face.cx,y:face.chin.y+face.faceHeight*.25});
 const sp=pose(suit),shoulderSpan=uniform.shoulderWidth/uniform.width*garmentFrame.w*sp.scale*Math.abs(sp.squeezeX);
 const socket={x:garmentFrame.x+uniform.centerX/uniform.width*garmentFrame.w,y:garmentFrame.y+Math.max(uniform.neckSocketY??uniform.socketY,opening[opening.length-1].y+1)/uniform.height*garmentFrame.h};
 const target=layerToScene(sp,socket),faceWidth=Math.hypot(right.x-left.x,right.y-left.y);
 const crownToNeck=-(neck.x-crown.x)*Math.sin(eyeAngle)+(neck.y-crown.y)*Math.cos(eyeAngle);
 if(faceWidth<4||crownToNeck<8||shoulderSpan<=0)throw Error('วัดสัดส่วนหัวและคอไม่สำเร็จ');
 // The garment is immutable. Fit the original crown-to-neck span inside its
 // existing socket; a single scale keeps facial and neck proportions intact.
 const heightScale=(socket.y-H*.045)/crownToNeck*sp.scale*Math.abs(sp.squeezeY);
 const scale=clamp(heightScale,shoulderSpan*.30/faceWidth,shoulderSpan*.50/faceWidth);
 if(!Number.isFinite(scale)||scale<.1||scale>5)throw Error('ขนาดหัวอยู่นอกช่วงที่รองรับ');
 const rotation=sp.rotation-eyeAngle*180/Math.PI,radians=rotation*Math.PI/180,u=(neck.x-W/2)*scale,v=(neck.y-H/2)*scale;
 const headPose={x:target.x-W/2-u*Math.cos(radians)+v*Math.sin(radians),y:target.y-H/2-u*Math.sin(radians)-v*Math.cos(radians),scale,rotation,squeezeX:1,squeezeY:1};
 const chin=headPoint(face.chin),chinTarget=layerToScene(headPose,chin);
 return {garmentFrame,headPose,collarAnchor:target,chinTarget,shoulderSpan,localScale:scale/sp.scale};
}

function pixelTransform(head,headSample,suit,uniformSample){
 const hf=frame(head),uf=frame(suit),hp=pose(head),sp=pose(suit);
 const apply=(x,y)=>{
  const local={x:hf.x+x/headSample.width*hf.w,y:hf.y+y/headSample.height*hf.h};
  const garment=sceneToLayer(sp,layerToScene(hp,local));
  return {x:(garment.x-uf.x)/uf.w*uniformSample.width,y:(garment.y-uf.y)/uf.h*uniformSample.height};
 };
 const o=apply(0,0),x=apply(1,0),y=apply(0,1);
 return [x.x-o.x,x.y-o.y,y.x-o.x,y.y-o.y,o.x,o.y];
}

// A face-clearance move can expose the source's cut-off neck at the V tip.
// Inspect only the enclosed lower collar opening; air outside lapels is allowed.
export function hasStudioCollarGap({garment,portrait,headToUniform,previewPixels,frameHeight}){
 const [a,b,c,d,e,f]=headToUniform,det=a*d-b*c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-8)return true;
 const tail=garment.opening.slice(-Math.max(3,Math.ceil(garment.opening.length*.3)));
 const nativeW=garment.originalWidth,nativeH=garment.originalHeight;
 let missingRun=0,rowIndex=0;
 const end=Math.max(tail[tail.length-1].y,garment.uniform.neckSocketY??0);
 for(let y=tail[0].y;y<=end;y++){
  while(rowIndex+1<tail.length&&tail[rowIndex+1].y<=y)rowIndex++;
  const row=tail[rowIndex],next=tail[Math.min(rowIndex+1,tail.length-1)],t=next.y>row.y?clamp((y-row.y)/(next.y-row.y),0,1):0;
  const left=row.left+(next.left-row.left)*t,right=row.right+(next.right-row.right)*t;
  let exposed=0,missing=0;
  for(const part of [.35,.5,.65]){
   const ux=left+(right-left)*part,nx=Math.round(ux*nativeW/garment.width),ny=Math.round(y*nativeH/garment.height);
   if(nx<0||nx>=nativeW||ny<0||ny>=nativeH||previewPixels[(ny*nativeW+nx)*4+3]>=96)continue;
   exposed++;
   const px=Math.round((d*(ux-e)-c*(y-f))/det),py=Math.round((-b*(ux-e)+a*(y-f))/det);
   if(px<0||px>=portrait.width||py<0||py>=portrait.height||portrait.pixels[(py*portrait.width+px)*4+3]<96)missing++;
  }
  if(exposed>0&&missing>=Math.ceil(exposed/2)){
   if(++missingRun*frameHeight/garment.height>3)return true;
  }else missingRun=0;
 }
 return false;
}

export async function fitStudioSuit({layers,previousSuit,nextSuit,headSource,headMask=null,measureFace,preservePlacement=false}){
 const head=layers.find(layer=>kind(layer)==='head'&&layer.jobId);
 if(!head)return layers;
 if(head.locked||layers.some(layer=>layer.hairHeadId===head.id&&layer.kind!=='neck-fit'&&layer.locked))throw Error('ปลดล็อกเลเยอร์หัวและทรงผมก่อนจัดชุดอัตโนมัติ');
 if(!nextSuit||typeof measureFace!=='function')throw Error('ระบบจัดชุดอัตโนมัติยังไม่พร้อม');
 const [garment,portrait]=await Promise.all([garmentMeasurement(nextSuit.source),sampleSurface(headSource||head.source,headMask)]);
 const detected=await measureFace(portrait.canvas),face=Array.isArray(detected)?detected:detected?.faceLandmarks?.[0];
 const landmarks=faceMeasurement(face,portrait.width,portrait.height,portrait.pixels);
 const neck=measureSkinNeckProfile({pixels:portrait.pixels,width:portrait.width,height:portrait.height,face});
 if(neck.rows.length<3||neck.confidence<.25)throw Object.assign(Error('ยังวัดแนวคอให้พอดีกับชุดไม่ได้ งานเดิมยังอยู่ กรุณาตรวจสอบว่าบริเวณคอเห็นชัดเจน'),{code:'SUIT_FIT_UNCLEAR'});
 const plan=preservePlacement?null:planStudioSuitGeometry({uniform:garment.uniform,opening:garment.opening,face:landmarks,head,suit:nextSuit,neckProfile:neck});
 let fittedHead=preservePlacement?head:{...head,...plan.headPose};
 // Only the local collar control may change. Body frame, pose, source and
 // independent accessories retain exactly the values supplied by the editor.
 const fittedSuit={...nextSuit,neckWidth:0,autoSuitFitVersion:STUDIO_SUIT_FIT_VERSION};

 const upperRows=neck.rows.filter(row=>row.y<=neck.chin.y+neck.faceHeight*.17),upperWidth=median(upperRows.map(row=>row.right-row.left));
 const collarNeck={...neck,rows:upperRows.filter(row=>row.right-row.left<=upperWidth*1.08)};
 const sf=frame(nextSuit),cf=nextSuit.collarFrame||sf,warpFrame={x:(cf.x-sf.x)*garment.width/sf.w,y:(cf.y-sf.y)*garment.height/sf.h,w:cf.w*garment.width/sf.w,h:cf.h*garment.height/sf.h};
 const smoothTop=(nextSuit.templatePath||'').includes('/job-uniforms/');
 const nativeW=garment.originalWidth,nativeH=garment.originalHeight,nativeFrame={x:warpFrame.x*nativeW/garment.width,y:warpFrame.y*nativeH/garment.height,w:warpFrame.w*nativeW/garment.width,h:warpFrame.h*nativeH/garment.height};
 let previousWidth=null,previewPixels=null;
 const faceCY=landmarks.oval.length?landmarks.oval.reduce((n,p)=>n+p.y,0)/landmarks.oval.length:(landmarks.forehead.y+landmarks.chin.y)*.5,faceCX=landmarks.oval.length?landmarks.oval.reduce((n,p)=>n+p.x,0)/landmarks.oval.length:landmarks.cx,oval=landmarks.oval.map(p=>({x:p.x*.92+faceCX*.08,y:p.y*.92+faceCY*.08}));
 const inside=(x,y)=>{let result=false;for(let i=0,j=oval.length-1;i<oval.length;j=i++){const p=oval[i],q=oval[j];if((p.y>y)!==(q.y>y)&&x<(q.x-p.x)*(y-p.y)/(q.y-p.y)+p.x)result=!result}return result};
 const protectedPoints=[];
 if(oval.length>=3){const l=Math.min(...oval.map(p=>p.x)),r=Math.max(...oval.map(p=>p.x)),t=Math.min(...oval.map(p=>p.y)),bottom=Math.max(...oval.map(p=>p.y));for(let y=t;y<bottom;y+=Math.max(1,(bottom-t)/60))for(let x=l;x<r;x+=Math.max(1,(r-l)/50))if(inside(x,y))protectedPoints.push({x,y})}
 if(!protectedPoints.length)for(const p of landmarks.protectedFace)protectedPoints.push({x:p.x*.92+landmarks.cx*.08,y:p.y*.92+faceCY*.08});
 const candidate=headLayer=>{
  const headToUniform=pixelTransform(headLayer,portrait,fittedSuit,garment);
  const collar=solveAutoCollarWidth({pixels:garment.pixels,width:garment.width,height:garment.height,neckProfile:collarNeck,headToUniform,frame:warpFrame,smoothTop});
  const width=collar.confidence>=.25?clamp(collar.neckWidth,-40,40):0;
  if(width!==previousWidth){let preview=warpStudioCollar(garment.image,width/100,(nextSuit.neckHeight||0)/100,nativeFrame,{smoothTop});if(!preview.getContext){const surface=Object.assign(document.createElement('canvas'),{width:nativeW,height:nativeH});surface.getContext('2d').drawImage(preview,0,0);preview=surface}previewPixels=preview.getContext('2d',{willReadFrequently:true}).getImageData(0,0,nativeW,nativeH).data;previousWidth=width}
  const [a,b,c,d,e,f]=headToUniform;let blocked=0;
  for(const p of protectedPoints){
   const ux=Math.round((a*p.x+c*p.y+e)*nativeW/garment.width),uy=Math.round((b*p.x+d*p.y+f)*nativeH/garment.height);
   if(ux>=0&&ux<nativeW&&uy>=0&&uy<nativeH&&previewPixels[(uy*nativeW+ux)*4+3]>96)blocked++;
  }
  const gap=hasStudioCollarGap({garment,portrait,headToUniform,previewPixels,frameHeight:sf.h});
  return {width,confidence:collar.confidence,blocked,gap};
 };
 let fit=candidate(fittedHead);
 if(fit.blocked>0&&!preservePlacement){
  const original=fittedHead,sp=pose(nextSuit),r=sp.rotation*Math.PI/180;
  for(let up=3;up<=36;up+=3){
   const next={...original,x:original.x+Math.sin(r)*up*sp.scale*Math.abs(sp.squeezeY),y:original.y-Math.cos(r)*up*sp.scale*Math.abs(sp.squeezeY)},result=candidate(next);
   if(result.blocked===0&&!result.gap){fittedHead=next;fit=result;break}
  }
 }
 if(fit.blocked>0||fit.gap)throw Object.assign(Error('รูปนี้มีช่วงคอไม่พอกับชุดที่เลือก งานเดิมยังอยู่ กรุณาเลือกชุดอื่น'),{code:'SUIT_FIT_SOURCE_SHORT'});
 fittedSuit.neckWidth=fit.width;
 fittedSuit.autoCollarFitWidth=fittedSuit.neckWidth;
 fittedSuit.autoCollarFitConfidence=Number((fit.confidence||0).toFixed(3));
 fittedSuit.autoCollarFitApplied=fit.confidence>=.25;
 const result=layers.filter(layer=>!(layer.kind==='neck-fit'&&layer.hairHeadId===head.id)).map(layer=>layer.id===head.id?fittedHead:layer.id===previousSuit?.id||layer.id===nextSuit.id?fittedSuit:layer);
 if(!result.some(layer=>layer.id===fittedSuit.id))result.push(fittedSuit);
 return result;
}
