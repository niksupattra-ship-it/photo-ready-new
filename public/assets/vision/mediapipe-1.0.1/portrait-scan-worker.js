// Classic worker: MediaPipe's WASM loader requires importScripts. Never run its
// synchronous detect/initialization on the UI thread. No photos leave this worker.
self.onmessage=async({data})=>{
 let face,pose,result;
 const progress=(value,label)=>self.postMessage({type:'progress',value,label});
 try{
  const root='/assets/vision/mediapipe-1.0.1',runtime=await import(root+'/vision_bundle.mjs');
  progress(15,'เตรียมเครื่องมือตรวจภาพ');
  const files=await runtime.FilesetResolver.forVisionTasks(root+'/wasm');
  const canvas=new OffscreenCanvas(data.bitmap.width,data.bitmap.height);canvas.getContext('2d').drawImage(data.bitmap,0,0);data.bitmap.close();
  const make=async(Type,path,extra)=>{
   const options={baseOptions:{modelAssetPath:root+'/'+path},runningMode:'IMAGE',...extra};
   try{return await Type.createFromOptions(files,options)}catch{
    return Type.createFromOptions({wasmLoaderPath:root+'/wasm/vision_wasm_nosimd_internal.js',wasmBinaryPath:root+'/wasm/vision_wasm_nosimd_internal.wasm'},options);
   }
  };
  progress(25,'กำลังโหลดเครื่องมือตรวจใบหน้า');
  face=await make(runtime.FaceLandmarker,'face_landmarker.task',{numFaces:2,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5});
  progress(45,'กำลังตรวจศีรษะและใบหน้า');
  const faces=face.detect(canvas).faceLandmarks||[];face.close();face=null;
  if(faces.length!==1){self.postMessage({type:'result',evidence:{faces}});return}
  progress(55,'กำลังโหลดเครื่องมือตรวจลำตัว');
  pose=await make(runtime.PoseLandmarker,'pose_landmarker_lite.task',{numPoses:1,outputSegmentationMasks:true,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5});
  progress(80,'กำลังตรวจคอ ไหล่ ต้นแขน และช่วงอก');
  result=pose.detect(canvas);
  const mask=result.segmentationMasks?.[0];let crownTouchesEdge=false;
  if(mask){const pixels=mask.getAsFloat32Array(),xs=faces[0].map(p=>p.x),lo=Math.max(0,Math.floor((Math.min(...xs)-.04)*mask.width)),hi=Math.min(mask.width,Math.ceil((Math.max(...xs)+.04)*mask.width));let hit=0;for(let x=lo;x<hi;x++)if(pixels[x]>.75)hit++;crownTouchesEdge=hit>Math.max(3,(hi-lo)*.15)}
  progress(95,'กำลังสรุปผลตรวจ');
  self.postMessage({type:'result',evidence:{faces,pose:result.landmarks?.[0]||[],crownTouchesEdge}});
 }catch{self.postMessage({type:'error'})}
 finally{for(const mask of result?.segmentationMasks||[])mask.close?.();face?.close?.();pose?.close?.()}
};
