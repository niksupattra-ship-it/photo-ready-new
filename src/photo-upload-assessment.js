// Upload suitability uses the face itself. A tight crop/zoom is not evidence
// of a close-distance wide-angle selfie. Do not require any torso coverage.
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const planarDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function assessCloseSelfiePerspective(face){
 // Diagnostic only: not used to approve or reject uploads. MediaPipe Z is
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
 // Close camera distance or apparent nose depth is not a valid automatic
 // rejection criterion. Perspective cannot be inferred reliably from one face.
 // Use only clearly observable pose; a zoom crop with straight face passes.
 const le=face[33],re=face[263],nose=face[1],chin=face[152];
 if([le,re,nose,chin].every(finitePoint)){
  const eyeDistance=planarDistance(le,re);
  if(eyeDistance>.03){
   const roll=Math.abs(re.y-le.y)/eyeDistance;
   const noseOffset=Math.abs(nose.x-(le.x+re.x)/2)/eyeDistance;
   // Large measured tilt/turn is advisory, not a camera-distance judgment.
   if(roll>.32&&noseOffset>.30)
    uncertain.push('ใบหน้าอาจเอียงหรือหันข้างมาก กรุณาตรวจว่าหน้าตรงก่อนใช้รูป');
  }
 }

 // No pose at all is allowed with a visible complete face; a zoom crop is valid.
 return {status:issues.length?'reject':uncertain.length?'uncertain':'pass',issues:[...new Set(issues)],uncertain:[...new Set(uncertain)]};
}
