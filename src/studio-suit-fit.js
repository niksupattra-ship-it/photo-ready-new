import {decodedStudioImage} from './studio-image-cache.js';
import {measureUniformAnchors} from './portrait-uniform-fit.js';
import {layerToScene,sceneToLayer,transformedOffset} from './studio-transform.js';
import {measureCollarOpeningProfile,measureSkinNeckProfile,solveAutoCollarWidth} from './studio-auto-collar-fit.js';
import {createStudioNeckBridge} from './studio-neck-bridge.js';

export const STUDIO_SUIT_FIT_VERSION='suit-switch-fit-v1';
const W=900,H=1200,OUTPUT_W=2256,OUTPUT_H=3072;
// Workspace pixels and exported pixels have different aspect ratios. Retain
// the same calibration as the initial compositor rather than stretching a PNG.
const Y_CALIBRATION=(H/OUTPUT_H)/(W/OUTPUT_W);
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
 return {canvas,width:canvas.width,height:canvas.height,originalWidth:iw,originalHeight:ih,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
}

async function garmentMeasurement(source){
 let entry=typeof source==='object'&&source?templateMeasurements.get(source):null;
 if(entry)return entry;
 entry=await sampleSurface(source);
 entry.uniform=measureUniformAnchors(entry.pixels,entry.width,entry.height);
 entry.uniform.nativeAspect=entry.originalHeight/entry.originalWidth;
 entry.opening=measureCollarOpeningProfile({pixels:entry.pixels,width:entry.width,height:entry.height,centerX:entry.uniform.centerX,minY:entry.uniform.bounds.t,maxY:Math.min(entry.uniform.bounds.b,entry.uniform.bounds.t+entry.uniform.bounds.w*.55)});
 if(!entry.opening.length)throw Error('ไม่พบช่องคอของชุดสำหรับจัดตำแหน่งอัตโนมัติ');
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
 return {width,height,cx,chin,forehead,left:l,right:r,leftEye:le,rightEye:re,faceWidth:fw,faceHeight:fh,eyeWidth:eye,opaqueTop:top};
}

