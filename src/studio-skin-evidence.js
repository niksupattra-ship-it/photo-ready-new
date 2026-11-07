import {STUDIO_SKIN_WORKFLOW_VERSION,parseStudioSkinEvidence} from '../studio-skin-treatment.js';

// Evidence is measured from the exact immutable canonical input submitted with
// this request. No generated portrait, corrected canvas or prior hair result is
// used as its coordinate frame. Only completed successes are retained.
const ready=new WeakMap();
const MESSAGE='ตรวจพื้นที่ผิวและขอบผมไม่สำเร็จ เก็บรูปเดิมไว้';
const invalid=()=>Object.assign(Error(MESSAGE),{code:'studio_skin_evidence_invalid'});
const cancelled=()=>Object.assign(Error('ยกเลิกการประมวลผลแล้ว'),{name:'AbortError',code:'STUDIO_SKIN_CANCELLED'});
const assertActive=signal=>{if(signal?.aborted)throw cancelled()};

function waitStage(promise,signal,timeoutMs=60000){
 assertActive(signal);
 return new Promise((resolve,reject)=>{
  let settled=false,poller=null;
  const finish=(done,value)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(poller);signal?.removeEventListener?.('abort',abort);done(value)};
  const abort=()=>finish(reject,cancelled());
  const timer=setTimeout(()=>finish(reject,Object.assign(Error('โหลดข้อมูลสำหรับปรับภาพใช้เวลานาน กรุณาลองใหม่'),{code:'studio_skin_evidence_timeout'})),timeoutMs);
  signal?.addEventListener?.('abort',abort,{once:true});
  // App operations expose a live cancelled getter rather than AbortController.
  // Poll only while a stage is pending, and release the timer on every exit.
  if(signal&&typeof signal.addEventListener!=='function')poller=setInterval(()=>{if(signal.aborted)abort()},40);
  Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));
  if(signal?.aborted)abort();
 });
}
const model=provider=>typeof provider==='function'?provider():provider;
function closeMasks(result){
 const masks=new Set([result?.categoryMask,...(Array.isArray(result?.confidenceMasks)?result.confidenceMasks:[])]);
 for(const mask of masks)try{mask?.close?.()}catch{}
}
async function segmentationEvidence(segmenter,image,signal){
 let expired=false;
 const promise=new Promise((resolve,reject)=>{
  try{
   segmenter.segment(image,result=>{
    try{
     if(expired||signal?.aborted){reject(cancelled());return}
     const mask=result?.categoryMask;
     if(!mask||!Number.isSafeInteger(mask.width)||!Number.isSafeInteger(mask.height)||mask.width<1||mask.height<1||mask.width*mask.height>33554432)throw invalid();
     const values=mask.getAsUint8Array();
     if(values?.length!==mask.width*mask.height)throw invalid();
     // MediaPipe can return native-size labels although its model is256px.
     // Sample categories (never interpolate class IDs) into a bounded wire map.
     const scale=Math.min(1,256/Math.max(mask.width,mask.height));
     const maskWidth=Math.max(1,Math.round(mask.width*scale)),maskHeight=Math.max(1,Math.round(mask.height*scale)),labels=new Array(maskWidth*maskHeight);
     for(let y=0;y<maskHeight;y++){
      const row=Math.min(mask.height-1,Math.floor((y+.5)*mask.height/maskHeight))*mask.width;
      for(let x=0;x<maskWidth;x++)labels[y*maskWidth+x]=values[row+Math.min(mask.width-1,Math.floor((x+.5)*mask.width/maskWidth))];
     }
     resolve({maskWidth,maskHeight,labels});
    }catch(error){reject(error)}finally{closeMasks(result)}
   });
  }catch(error){reject(error)}
 });
 try{return await waitStage(promise,signal,15000)}catch(error){expired=true;throw error}
}

/**
 * decode(input) returns an EXIF-oriented image; landmarker/segmenter are model
 * objects, promises, or zero-argument providers (getLandmarker/getPersonSegmenter).
 * Returned evidence contains normal frozen arrays, suitable for JSON/FormData.
 */
export async function captureStudioSkinEvidence(input,{decode,landmarker,segmenter,signal}={}){
 assertActive(signal);
 if(!(input instanceof Blob)||!input.size||!['image/png','image/jpeg','image/webp'].includes(input.type)||input.idpromJobId||input.idpromStudioSkinVersion)throw invalid();
 if(ready.has(input))return ready.get(input);
 if(typeof decode!=='function'||!landmarker||!segmenter)throw invalid();
 const image=await waitStage(Promise.resolve().then(()=>decode(input)),signal);assertActive(signal);
 const width=image?.naturalWidth||image?.width,height=image?.naturalHeight||image?.height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>33554432)throw invalid();
 const detector=await waitStage(Promise.resolve().then(()=>model(landmarker)),signal);assertActive(signal);
 if(typeof detector?.detect!=='function')throw invalid();
 const result=await waitStage(Promise.resolve().then(()=>detector.detect(image)),signal);assertActive(signal);
 const landmarks=result?.faceLandmarks?.[0];
 if(!Array.isArray(landmarks)||![468,478].includes(landmarks.length))throw invalid();
 const face=landmarks.map(point=>{
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))throw invalid();
  return [Math.round(point.x*1e6)/1e6,Math.round(point.y*1e6)/1e6];
 });
 const semantic=await waitStage(Promise.resolve().then(()=>model(segmenter)),signal);assertActive(signal);
 if(typeof semantic?.segment!=='function')throw invalid();
 const mask=await segmentationEvidence(semantic,image,signal);assertActive(signal);
 const evidence={version:STUDIO_SKIN_WORKFLOW_VERSION,width,height,face,...mask};
 // Validate the actual serialized form that the server receives. Do not return
// the parser's Uint8Array: JSON serializes typed arrays as keyed objects.
 const encoded=JSON.stringify(evidence);
 if(encoded.length>300000)throw invalid();
 try{parseStudioSkinEvidence(encoded)}catch{throw invalid()}
 assertActive(signal);
 for(const point of face)Object.freeze(point);
 Object.freeze(face);Object.freeze(evidence.labels);Object.freeze(evidence);
 ready.set(input,evidence);return evidence;
}

// Useful when an upload is explicitly discarded. Byte-identical new Blob
// objects remain independent; no digest or prior-portrait cache is consulted.
export function clearStudioSkinEvidence(input){return ready.delete(input)}
