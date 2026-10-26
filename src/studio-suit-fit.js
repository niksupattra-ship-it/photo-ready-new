import {decodedStudioImage} from './studio-image-cache.js';
import {measureUniformAnchors} from './portrait-uniform-fit.js';
import {warpStudioCollar} from './studio-collar.js';
import {layerToScene,sceneToLayer} from './studio-transform.js';
import {measureCollarOpeningProfile,measureSkinNeckProfile,solveAutoCollarWidth} from './studio-auto-collar-fit.js';

export const STUDIO_SUIT_FIT_VERSION='proportional-fixed-suit-v3';
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
 if(!entry.opening.length)entry.opening=[{y:entry.uniform.collarTopY,left:entry.uniform.centerX-entry.width*.09,right:entry.uniform.centerX+entry.width*.09,width:entry.width*.18,centerX:entry.uniform.centerX}];
 const torso=[];for(let y=Math.round(entry.uniform.bounds.t+entry.uniform.bounds.h*.55);y<entry.uniform.bounds.t+entry.uniform.bounds.h*.8;y+=4){const cx=Math.round(entry.uniform.centerX),opaque=x=>entry.pixels[(y*entry.width+x)*4+3]>96;if(!opaque(cx))continue;let l=cx,r=cx;while(l>0&&opaque(l-1))l--;while(r<entry.width-1&&opaque(r+1))r++;if(r-l>entry.uniform.bounds.w*.35&&r-l<entry.uniform.bounds.w*.98)torso.push(r-l+1)}entry.uniform.torsoWidth=torso.length?median(torso):entry.uniform.shoulderWidth*.8;
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