export function planStudioSuitGeometry({uniform,opening,face,head,suit}){
 const hf=frame(head);
 if(!validFrame(hf)||!uniform||!opening?.length)throw Error('ตำแหน่งหัวหรือชุดไม่ถูกต้อง');
 const first=opening.slice(0,Math.min(4,opening.length));
 const openingY=median(first.map(row=>row.y)),openingX=median(first.map(row=>row.centerX));
 // The upper bilateral opening is a neck anchor. The tie knot or bottom of a
 // deep V is not an anatomical landmark and must not pull the portrait down.
 const collarY=H*.55;
 const garmentScale=Math.max((W+4)/uniform.bounds.w,(H+2-collarY)/Math.max(1,(uniform.bounds.b-openingY)*Y_CALIBRATION));
 if(!Number.isFinite(garmentScale)||garmentScale<=0||uniform.bounds.w*garmentScale>W*1.45)throw Error('สัดส่วนชุดไม่เหมาะสำหรับจัดวางอัตโนมัติ');
 const garmentWidth=uniform.width*garmentScale,garmentHeight=garmentWidth*(uniform.nativeAspect||uniform.height/uniform.width)*Y_CALIBRATION;
 const garmentYScale=garmentHeight/uniform.height;
 const garmentFrame={x:W/2-openingX*garmentScale,y:collarY-openingY*garmentYScale,w:garmentWidth,h:garmentHeight};
 const headPoint=p=>({x:hf.x+p.x/face.width*hf.w,y:hf.y+p.y/face.height*hf.h});
 const chin=headPoint(face.chin),le=headPoint(face.leftEye),re=headPoint(face.rightEye),forehead=headPoint(face.forehead);
 const baselineEye=Math.hypot(re.x-le.x,re.y-le.y),baselineFaceHeight=Math.hypot(chin.x-forehead.x,chin.y-forehead.y);
 if(baselineEye<4||baselineFaceHeight<8)throw Error('สัดส่วนหัวไม่ชัดพอสำหรับจัดชุด');
 // Keep the initial master's optical head size. Outfit shoulders provide a
 // modest correction, never a cumulative multiplier from the last selection.
 const shoulderSpan=uniform.shoulderWidth*garmentScale;
 let localScale=clamp(shoulderSpan/(W*.90),.90,1.10);
 const crown=headPoint({x:face.cx,y:face.opaqueTop});
 const sourceCrownToChin=chin.y-crown.y;
 const neckGap=clamp(baselineFaceHeight*.11,24,58);
 const available=collarY-neckGap-H*.045;
 if(sourceCrownToChin>0)localScale=Math.min(localScale,available/sourceCrownToChin);
 if(!Number.isFinite(localScale)||localScale<.65||localScale>1.2)throw Error('หัวอยู่นอกกรอบที่จัดวางอัตโนมัติได้');
 const targetChin={x:W/2,y:collarY-neckGap*localScale};
 const sp=pose(suit),targetWorld=layerToScene(sp,targetChin);
 const rotation=sp.rotation-Math.atan2(re.y-le.y,re.x-le.x)*180/Math.PI;
 const scale=localScale*sp.scale*(sp.squeezeX||1);
 if(!Number.isFinite(scale)||scale<.1||scale>5)throw Error('ขนาดหัวอยู่นอกช่วงที่รองรับ');
 const radians=rotation*Math.PI/180,u=(chin.x-W/2)*scale,v=(chin.y-H/2)*scale;
 const headPose={x:targetWorld.x-W/2-u*Math.cos(radians)+v*Math.sin(radians),y:targetWorld.y-H/2-u*Math.sin(radians)-v*Math.cos(radians),scale,rotation,squeezeX:1,squeezeY:1};
 return {garmentFrame,headPose,collarAnchor:layerToScene(sp,{x:W/2,y:collarY}),chinTarget:targetWorld,shoulderSpan,localScale};
}

