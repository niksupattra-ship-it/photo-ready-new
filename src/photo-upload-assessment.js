// Upload suitability uses the face itself. A tight crop/zoom is not evidence
// of a close-distance wide-angle selfie. Do not require any torso coverage.
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const planarDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function assessCloseSelfiePerspective(face){
 // MediaPipe normalized Z is relative to face width. It is an estimate,
 // not a measured camera distance or proof of altered anatomy.
 const needed=[1,4,33,263,234,454];
 if(!needed.every(i=>finitePoint(face?.[i])))return {status:'unknown'};
 const eyes=planarDistance(face[33],face[263]);
 const cheeks=planarDistance(face[234],face[454]);
 if(eyes<.025||cheeks<eyes)return {status:'unknown'};
 const sideToEye=cheeks/eyes;
 const nose=face[4],left=face[234],right=face[454];
 const zOkay=[nose.z,left.z,right.z].every(Number.isFinite);
 if(!zOkay)return {status:'unknown'};
 const protrusion=((left.z+right.z)/2-nose.z)/eyes;
 // Both independent signals must agree. Natural facial variability and
 // approximate monocular depth make a single metric unreliable.
 if(protrusion>1.15&&sideToEye<1.50)return {status:'extreme',sideToEye,protrusion};
 if(protrusion>.83&&sideToEye<1.70)return {status:'suspected',sideToEye,protrusion};
 return {status:'normal',sideToEye,protrusion};
}

// Landmarks only: never crop/rescale/warp the upload or change the face.
// 'uncertain' is advisory and can be deliberately continued in the UI.
export function assessUploadPortrait({faces=[],pose=[]}={}){
 const issues=[],uncertain=[];
 if(faces.length!==1)return {status:'reject',issues:[faces.length?'พบมากกว่าหนึ่งใบหน้า กรุณาใช้รูปที่มีคุณคนเดียว':'ยังไม่พบใบหน้าชัดเจน กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าครบ'],uncertain};
 const face=faces[0],visiblePoints=face.filter(finitePoint);
 if(visiblePoints.length!==face.length||!visiblePoints.length)return {status:'uncertain',issues:[],uncertain:['ยังวัดกรอบหน้าไม่ได้ชัดเจน']};
 const xs=face.map(p=>p.x),ys=face.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),height=bottom-top,width=right-left;
 if(height<=0||width<=0)return {status:'uncertain',issues:[],uncertain:['ยังวัดกรอบหน้าไม่ได้ชัดเจน']};
 if(left<.008||right>.992||top<.008||bottom>.992)issues.push('ใบหน้าชิดหรือล้นขอบภาพ กรุณาเลือกรูปที่เห็นใบหน้าครบ');
 const perspective=assessCloseSelfiePerspective(face);
 if(perspective.status==='extreme')uncertain.push('ใบหน้าอาจผิดสัดส่วนจากกล้องเซลฟีที่ใกล้มาก แนะนำให้ถ่ายใหม่โดยถอยกล้องออก');
 else if(perspective.status==='suspected')uncertain.push('มุมกล้องอาจทำให้ใบหน้าไม่สมส่วน แนะนำใช้รูปที่ถ่ายไกลขึ้น');
 const a=pose[11],b=pose[12];
 const visible=p=>finitePoint(p)&&(p.visibility??0)>=.35;
 if(visible(a)&&visible(b)){
  const shoulderLeft=Math.min(a.x,b.x),shoulderRight=Math.max(a.x,b.x),span=shoulderRight-shoulderLeft;
  // Cropped shoulders are permitted: selected suit supplies the body.
  // Warn only for clear pose disagreement, not image-edge cropping.
  if(span<width*.85)uncertain.push('มุมลำตัวหรือไหล่อาจเอียง แนะนำรูปหันตรง');
 }
 // No pose at all is allowed with a visible complete face; a zoom crop is valid.
 return {status:issues.length?'reject':uncertain.length?'uncertain':'pass',issues:[...new Set(issues)],uncertain:[...new Set(uncertain)]};
}
