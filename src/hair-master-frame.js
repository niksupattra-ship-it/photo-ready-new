// Fit native AI masters by eye anchors with ONE isotropic scale, never an old
// image rectangle. Only placement metadata changes; no facial pixels are warped.
export function fitHairMasterFrame(lock,oldMaster,newMaster){
 const anchors=master=>{
  const {width:w,height:h,face}=master;
  if(![w,h].every(v=>Number.isFinite(v)&&v>0))throw Error('ขนาดภาพทรงผมไม่ถูกต้อง');
  const a=face?.[33],b=face?.[263],chin=face?.[152],left=face?.[234],right=face?.[454];
  if(![a,b,chin,left,right].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))throw Error('ตรวจตำแหน่งใบหน้าในทรงผมใหม่ไม่สำเร็จ · เก็บงานเดิมไว้');
  const eye=Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
  if(eye<12)throw Error('ใบหน้าเล็กเกินไปสำหรับจัดตำแหน่งทรงผม');
  return {eye,x:(a.x+b.x)*w/2,y:(a.y+b.y)*h/2,chinY:chin.y*h,faceCX:(left.x+right.x)*w/2,faceWidth:Math.hypot((left.x-right.x)*w,(left.y-right.y)*h)};
 };
 if(!lock||![lock.scale,lock.hX,lock.hY].every(Number.isFinite)||lock.scale<=0)throw Error('ตำแหน่งภาพเดิมไม่ถูกต้อง');
 const a=anchors(oldMaster),b=anchors(newMaster),scale=lock.scale*a.eye/b.eye;
 return {...lock,headW:newMaster.width,headH:newMaster.height,scale,hX:lock.hX+a.x*lock.scale-b.x*scale,hY:lock.hY+a.y*lock.scale-b.y*scale,chinY:b.chinY,faceCX:b.faceCX,placedFaceW:b.faceWidth*scale};
}
