import {parseStudioSkinEvidence} from './studio-skin-treatment.js';

export const STUDIO_REFERENCE_QUALITY_MESSAGE='ภาพต้นฉบับมีรายละเอียดใบหน้าไม่พอ กรุณาใช้รูปที่คมชัดและเห็นใบหน้าสว่างพอดี';
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
const invalid=()=>Object.assign(Error('ข้อมูลพื้นที่ผิวไม่ตรงกับรูปต้นฉบับ กรุณาลองใหม่'),{status:400,code:'studio_skin_evidence_invalid'});
function inside(x,y,points){
 let hit=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
function reject(reason,report){
 report.status='rejected';report.reason=reason;
 throw Object.assign(Error(STUDIO_REFERENCE_QUALITY_MESSAGE),{status:422,code:'portrait_source_quality',qualityReason:reason,qualityReport:report});
}

// This gate detects missing source information, not a person's complexion or
// whether the source illumination already resembles the desired studio style.
// Landmarks/geometry must already be measured from the exact oriented input.
export function assertStudioReferenceInputQuality({pixels,width:W,height:H,evidence}={}){
 const e=parseStudioSkinEvidence(evidence);
 if(W!==e.width||H!==e.height||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4)throw invalid();
 const point=id=>[e.face[id][0]*W,e.face[id][1]*H],oval=OVAL.map(point);
 const a=point(234),b=point(454),faceWidth=Math.hypot(b[0]-a[0],b[1]-a[1]);
 const report={version:'studio-reference-quality-v1',status:'accepted',nativeFaceWidth:faceWidth,analysisWidth:0,analysisHeight:0,faceSamples:0,visibleFaceSamples:0,criticalSamples:0,blackFraction:0,whiteFraction:0,criticalBlackFraction:0,criticalWhiteFraction:0};
 if(faceWidth<96)reject('face-too-small',report);
 const x0=clamp(Math.floor(Math.min(...oval.map(p=>p[0]))),0,W),x1=clamp(Math.ceil(Math.max(...oval.map(p=>p[0]))),0,W);
 const y0=clamp(Math.floor(Math.min(...oval.map(p=>p[1]))),0,H),y1=clamp(Math.ceil(Math.max(...oval.map(p=>p[1]))),0,H);
 if(x1<=x0||y1<=y0)reject('face-pixels-missing',report);
 const scale=Math.min(1,256/Math.max(x1-x0,y1-y0)),w=Math.max(1,Math.ceil((x1-x0)*scale)),h=Math.max(1,Math.ceil((y1-y0)*scale));
 report.analysisWidth=w;report.analysisHeight=h;
 const midpoint=(left,right)=>{const p=point(left),q=point(right);return [(p[0]+q[0])/2,(p[1]+q[1])/2]};
 const p=point(33),q=point(263),eyeDistance=Math.hypot(q[0]-p[0],q[1]-p[1]);
 const detailRadius=Math.max(3,eyeDistance*.10),details=[midpoint(33,133),midpoint(263,362),point(1),midpoint(61,291)];
 let black=0,white=0,criticalBlack=0,criticalWhite=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const ix=clamp(Math.floor(x0+(x+.5)*(x1-x0)/w),0,W-1),iy=clamp(Math.floor(y0+(y+.5)*(y1-y0)/h),0,H-1),px=ix+.5,py=iy+.5;
  if(!inside(px,py,oval))continue;
  report.faceSamples++;
  const k=(iy*W+ix)*4;
  if(pixels[k+3]<32)continue;
  report.visibleFaceSamples++;
  const r=pixels[k],g=pixels[k+1],bb=pixels[k+2],isBlack=Math.max(r,g,bb)<=8&&luma(r,g,bb)<=5,isWhite=Math.min(r,g,bb)>=250;
  if(isBlack)black++;if(isWhite)white++;
  if(details.some(d=>(px-d[0])**2+(py-d[1])**2<=detailRadius**2)){
   report.criticalSamples++;if(isBlack)criticalBlack++;if(isWhite)criticalWhite++;
  }
 }
 if(report.visibleFaceSamples<16||report.visibleFaceSamples<report.faceSamples*.20)reject('face-pixels-missing',report);
 report.blackFraction=black/report.visibleFaceSamples;report.whiteFraction=white/report.visibleFaceSamples;
 // Tiny or clipped detail windows cannot claim to supply more information
 // than the face itself. This fallback also keeps off-frame geometry bounded.
 const criticalCount=report.criticalSamples;
 report.criticalBlackFraction=criticalCount>=12?criticalBlack/criticalCount:report.blackFraction;
 report.criticalWhiteFraction=criticalCount>=12?criticalWhite/criticalCount:report.whiteFraction;
 if(report.blackFraction>=.55&&report.criticalBlackFraction>=.65)reject('face-black-clipped',report);
 if(report.whiteFraction>=.65&&report.criticalWhiteFraction>=.65)reject('face-white-clipped',report);
 if(report.blackFraction+report.whiteFraction>=.88&&report.criticalBlackFraction+report.criticalWhiteFraction>=.85)reject('face-details-clipped',report);
 return report;
}
