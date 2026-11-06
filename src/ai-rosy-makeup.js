export const ROSY_AI_LOOK='soft-rosy-ai-v1';
const cancelled=()=>Object.assign(Error('ยกเลิกการแต่งเมคอัพแล้ว'),{name:'AbortError'});
const delay=(ms,signal)=>new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(cancelled())},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()});

// The POST is allowed to settle so cancellation never loses the server job ID.
// Credit is confirmed only after local validation/composition succeeds.
export async function requestAiRosyMakeup(source,{sourceJobId,fetcher,headers,signal,onProgress,compose,isCurrent=()=>true,readSource=async value=>(await fetch(value)).blob(),wait=delay,clock=Date.now}){
 let id=null,confirmed=false;
 const check=()=>{if(signal?.aborted||!isCurrent())throw cancelled()};
 const request=(url,options={})=>fetcher(url,{...options,headers:{...headers,...options.headers},cache:'no-store'});
 const json=async response=>{const data=await response.json();if(!response.ok)throw Error(data.message||'ประมวลผลไม่สำเร็จ');return data};
 try{
  check();if(!sourceJobId)throw Error('เพิ่มรูปและประมวลผลก่อนใช้ผิว');
  const blob=await readSource(source);check();const body=new FormData();body.append('image',blob,'makeup-head.png');body.append('sourceJobId',sourceJobId);body.append('lookId',ROSY_AI_LOOK);
  const info=await json(await request('/api/makeup/rosy/jobs',{method:'POST',body}));id=info.jobId;if(typeof id!=='string'||!id)throw Error('ไม่พบงาน');check();
  const deadline=clock()+6*60*1000;let n=0;
  for(;;){
   check();if(clock()>deadline)throw Error('ประมวลผลเกินเวลาที่กำหนด กรุณาลองใหม่');
   const job=await json(await request('/api/makeup/rosy/jobs/'+encodeURIComponent(id)));check();
   if(job.status==='failed')throw Error(job.message||'ประมวลผลไม่สำเร็จ');
   if(job.status==='completed')break;
   onProgress?.(Math.min(75,12+(++n)*.7));await wait(900,signal);
  }
  const response=await request('/api/makeup/rosy/jobs/'+encodeURIComponent(id)+'/image');if(!response.ok)throw Error('ดาวน์โหลดผลลัพธ์ไม่สำเร็จ');const generated=await response.blob();check();onProgress?.(80);
  const result=await compose(generated);check();onProgress?.(95);
  await json(await request('/api/makeup/rosy/jobs/'+encodeURIComponent(id)+'/confirm',{method:'POST'}));confirmed=true;check();
  return result;
 }finally{if(id&&!confirmed)try{await request('/api/makeup/rosy/jobs/'+encodeURIComponent(id)+'/cancel',{method:'POST'})}catch{}}
}