function remapAccessory(layer,oldSuit,newSuit){
 if(layer.locked||!['collar','chest','ribbon'].includes(kind(layer))||!oldSuit)return layer;
 const before=oldSuit.collarFrame||frame(oldSuit),after=newSuit.collarFrame||frame(newSuit),lf=frame(layer);
 if(!validFrame(before)||!validFrame(after)||!validFrame(lf))return layer;
 if(['x','y','w','h'].every(key=>before[key]===after[key])&&['x','y','scale','rotation','squeezeX','squeezeY'].every(key=>pose(oldSuit)[key]===pose(newSuit)[key]))return layer;
 const ratio=after.w/before.w,cx=after.x+(lf.x+lf.w/2-before.x)/before.w*after.w,cy=after.y+(lf.y+lf.h/2-before.y)/before.h*after.h;
 const oldPose=pose(oldSuit),newPose=pose(newSuit),p=transformedOffset(oldPose,newPose,{x:layer.x||0,y:layer.y||0});
 return {...layer,sourceFrame:{x:cx-lf.w*ratio/2,y:cy-lf.h*ratio/2,w:lf.w*ratio,h:lf.h*ratio},collarFrame:{...after},x:p.x-W/2,y:p.y-H/2,scale:(layer.scale||1)*newPose.scale/oldPose.scale,rotation:(layer.rotation||0)+newPose.rotation-oldPose.rotation,squeezeX:(layer.squeezeX??1)*newPose.squeezeX/oldPose.squeezeX,squeezeY:(layer.squeezeY??1)*newPose.squeezeY/oldPose.squeezeY};
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

export async function fitStudioSuit({layers,previousSuit,nextSuit,headSource,headMask=null,measureFace,preservePlacement=false}){
 const head=layers.find(layer=>kind(layer)==='head'&&layer.jobId);
 if(!head)return layers;
 if(head.locked||layers.some(layer=>layer.hairHeadId===head.id&&layer.locked))throw Error('ปลดล็อกเลเยอร์หัวและทรงผมก่อนจัดชุดอัตโนมัติ');
 if(!nextSuit||typeof measureFace!=='function')throw Error('ระบบจัดชุดอัตโนมัติยังไม่พร้อม');
 const [garment,portrait]=await Promise.all([garmentMeasurement(nextSuit.source),sampleSurface(headSource||head.source,headMask)]);
 const detected=await measureFace(portrait.canvas),face=Array.isArray(detected)?detected:detected?.faceLandmarks?.[0];
 const landmarks=faceMeasurement(face,portrait.width,portrait.height,portrait.pixels);
 const plan=preservePlacement?{garmentFrame:frame(nextSuit)}:planStudioSuitGeometry({uniform:garment.uniform,opening:garment.opening,face:landmarks,head,suit:nextSuit});
 if(!validFrame(plan.garmentFrame))throw Error('ตำแหน่งชุดไม่ถูกต้อง');
 const fittedHead=preservePlacement?head:{...head,...plan.headPose},fittedSuit={...nextSuit,sourceFrame:{...plan.garmentFrame},collarFrame:{...plan.garmentFrame},neckWidth:0,neckHeight:0,autoSuitFitVersion:STUDIO_SUIT_FIT_VERSION};
 const neck=measureSkinNeckProfile({pixels:portrait.pixels,width:portrait.width,height:portrait.height,face});
 if(neck.rows.length<3||neck.confidence<.25)throw Object.assign(Error('ยังวัดแนวคอให้พอดีกับชุดไม่ได้ งานเดิมยังอยู่ กรุณาตรวจสอบว่าบริเวณคอเห็นชัดเจน'),{code:'SUIT_FIT_UNCLEAR'});
 const headToUniform=pixelTransform(fittedHead,portrait,fittedSuit,garment);
 const bridge=await createStudioNeckBridge({head:fittedHead,headSource:headSource||head.source,headMask,portrait,neckProfile:neck,garment,headToUniform});
 const collar=solveAutoCollarWidth({pixels:garment.pixels,width:garment.width,height:garment.height,neckProfile:bridge.profile||neck,headToUniform,smoothTop:(nextSuit.templatePath||'').includes('/job-uniforms/')});
 fittedSuit.neckWidth=collar.confidence>=.25?clamp(collar.neckWidth,-75,75):0;
 fittedSuit.autoCollarFitWidth=fittedSuit.neckWidth;
 fittedSuit.autoCollarFitConfidence=Number(Math.max(neck.confidence||0,collar.confidence||0).toFixed(3));
 fittedSuit.autoCollarFitApplied=Boolean(bridge.layer||collar.confidence>=.25);
 const visibleHead=bridge.mask?{...fittedHead,mask:bridge.mask}:fittedHead;

 const existingBridge=layers.find(layer=>layer.kind==='neck-fit'&&layer.hairHeadId===head.id);
 const result=layers.filter(layer=>!(layer.kind==='neck-fit'&&layer.hairHeadId===head.id)).map(layer=>layer.id===head.id?visibleHead:layer.id===previousSuit?.id||layer.id===nextSuit.id?fittedSuit:remapAccessory(layer,previousSuit,fittedSuit));
 if(bridge.layer){if(result.length>=20)throw Error('เลเยอร์เต็ม 20 เลเยอร์ กรุณาลบองค์ประกอบที่ไม่ใช้ก่อนเปลี่ยนชุด');const index=result.findIndex(layer=>layer.id===head.id);result.splice(index+1,0,{...bridge.layer,id:existingBridge?.id||head.id+'-neck-fit',locked:false});}
 if(!result.some(layer=>layer.id===fittedSuit.id))result.push(fittedSuit);
 if(result.length>20)throw Error('เลเยอร์เต็ม 20 เลเยอร์ กรุณาลบองค์ประกอบที่ไม่ใช้ก่อนเปลี่ยนชุด');
 return result;
}
