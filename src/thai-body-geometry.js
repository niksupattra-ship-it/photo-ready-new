import {planThaiBodyFrame} from './thai-body-framing.js';
import {measureGovernmentShoulderGeometry} from './government-insignia-fit.js';
import {parseThaiBodyReference,THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';

export function measureThaiWholeHead({pixels,hair,width:w,height:h,face}={}){
 if(!pixels||hair?.length!==pixels.length||pixels.length!==w*h*4||![10,152,234,454].every(i=>face?.[i]&&Number.isFinite(face[i].x)&&Number.isFinite(face[i].y)))return null;
 const chin=face[152].y*h,faceWidth=Math.abs(face[454].x-face[234].x)*w,faceHeight=(face[152].y-face[10].y)*h,cx=(face[234].x+face[454].x)*w/2;
 if(faceWidth<20||faceHeight<20)return null;
 const lo=Math.max(0,Math.floor(cx-faceWidth*1.4)),hi=Math.min(w,Math.ceil(cx+faceWidth*1.4)),columns=new Uint32Array(w),rowMinimum=Math.max(4,Math.ceil(faceWidth*.12));
 let top=null;
 for(let y=0;y<=Math.min(h-1,Math.floor(chin));y++){
  let count=0;
  for(let x=lo;x<hi;x++){const i=(y*w+x)*4;if(hair[i+3]>=160&&pixels[i+3]>=160){count++;columns[x]++}}
  if(top===null&&y<face[10].y*h&&count>=rowMinimum)top=y;
 }
 if(top===null)return null;
 let left=Math.min(face[234].x,face[454].x)*w,right=Math.max(face[234].x,face[454].x)*w;
 const support=Math.max(3,Math.ceil(faceHeight*.025));
 for(let x=lo;x<hi;x++)if(columns[x]>=support){left=Math.min(left,x);right=Math.max(right,x+1)}
 return {left,right,top,bottom:chin,width:right-left,height:chin-top,centerX:(left+right)/2};
}
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
 const measured=g?.stable?g:null;
 const head=measureThaiWholeHead({pixels,hair,width:w,height:h,face});
 const crown=head?.top??null;
 return {faceToShoulder:measured?faceWidth/measured.width:null,crownRatio:crown===null?null:(eyeY-crown)/eyeToChin,neckGap:measured?(measured.top-chin.y)/measured.width:null,shoulderWidth:measured?.width,faceWidth,crownY:crown,head,headFitLimited:head?planThaiBodyFrame(pixels,w,h,{head}).headFitLimited:null,wholeHeadWidthToShoulder:head&&measured?head.width/measured.width:null,wholeHeadHeightToShoulder:head&&measured?head.height/measured.width:null};
}
export function inspectThaiBodyGeometry(metrics,{reference=null,gender='female',strict=false}={}){
 if(!metrics||!Number.isFinite(metrics.faceToShoulder))return {action:'review',reason:'body_geometry_unmeasurable'};
 const p=parseThaiBodyReference(reference,{strict}),ratio=metrics.faceToShoulder;
 if(strict&&(!Number.isFinite(metrics.wholeHeadWidthToShoulder)||!Number.isFinite(metrics.wholeHeadHeightToShoulder)||!Number.isFinite(metrics.neckGap)||typeof metrics.headFitLimited!=='boolean'))return {action:'review',reason:'whole_head_unmeasurable',metrics};
 if(strict&&metrics.headFitLimited)return {action:'reject',reason:'portrait_framing_conflict',metrics};
 if(Number.isFinite(metrics.wholeHeadWidthToShoulder)&&metrics.wholeHeadWidthToShoulder>(strict ? .50 : .58)||Number.isFinite(metrics.wholeHeadHeightToShoulder)&&metrics.wholeHeadHeightToShoulder>(strict ? .62 : .72))return {action:'reject',reason:'whole_head_too_large',metrics};
 if(p&&['wholeHeadWidthToShoulder','wholeHeadHeightToShoulder'].some(k=>Number.isFinite(p[k])&&Number.isFinite(metrics[k])&&metrics[k]>p[k]*1.10))return {action:'reject',reason:'whole_head_size_changed',metrics};
 if(Number.isFinite(metrics.neckGap)&&metrics.neckGap>(strict ? .13 : .18))return {action:'reject',reason:'head_body_join_changed',metrics};

 if(ratio>(strict ? .365 : .405)||ratio<.265)return {action:'reject',reason:'head_body_size_changed',metrics};
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
 const strict=result?.idpromBodyGeometryVersion===THAI_BODY_GEOMETRY_VERSION;
 const check=inspectThaiBodyGeometry(metrics,{reference,gender,strict});
 if(check.action==='reject'||(strict&&check.action==='review')){
  const error=Error('ระบบยังจัดสัดส่วนศีรษะกับลำตัวให้พอดีไม่ได้ · เก็บรูปเดิมไว้');
  error.code='face_proportion_changed';error.geometryReason=check.reason;throw error;
 }
 if(check.action==='review')result.idpromQualityReviewNeeded=true;
 result.idpromBodyGeometryAccepted=true;
 return check;
}
