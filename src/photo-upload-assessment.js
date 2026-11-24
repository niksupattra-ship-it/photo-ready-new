// Normalized landmark evidence only; no pixels, identity, or server requests.
// Elbows/wrists/hips are deliberately optional for an upper-body ID portrait.
export function assessUploadPortrait({faces=[],pose=[],crownTouchesEdge=false}={}){
 const issues=[],uncertain=[];
 if(faces.length!==1)return {status:'reject',issues:[faces.length?'พบมากกว่าหนึ่งใบหน้า กรุณาใช้รูปที่มีคุณคนเดียว':'ยังไม่พบใบหน้าชัดเจน กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าครบ'],uncertain};
 const face=faces[0],xs=face.map(p=>p.x),ys=face.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),height=bottom-top,width=right-left;
 if(![left,right,top,bottom].every(Number.isFinite)||height<=0||width<=0)return {status:'uncertain',issues:[],uncertain:['ยังวัดกรอบหน้าไม่ได้ชัดเจน']};
 if(left<.008||right>.992||top<.008||bottom>.992)issues.push('ใบหน้าชิดหรือล้นขอบภาพ กรุณาเลือกรูปที่เห็นศีรษะครบ');
 if(crownTouchesEdge)issues.push('ยอดศีรษะหรือผมถูกตัดขอบบน กรุณาเว้นพื้นที่เหนือผม');
 const a=pose[11],b=pose[12];
 const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>=.65;
 if(!visible(a)||!visible(b))uncertain.push('ยังยืนยันไหล่ทั้งสองข้างไม่ได้ แนะนำรูปที่เห็นหัว คอ ไหล่ และช่วงอกชัดเจน');
 else{
  const shoulderLeft=Math.min(a.x,b.x),shoulderRight=Math.max(a.x,b.x),shoulderY=(a.y+b.y)/2,span=shoulderRight-shoulderLeft;
  if(shoulderLeft<.02||shoulderRight>.98||a.y<0||b.y<0||a.y>1||b.y>1)issues.push('ไหล่บางส่วนอยู่นอกภาพ กรุณาใช้รูปที่เห็นไหล่ทั้งสองข้าง');
  if(span<width*1.05)uncertain.push('มุมลำตัวหรือไหล่ยังไม่ชัด แนะนำรูปหันตรง');
  // Standing collars can cover the neck skin. Measure the anatomical
  // chin-to-shoulder connection, never require a bare-skin neck patch.
  if(shoulderY<bottom-height*.12)uncertain.push('ยังยืนยันช่วงต่อคอและไหล่ไม่ได้ชัดเจน');
  if(1-Math.max(a.y,b.y)<height*.5)issues.push('ภาพตัดสูงเกินไป กรุณาให้เห็นต้นแขนและลำตัวถึงช่วงอก');
  if(shoulderLeft<span*.06||1-shoulderRight<span*.06)issues.push('พื้นที่ข้างไหล่แคบเกินไป กรุณาให้เห็นต้นแขนทั้งสองข้างเพิ่ม');
 }
 return {status:issues.length?'reject':uncertain.length?'uncertain':'pass',issues:[...new Set(issues)],uncertain};
}
