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
  progress(45,'กำลังตรวจใบหน้า');
  const faces=face.detect(canvas).faceLandmarks||[];face.close();face=null;
  if(faces.length!==1){self.postMessage({type:'result',evidence:{faces}});return}
  progress(55,'กำลังโหลดเครื่องมือตรวจลำตัว');
  pose=await make(runtime.PoseLandmarker,'pose_landmarker_lite.task',{numPoses:1,outputSegmentationMasks:false,minPoseDetectionConfidence:.35,minPosePresenceConfidence:.35});
  progress(80,'กำลังตรวจคอ ไหล่ และอกส่วนบน');
  result=pose.detect(canvas);
  progress(95,'กำลังสรุปผลตรวจ');
  self.postMessage({type:'result',evidence:{faces,pose:result.landmarks?.[0]||[]}});
 }catch{self.postMessage({type:'error'})}
 finally{face?.close?.();pose?.close?.()}
};
