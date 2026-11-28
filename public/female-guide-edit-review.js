export function measureLayoutPair(guide,result,{createWorker=()=>new Worker('/female-lab-layout-worker.js'),timeoutMs=45000,signal}={}){
 return new Promise(resolve=>{
  let worker,timer,finished=false;
  const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);worker?.terminate();signal?.removeEventListener('abort',cancel);resolve(value||{status:'unmeasurable'});};
  const cancel=()=>finish();if(signal?.aborted){finish();return;}
  signal?.addEventListener('abort',cancel,{once:true});
  try{
   worker=createWorker();timer=setTimeout(cancel,timeoutMs);
   worker.onmessage=({data})=>finish(data?.comparison);
   worker.onerror=cancel;worker.postMessage({guide,result});
  }catch{finish();}
 });
}

export async function startLabLayoutReview({card,blob,resultUrl,snapshot,guideEndpoint}){
 const details=document.createElement('details'),summary=document.createElement('summary');details.append(summary);card.append(details);
 summary.textContent='เทียบตำแหน่งกับไกด์ · กำลังตรวจโดยประมาณ…';
 const controller=new AbortController();let guideUrl,disposed=false;
 card.layoutReviewDispose=()=>{disposed=true;controller.abort();if(guideUrl)URL.revokeObjectURL(guideUrl);};
 try{
  let guide=snapshot?.guideBlob;
  if(!guide){
   if(!snapshot?.files?.person||!snapshot?.files?.outfit||!snapshot.femalePreplacedFace)throw Error('missing_reference');
   const data=new FormData();data.set('person',snapshot.files.person);data.set('outfit',snapshot.files.outfit);data.set('femalePreplacedFace',snapshot.femalePreplacedFace);
   const response=await fetch(guideEndpoint,{method:'POST',body:data,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
   if(!response.ok)throw Error('guide_unavailable');guide=await response.blob();
  }
  if(disposed)return;
  guideUrl=URL.createObjectURL(guide);
  const pair=document.createElement('div');pair.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin-top:12px';
  for(const [label,url] of [['ไกด์ที่ส่งให้ AI',guideUrl],['ผลลัพธ์',resultUrl]]){
   const figure=document.createElement('figure'),caption=document.createElement('figcaption'),image=document.createElement('img');figure.style.cssText='margin:0;flex:1;min-width:130px';caption.textContent=label;image.src=url;image.alt=label;image.style.cssText='display:block;width:100%;max-height:360px;object-fit:contain';figure.append(caption,image);pair.append(figure);
  }
  const note=document.createElement('p');note.textContent='ตรวจเฉพาะระยะจัดวางโดยประมาณ โปรดเทียบรายละเอียดกับไกด์และต้นฉบับด้วย';details.append(pair,note);
  const comparison=await measureLayoutPair(guide,blob,{signal:controller.signal});if(disposed)return;
  const states={within_tolerance:'ระยะจัดวางใกล้เคียงไกด์โดยประมาณ',review:'ระยะจัดวางต่างจากไกด์ · เปิดภาพเทียบเพื่อตรวจ',unmeasurable:'วัดระยะอัตโนมัติไม่ได้ · เปิดภาพเทียบไกด์ได้'};
  summary.textContent='เทียบตำแหน่งกับไกด์ · '+(states[comparison.status]||states.unmeasurable);
 }catch{if(!disposed)summary.textContent='เทียบตำแหน่งกับไกด์ · ยังตรวจอัตโนมัติไม่ได้';}
}
