// Normalized landmark evidence only; no pixels, identity, or server requests.
// Require face, neck connection, shoulders and upper-chest framing.
// Hair above the face, arm margins, elbows, wrists and hips are not gates.
export function assessUploadPortrait({faces=[],pose=[]}={}){
 const issues=[],uncertain=[];
 if(faces.length!==1)return {status:'reject',issues:[faces.length?'พบมากกว่าหนึ่งใบหน้า กรุณาใช้รูปที่มีคุณคนเดียว':'ยังไม่พบใบหน้าชัดเจน กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าครบ'],uncertain};
 const face=faces[0],xs=face.map(p=>p.x),ys=face.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),height=bottom-top,width=right-left;
 if(![left,right,top,bottom].every(Number.isFinite)||height<=0||width<=0)return {status:'uncertain',issues:[],uncertain:['ยังวัดกรอบหน้าไม่ได้ชัดเจน']};
 if(left<.008||right>.992||top<.008||bottom>.992)issues.push('ใบหน้าชิดหรือล้นขอบภาพ กรุณาเลือกรูปที่เห็นใบหน้าครบ');
 const a=pose[11],b=pose[12];
 const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>=.35;
 if(!visible(a)||!visible(b))uncertain.push('ยังยืนยันไหล่ทั้งสองข้างไม่ได้ แนะนำรูปที่เห็นหัว คอ ไหล่ และช่วงอกชัดเจน');
 else{
  const shoulderLeft=Math.min(a.x,b.x),shoulderRight=Math.max(a.x,b.x),shoulderY=(a.y+b.y)/2,span=shoulderRight-shoulderLeft;
  // A tight crop can move a confident shoulder point slightly past the
  // border (measured -3.4% on a complete shoulder); allow 5% localization error.
  if(shoulderLeft<-.05||shoulderRight>1.05||a.y<0||b.y<0||a.y>1||b.y>1)issues.push('ไหล่บางส่วนอยู่นอกภาพ กรุณาใช้รูปที่เห็นไหล่ทั้งสองข้าง');
  if(span<width*1.05)uncertain.push('มุมลำตัวหรือไหล่ยังไม่ชัด แนะนำรูปหันตรง');
  // Standing collars can cover the neck skin. Measure the anatomical
  // chin-to-shoulder connection, never require a bare-skin neck patch.
  if(shoulderY<bottom-height*.12)uncertain.push('ยังยืนยันช่วงต่อคอและไหล่ไม่ได้ชัดเจน');
  // Require a short upper-chest margin below both shoulders; arms and mid-chest are unnecessary.
  if(1-Math.max(a.y,b.y)<Math.max(.05,height*.25,span*.10))issues.push('ภาพตัดสูงเกินไป กรุณาใช้รูปที่เห็นถึงอกบน');
 }
 return {status:issues.length?'reject':uncertain.length?'uncertain':'pass',issues:[...new Set(issues)],uncertain};
}
