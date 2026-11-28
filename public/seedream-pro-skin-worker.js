// Classic worker: the pinned MediaPipe WASM loader needs importScripts.
const tone=import('./seedream-pro-skin-tone.js');
const root='/assets/vision/mediapipe-1.0.1';let models,queue=Promise.resolve();const portraits=new Map();
async function loadModels(){
 if(!models)models=(async()=>{
  const {FilesetResolver,ImageSegmenter,FaceLandmarker}=await import(root+'/vision_bundle.mjs');
  const vision=await FilesetResolver.forVisionTasks(root+'/wasm');
  let segmenter;try{segmenter=await ImageSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:root+'/selfie_multiclass_256x256.tflite'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});
  const face=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:root+'/face_landmarker.task'},runningMode:'IMAGE',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5});
  return {segmenter,face};}catch(error){segmenter?.close?.();throw error;}
 })().catch(error=>{models=null;throw error});return models;
}
const make=(w,h)=>new OffscreenCanvas(w,h);
const features=[
 [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
 [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398],
 [70,63,105,66,107,55,65,52,53,46],
 [336,296,334,293,300,276,283,282,295,285],
 [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185]
];
async function prepare(id,blob){
 if(portraits.has(id))return;
 const {segmenter,face}=await loadModels(),bitmap=await createImageBitmap(blob),w=bitmap.width,h=bitmap.height;
 if(w*h>6000000){bitmap.close();throw Error('ภาพใหญ่เกินสำหรับปรับผิว');}
 const original=make(w,h),ctx=original.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close();
 const scale=Math.min(1,720/w,960/h),detection=make(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));detection.getContext('2d').drawImage(original,0,0,detection.width,detection.height);
 const landmarks=face.detect(detection).faceLandmarks?.[0];if(!landmarks)throw Error('ตรวจผิวหน้าไม่สำเร็จ ภาพต้นฉบับยังอยู่');
 const result=segmenter.segment(detection);let small;
 try{
  const masks=result.confidenceMasks;if(!masks?.[2]||!masks?.[3])throw Error('ตรวจขอบเขตผิวไม่สำเร็จ');
  const mw=masks[2].width,mh=masks[2].height,body=masks[2].getAsFloat32Array(),skin=masks[3].getAsFloat32Array();small=make(mw,mh);const sc=small.getContext('2d'),im=sc.createImageData(mw,mh);
  for(let n=0;n<body.length;n++){const probability=Math.min(1,body[n]+skin[n]),weight=Math.max(0,Math.min(1,(probability-.45)/.45));im.data[n*4]=255;im.data[n*4+1]=255;im.data[n*4+2]=255;im.data[n*4+3]=Math.round(weight*255);}sc.putImageData(im,0,0);
 }finally{result.close();}
 const maskCanvas=make(w,h),mc=maskCanvas.getContext('2d',{willReadFrequently:true});
 // Blur only the selection weights. The portrait RGB is never blurred.
 mc.filter=`blur(${Math.max(1,w*.003)}px)`;mc.drawImage(small,0,0,w,h);mc.filter='none';
 const exclusion=make(w,h),ec=exclusion.getContext('2d');ec.fillStyle='white';ec.strokeStyle='white';ec.lineWidth=Math.max(2,w*.008);ec.lineJoin='round';
 for(const indices of features){ec.beginPath();indices.forEach((index,n)=>{const p=landmarks[index];n?ec.lineTo(p.x*w,p.y*h):ec.moveTo(p.x*w,p.y*h)});ec.closePath();ec.fill();ec.stroke();}
 const feather=make(w,h),fc=feather.getContext('2d');fc.filter=`blur(${Math.max(1,w*.003)}px)`;fc.drawImage(exclusion,0,0);fc.filter='none';fc.drawImage(exclusion,0,0);
 const selected=mc.getImageData(0,0,w,h).data,protectedPixels=fc.getImageData(0,0,w,h).data,mask=new Float32Array(w*h),source=ctx.getImageData(0,0,w,h).data;
 let selectedCount=0;
 for(let n=0;n<mask.length;n++){
  const i=n*4,r=source[i],g=source[i+1],b=source[i+2];
  // Avoid pale clothing/background spill and dark hair at uncertain edges.
  const chroma=Math.max(r,g,b)-Math.min(r,g,b),warm=r>=g-6&&r>b-4,chromaWeight=Math.min(1,Math.max(0,(chroma-3)/12));
  mask[n]=warm?selected[i+3]/255*(1-protectedPixels[i+3]/255)*chromaWeight:0;if(mask[n]>.2)selectedCount++;
 }
 if(selectedCount<mask.length*.003)throw Error('ตรวจผิวไม่ชัดพอ ภาพต้นฉบับยังอยู่');
 if(portraits.size>=2)portraits.delete(portraits.keys().next().value);
 portraits.set(id,{w,h,source,mask});
}
async function handle({requestId,kind,id,blob,amount,mode}){
 try{
  if(kind==='forget'){portraits.delete(id);return;}
  await prepare(id,blob);
  if(kind==='prepare'){self.postMessage({requestId,ok:true});return;}
  const {w,h,source,mask}=portraits.get(id),canvas=make(w,h),ctx=canvas.getContext('2d');const {liftSkinPixels,adjustStudioLightPixels}=await tone;const pixels=mode==='studio-light'?adjustStudioLightPixels(source,mask,amount):liftSkinPixels(source,mask,amount);ctx.putImageData(new ImageData(pixels,w,h),0,0);
  const output=await canvas.convertToBlob({type:'image/png'});self.postMessage({requestId,ok:true,blob:output});
 }catch(error){self.postMessage({requestId,ok:false,error:/^(ตรวจ|ภาพใหญ่)/.test(error.message||'')?error.message:'ปรับผิวไม่พร้อม ภาพต้นฉบับยังอยู่'});}
}
self.onmessage=event=>{queue=queue.then(()=>handle(event.data)).catch(()=>{});};
