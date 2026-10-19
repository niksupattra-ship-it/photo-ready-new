// Fit native AI masters by eye scale and a fixed chin/collar anchor, never an old
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
 const a=anchors(oldMaster),b=anchors(newMaster);
 // Keep the first processed eye size and chin-to-collar spacing across styles.
 // No neck warp, extra skin, shoulder edit or change to the lower cutout boundary.
 const eyeSize=lock.hairFitEyeSize??lock.scale*a.eye;
 const eyeCentreX=lock.hairFitEyeCentreX??lock.hX+a.x*lock.scale;
 const chinAnchorY=lock.hairFitChinAnchorY??lock.hY+a.chinY*lock.scale;
 if(![eyeSize,eyeCentreX,chinAnchorY].every(Number.isFinite)||eyeSize<=0)throw Error('จุดอ้างอิงคอเดิมไม่ถูกต้อง');
 const scale=eyeSize/b.eye;
 return {...lock,headW:newMaster.width,headH:newMaster.height,scale,hX:eyeCentreX-b.x*scale,hY:chinAnchorY-b.chinY*scale,hairFitEyeSize:eyeSize,hairFitEyeCentreX:eyeCentreX,hairFitChinAnchorY:chinAnchorY,chinY:b.chinY,faceCX:b.faceCX,placedFaceW:b.faceWidth*scale};
}
