// A Blob's pixels are immutable. Share only its native landmark measurement;
// normalized detector canvases, transformed images and other Blobs stay separate.
// Weak keys keep customer images scoped to the lifetime of their owning work.
export function createPortraitFaceCache({decode,landmarker}){
 const records=new WeakMap();
 return function portraitFaceLandmarks(blob,image){
  let pending=records.get(blob);
  if(!pending){
   pending=(async()=>{
    const source=image||await decode(blob),model=await landmarker();
    return model.detect(source).faceLandmarks?.[0];
   })();
   records.set(blob,pending);
   const evict=()=>{if(records.get(blob)===pending)records.delete(blob)};
   pending.then(face=>{if(!face)evict()},evict);
  }
  return pending;
 };
}
