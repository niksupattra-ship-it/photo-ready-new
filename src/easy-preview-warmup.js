// Only public, content-versioned menu thumbnails may be prefetched. Never warm
// customer images, native outfits, AI references, or arbitrary remote URLs.
const smallPreview=/^\/assets\/(?:hair|uniform)-picker-thumbnails\/[A-Za-z0-9_-]+\.[a-f0-9]{12}\.webp$/;
const browserImage=source=>new Promise((resolve,reject)=>{
 const image=new Image();image.decoding='async';image.fetchPriority='low';
 image.onload=()=>resolve(image);image.onerror=reject;image.src=source;
});

export function createEasyPreviewWarmer({load=browserImage,concurrency=2,capacity=16}={}){
 const ready=new Map(),inflight=new Map(),queue=[];let running=0;
 const remember=(source,image)=>{
  ready.delete(source);ready.set(source,image);
  while(ready.size>capacity)ready.delete(ready.keys().next().value);
  return image;
 };
 const pump=()=>{
  while(queue.length&&running<concurrency){
   const job=queue.shift();
   if(!job.active()){job.resolve(null);continue}
   if(ready.has(job.source)){job.resolve(remember(job.source,ready.get(job.source)));continue}
   let promise=inflight.get(job.source);
   if(!promise){
    running++;
    promise=Promise.resolve().then(()=>load(job.source)).then(image=>remember(job.source,image),()=>null).finally(()=>{running--;inflight.delete(job.source);pump()});
    inflight.set(job.source,promise);
   }
   promise.then(job.resolve);
  }
 };
 return {
  warm(sources){
   let cancelled=false;
   const selected=[...new Set(sources.filter(source=>typeof source==='string'&&smallPreview.test(source)))].slice(0,12);
   const done=Promise.all(selected.map(source=>new Promise(resolve=>queue.push({source,resolve,active:()=>!cancelled}))));
   pump();
   return {done,cancel(){cancelled=true;pump()}};
  }
 };
}
export const easyPreviewWarmer=createEasyPreviewWarmer();
