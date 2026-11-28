// Classic worker: the pinned MediaPipe WASM loader needs importScripts.
const root='/assets/vision/mediapipe-1.0.1';
self.onmessage=async({data})=>{
 let faceModel,segmenter;
 try{
  const {FilesetResolver,FaceLandmarker,ImageSegmenter}=await import(root+'/vision_bundle.mjs');
  const {labLayoutMetrics,compareLabLayout}=await import('./female-lab-layout-metrics.js');
  const files=await FilesetResolver.forVisionTasks(root+'/wasm');
  faceModel=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:root+'/face_landmarker.task'},runningMode:'IMAGE',numFaces:2,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5});
  segmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:root+'/selfie_multiclass_256x256.tflite'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});
  const measure=async blob=>{
   const bitmap=await createImageBitmap(blob);
   try{
    const q=Math.min(1,768/bitmap.width,768/bitmap.height),width=Math.round(bitmap.width*q),height=Math.round(bitmap.height*q),canvas=new OffscreenCanvas(width,height);
    canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
    const faces=faceModel.detect(canvas).faceLandmarks;if(faces?.length!==1)return null;
    const segmented=await new Promise((resolve,reject)=>{try{segmenter.segment(canvas,result=>{
     const mask=result?.categoryMask;if(!mask){resolve(null);return;}
     try{resolve({labels:mask.getAsUint8Array().slice(),labelWidth:mask.width,labelHeight:mask.height})}catch(error){reject(error)}finally{mask.close?.();}
    })}catch(error){reject(error)}});
    if(!segmented)return null;
    return labLayoutMetrics({face:faces[0],width,height,...segmented});
   }finally{bitmap.close();}
  };
  const guide=await measure(data.guide),result=await measure(data.result);
  self.postMessage({comparison:compareLabLayout(guide,result),measurements:{guide,result}});
 }catch{self.postMessage({comparison:{status:'unmeasurable'}})}
 finally{faceModel?.close?.();segmenter?.close?.();}
};