export function planStudioSuitGeometry({uniform,face,head,suit}){
 const hf=frame(head),garmentFrame=frame(suit);
 if(!validFrame(hf)||!validFrame(garmentFrame)||!uniform?.bounds)throw Error('ตำแหน่งหัวหรือชุดไม่ถูกต้อง');
 const point=p=>({x:hf.x+p.x/face.width*hf.w,y:hf.y+p.y/face.height*hf.h});
 const le=point(face.leftEye),re=point(face.rightEye),chin=point(face.chin),left=point(face.left),right=point(face.right),sp=pose(suit);
 const eyeAngle=Math.atan2(re.y-le.y,re.x-le.x),eyeWidth=Math.hypot(re.x-le.x,re.y-le.y),faceWidth=Math.hypot(right.x-left.x,right.y-left.y);
 const referenceScale=904/uniform.bounds.w,referenceFrame={x:-2-uniform.bounds.l*referenceScale,y:H*.425+uniform.socketY*(W*.94/uniform.width)-uniform.socketY*referenceScale,w:uniform.width*referenceScale,h:uniform.height*referenceScale};
 const localChin={x:garmentFrame.x+(W*.5-referenceFrame.x)/referenceFrame.w*garmentFrame.w,y:garmentFrame.y+(H*.5-referenceFrame.y)/referenceFrame.h*garmentFrame.h};
 const chinTarget=layerToScene(sp,localChin),shoulderSpan=uniform.shoulderWidth/uniform.width*garmentFrame.w*sp.scale*Math.abs(sp.squeezeX),torsoSpan=(uniform.torsoWidth||uniform.shoulderWidth*.8)/uniform.width*garmentFrame.w*sp.scale*Math.abs(sp.squeezeX);
 // Match composePortrait's actual eye normalization (160‰ ×1.28), mapped
 // through this garment's own initial frame. The neck cut edge never sizes a face.
 let scale=W*.160*1.28*(garmentFrame.w/referenceFrame.w)*sp.scale*Math.abs(sp.squeezeX)/eyeWidth;
 scale=Math.min(scale,shoulderSpan*.46/faceWidth,torsoSpan*.72/faceWidth);
 const crown=point({x:face.cx,y:face.opaqueTop}),span=Math.hypot(chin.x-crown.x,chin.y-crown.y);
 if(span>0&&chinTarget.y>H*.045)scale=Math.min(scale,(chinTarget.y-H*.045)/span);
 if(!Number.isFinite(scale)||scale<.1||scale>5)throw Error('วัดขนาดหัวกับชุดไม่สำเร็จ');
 const rotation=sp.rotation-eyeAngle*180/Math.PI,r=rotation*Math.PI/180,u=(chin.x-W/2)*scale,v=(chin.y-H/2)*scale;
 const headPose={x:chinTarget.x-W/2-u*Math.cos(r)+v*Math.sin(r),y:chinTarget.y-H/2-u*Math.sin(r)-v*Math.cos(r),scale,rotation,squeezeX:1,squeezeY:1};
 return {garmentFrame,headPose,chinTarget,shoulderSpan,torsoSpan,localScale:scale/sp.scale};
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
 const head=layers.find(layer=>kind(layer)==='head'&&layer.jobId);if(!head)return layers;
 if(head.locked||layers.some(layer=>layer.hairHeadId===head.id&&layer.kind!=='neck-fit'&&layer.locked))throw Error('ปลดล็อกเลเยอร์หัวและทรงผมก่อนจัดชุดอัตโนมัติ');
 if(!nextSuit||typeof measureFace!=='function')throw Error('ระบบจัดชุดอัตโนมัติยังไม่พร้อม');
 const [garment,portrait]=await Promise.all([garmentMeasurement(nextSuit.source),sampleSurface(headSource||head.source,headMask)]);
 const detected=await measureFace(portrait.canvas),face=Array.isArray(detected)?detected:detected?.faceLandmarks?.[0],landmarks=faceMeasurement(face,portrait.width,portrait.height,portrait.pixels);
 let neck=measureSkinNeckProfile({pixels:portrait.pixels,width:portrait.width,height:portrait.height,face});
 if(neck.rows.length<3){
  const rows=[],cx=Math.round(landmarks.chin.x),half=landmarks.faceWidth*.32;
  for(let y=Math.round(landmarks.chin.y+landmarks.faceHeight*.06);y<Math.min(portrait.height,landmarks.chin.y+landmarks.faceHeight*.6);y+=Math.max(1,Math.round(landmarks.faceHeight*.025))){
   const alpha=x=>portrait.pixels[(y*portrait.width+x)*4+3]>128;if(!alpha(cx)){if(rows.length)break;continue}let l=cx,r=cx;while(l>cx-half&&alpha(l-1))l--;while(r<cx+half&&alpha(r+1))r++;rows.push({y,left:l,right:r});
  }
  neck={...neck,rows,chin:landmarks.chin,faceHeight:landmarks.faceHeight};
 }
 if(neck.rows.length<2)throw Object.assign(Error('ยังไม่พบช่วงคอที่ชัดเจน กรุณาเลือกชุดแล้วปรับตำแหน่งหัวเพิ่มเติม'),{code:'SUIT_FIT_UNCLEAR'});
 const plan=preservePlacement?null:planStudioSuitGeometry({uniform:garment.uniform,face:landmarks,head,suit:nextSuit});
 const fittedHead=preservePlacement?head:{...head,...plan.headPose};
 const sf=frame(nextSuit),cf=nextSuit.collarFrame||sf,warpFrame={x:(cf.x-sf.x)*garment.width/sf.w,y:(cf.y-sf.y)*garment.height/sf.h,w:cf.w*garment.width/sf.w,h:cf.h*garment.height/sf.h};
 const upperRows=neck.rows.filter(row=>row.y<=neck.chin.y+neck.faceHeight*.22),profile={...neck,rows:upperRows.length>=3?upperRows:neck.rows};
 const collar=solveAutoCollarWidth({pixels:garment.pixels,width:garment.width,height:garment.height,neckProfile:profile,headToUniform:pixelTransform(fittedHead,portrait,nextSuit,garment),frame:warpFrame,smoothTop:(nextSuit.templatePath||'').includes('/job-uniforms/')});
 const width=collar.confidence>=.25?clamp(collar.neckWidth,-60,60):0;
 const nativeFrame={x:warpFrame.x*garment.originalWidth/garment.width,y:warpFrame.y*garment.originalHeight/garment.height,w:warpFrame.w*garment.originalWidth/garment.width,h:warpFrame.h*garment.originalHeight/garment.height};
 let preview=warpStudioCollar(garment.image,width/100,(nextSuit.neckHeight||0)/100,nativeFrame,{smoothTop:(nextSuit.templatePath||'').includes('/job-uniforms/')});
 if(!preview.getContext){const c=Object.assign(document.createElement('canvas'),{width:garment.originalWidth,height:garment.originalHeight});c.getContext('2d').drawImage(preview,0,0);preview=c}
 const gap=hasStudioCollarGap({garment,portrait,headToUniform:pixelTransform(fittedHead,portrait,nextSuit,garment),previewPixels:preview.getContext('2d',{willReadFrequently:true}).getImageData(0,0,garment.originalWidth,garment.originalHeight).data,frameHeight:sf.h});
 const fittedSuit={...nextSuit,neckWidth:width,autoSuitFitVersion:STUDIO_SUIT_FIT_VERSION,autoCollarFitWidth:width,autoCollarFitConfidence:Number((collar.confidence||0).toFixed(3)),autoCollarFitApplied:collar.confidence>=.25,autoSuitFitWarning:gap?'ช่วงคอรูปนี้ไม่พอกับช่องคอชุด กรุณาปรับคอเสื้อเพิ่มเติม':''};
 const result=layers.filter(layer=>!(layer.kind==='neck-fit'&&layer.hairHeadId===head.id)).map(layer=>layer.id===head.id?fittedHead:layer.id===previousSuit?.id||layer.id===nextSuit.id?fittedSuit:layer);
 if(!result.some(layer=>layer.id===fittedSuit.id))result.push(fittedSuit);
 return result;
}
