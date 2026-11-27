// Classic worker: MediaPipe's pinned WASM loader uses importScripts.
const root='/assets/vision/mediapipe-1.0.1';
let model;
const outline=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
self.onmessage=async({data:{blob,evidenceOnly=false}})=>{
 let bitmap;
 try{
  model??=(async()=>{const {FilesetResolver,FaceLandmarker}=await import(root+'/vision_bundle.mjs');return FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(root+'/wasm'),{baseOptions:{modelAssetPath:root+'/face_landmarker.task'},runningMode:'IMAGE',numFaces:2,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6});})();
  const face=await model;bitmap=await createImageBitmap(blob);const w=bitmap.width,h=bitmap.height;
  if(w*h>33554432)throw Error('รูปใหญ่เกินไป กรุณาใช้รูปไม่เกิน 32 ล้านพิกเซล');
  const k=Math.min(1,960/w,960/h),small=new OffscreenCanvas(Math.round(w*k),Math.round(h*k));small.getContext('2d').drawImage(bitmap,0,0,small.width,small.height);
  const faces=face.detect(small).faceLandmarks;if(faces?.length!==1)throw Error('กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าคนเดียวชัดเจน');
  if(evidenceOnly){const {captureFemaleFaceEvidence}=await import('/api/female-production-lab/face-contract.js');self.postMessage({evidence:captureFemaleFaceEvidence(faces[0],w,h)});return;}
  const points=faces[0].map(p=>({x:p.x*w,y:p.y*h})),left=points[33],right=points[263],angle=Math.atan2(right.y-left.y,right.x-left.x);
  const c=Math.cos(-angle),s=Math.sin(-angle),mid={x:(left.x+right.x)/2,y:(left.y+right.y)/2};
  const rotate=p=>({x:c*(p.x-mid.x)-s*(p.y-mid.y),y:s*(p.x-mid.x)+c*(p.y-mid.y)});
  const nose=rotate(points[1]),chin=rotate(points[152]),a=rotate(points[234]),b=rotate(points[454]),faceWidth=b.x-a.x;
  if(faceWidth<80||Math.abs(nose.x-(a.x+b.x)/2)>faceWidth*.18||nose.y/Math.max(1,chin.y)<.23||nose.y/Math.max(1,chin.y)>.70)throw Error('รูปหัน ก้ม หรือเงยมากเกินไป กรุณาใช้รูปหน้าตรง');
  const polygon=outline.map(i=>rotate(points[i])),xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
  const q=Math.min(1,1200/(maxX-minX),1500/(maxY-minY)),pad=3,canvas=new OffscreenCanvas(Math.ceil((maxX-minX)*q)+pad*2,Math.ceil((maxY-minY)*q)+pad*2),ctx=canvas.getContext('2d');
  ctx.translate(pad-minX*q,pad-minY*q);ctx.scale(q,q);ctx.rotate(-angle);ctx.drawImage(bitmap,-mid.x,-mid.y);ctx.resetTransform();
  const mask=new OffscreenCanvas(canvas.width,canvas.height),mc=mask.getContext('2d');mc.fillStyle='white';mc.beginPath();polygon.forEach((p,i)=>i?mc.lineTo((p.x-minX)*q+pad,(p.y-minY)*q+pad):mc.moveTo((p.x-minX)*q+pad,(p.y-minY)*q+pad));mc.closePath();mc.fill();
  ctx.globalCompositeOperation='destination-in';ctx.filter='blur(0.7px)';ctx.drawImage(mask,0,0);
  self.postMessage({blob:await canvas.convertToBlob({type:'image/png'})});
 }catch(error){self.postMessage({error:error.message||'ตรวจใบหน้าไม่สำเร็จ กรุณาเปลี่ยนรูป'});}finally{bitmap?.close();}
};
