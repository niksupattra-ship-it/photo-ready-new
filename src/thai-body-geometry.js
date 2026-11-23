import {measureGovernmentShoulderGeometry} from './government-insignia-fit.js';
import {parseThaiBodyReference,THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
// Geometry evidence only. No pixel writes, fitting/warping or provider calls.
export function thaiBodyGeometry({pixels,hair,clothing,width:w,height:h,face}={}){
 if(!pixels||pixels.length!==w*h*4||![10,33,263,152,234,454].every(i=>face?.[i]&&Number.isFinite(face[i].x)&&Number.isFinite(face[i].y)))return null;
 const p=i=>({x:face[i].x*w,y:face[i].y*h}),a=p(234),b=p(454),l=p(33),r=p(263),chin=p(152),forehead=p(10),faceWidth=Math.hypot(b.x-a.x,b.y-a.y),eyeY=(l.y+r.y)/2,cx=(l.x+r.x)/2,eyeToChin=chin.y-eyeY;
 if(faceWidth<20||eyeToChin<15||Math.abs(l.y-r.y)>eyeToChin*.20)return null;
 let garment=null;
 if(clothing?.length===pixels.length){
  const visible=new Uint8ClampedArray(clothing);
  for(let i=3;i<visible.length;i+=4)visible[i]=Math.round(visible[i]*pixels[i]/255);
  garment=measureGovernmentShoulderGeometry({data:visible,width:w,height:h});
 }
 const g=garment?.stable?garment:measureGovernmentShoulderGeometry({data:pixels,width:w,height:h});
 if(!g||!g.stable)return null;
 let crown=null;
 if(hair?.length===pixels.length){
  const x0=Math.max(0,Math.floor(cx-faceWidth*.6)),x1=Math.min(w,Math.ceil(cx+faceWidth*.6)),minimum=Math.max(4,Math.ceil(faceWidth*.12));
  for(let y=0;y<Math.min(h,forehead.y);y++){
   let count=0;for(let x=x0;x<x1;x++){const i=(y*w+x)*4;if(hair[i+3]>160&&pixels[i+3]>160)count++}
   if(count>=minimum){crown=y;break}
  }
 }
 return {faceToShoulder:faceWidth/g.width,crownRatio:crown===null?null:(eyeY-crown)/eyeToChin,neckGap:(g.top-chin.y)/g.width,shoulderWidth:g.width,faceWidth,crownY:crown};
}
export function inspectThaiBodyGeometry(metrics,{reference=null,gender='female'}={}){
 if(!metrics||!Number.isFinite(metrics.faceToShoulder))return {action:'review',reason:'body_geometry_unmeasurable'};
 const p=parseThaiBodyReference(reference),ratio=metrics.faceToShoulder;
 if(ratio>.405||ratio<.265)return {action:'reject',reason:'head_body_size_changed',metrics};
 if(p&&Math.abs(ratio/p.faceToShoulder-1)>.08)return {action:'reject',reason:'head_body_size_changed',metrics};
 if(gender==='female'&&Number.isFinite(metrics.crownRatio)){
  if(metrics.crownRatio>1.4||(p&&metrics.crownRatio>p.crownRatio*1.12&&metrics.crownRatio-p.crownRatio>.10))return {action:'reject',reason:'excessive_crown_height',metrics};
 }else if(gender==='female')return {action:'review',reason:'crown_unmeasurable',metrics};
 if(p&&Number.isFinite(metrics.neckGap)&&Math.abs(metrics.neckGap-p.neckGap)>.05)return {action:'reject',reason:'head_body_join_changed',metrics};
 return {action:'accept',reason:'body_geometry_preserved',metrics};
}

export async function checkNewThaiBodyGeometry({result,reused=false,reference=null,gender='female',measure}){
 if((reused||result?.idpromReused)&&(result?.idpromBodyGeometryVersion!==THAI_BODY_GEOMETRY_VERSION||result?.idpromBodyGeometryAccepted))return {action:'cached',reason:'accepted_pixels_unchanged'};
 let metrics=null;try{metrics=await measure(result)}catch{}
 const check=inspectThaiBodyGeometry(metrics,{reference,gender});
 if(check.action==='reject'){
  const error=Error('ประมวลผลไม่สำเร็จ กรุณาตรวจสอบรูปหน้าตรงหรือเปลี่ยนรูป');
  error.code='face_proportion_changed';error.geometryReason=check.reason;throw error;
 }
 if(check.action==='review')result.idpromQualityReviewNeeded=true;
 result.idpromBodyGeometryAccepted=true;
 return check;
}
