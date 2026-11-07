// Baseline before immutable-result reuse, for offline equivalence tests only.
async function portraitFaceMetrics(blob){
 if(faceMetricsCache.has(blob))return faceMetricsCache.get(blob);
 const pending=(async()=>{const url=URL.createObjectURL(blob);try{
  const image=await loadImage(url),model=await getLandmarker();
  const face=model.detect(image).faceLandmarks?.[0],proportions=faceProportions(face,image.naturalWidth,image.naturalHeight);
  return proportions?{...proportions,protectedFeatures:portraitProtectedFeatures(face,image.naturalWidth,image.naturalHeight)}:null;
 }finally{URL.revokeObjectURL(url)}})();
 faceMetricsCache.set(blob,pending);pending.catch(()=>faceMetricsCache.delete(blob));return pending;
}
async function checkPortraitProportions(){}
async function portraitCompletionEvidence(blob,includeGarments=false){
 const im=await decodedPortraitImage(blob),W=im.naturalWidth,H=im.naturalHeight;
 const face=(await getLandmarker()).detect(im).faceLandmarks?.[0];
 const masks=await getV192MasterMasks(blob,im);
 if(!face?.[33]||!face?.[263]||!face?.[152]||!face?.[234]||!face?.[454]||!masks.hairMask||(includeGarments&&!masks.clothingMask))throw Object.assign(Error('ตรวจความครบถ้วนของภาพไม่สำเร็จ กรุณาลองใหม่'),{code:'portrait_finish_incomplete'});
 const lx=face[33].x*W,ly=face[33].y*H,rx=face[263].x*W,ry=face[263].y*H,d=Math.hypot(rx-lx,ry-ly);
 if(d<8)throw Object.assign(Error('ใบหน้าเล็กเกินไปสำหรับตรวจผล กรุณาใช้รูปที่เห็นใบหน้าชัด'),{code:'portrait_finish_incomplete'});
 const ex=(rx-lx)/d,ey=(ry-ly)/d,k=64/d,cx=(lx+rx)/2,cy=(ly+ry)/2;
 const normal=src=>{const c=canvasFor(256,320),ctx=c.getContext('2d');ctx.setTransform(k*ex,-k*ey,k*ey,k*ex,128-k*(ex*cx+ey*cy),144-k*(-ey*cx+ex*cy));ctx.drawImage(src,0,0);return ctx.getImageData(0,0,256,320).data};
 const normalY=point=>point?144+k*(-ey*(point.x*W-cx)+ex*(point.y*H-cy)):null;
 const normalPoint=(x,y)=>({x:128+k*(ex*(x-cx)+ey*(y-cy)),y:144+k*(-ey*(x-cx)+ex*(y-cy))});
 const evidence={pixels:normal(im),hair:normal(masks.hairMask),chinY:normalY(face[152]),faceTopY:normalY(face[10]),sourceBounds:[[0,0],[W,0],[W,H],[0,H]].map(([x,y])=>normalPoint(x,y))};
 if(includeGarments){
  const scale=Math.min(1,384/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale));
  const sample=src=>{const c=canvasFor(w,h),ctx=c.getContext('2d');ctx.drawImage(src,0,0,w,h);return ctx.getImageData(0,0,w,h).data};
  evidence.garments=inspectPortraitGarments({pixels:sample(im),clothing:sample(masks.clothingMask),width:w,height:h,chinY:face[152].y*h,faceWidth:Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h)});
 }
 return evidence;
}

const selectedHairEvidenceCache=new Map();
