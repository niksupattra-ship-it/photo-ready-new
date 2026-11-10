// Delivery only. Callers must verify the payment and image rights first.
const STORAGE_KEY='idprom_paid_photo_downloads_v1';
const MAX_REMEMBERED=50;

export function paidPhotoDownloadKey(signal,{automatic=false,walletId,jobIds=[]}={}){
 if(!automatic||!walletId||!Array.isArray(jobIds)||!jobIds.includes(signal?.jobId)||!/^(?:pi|cs)_[A-Za-z0-9_]+$/.test(signal?.id||''))return null;
 return JSON.stringify([walletId,signal.id,signal.jobId]);
}

function observe(onEvent,type,details){try{onEvent?.(type,details)?.catch?.(()=>{})}catch{}}

export function requestFullResolutionDownload(blob,name,{container,onEvent}={}){
 const url=URL.createObjectURL(blob);let link;
 try{
  link=document.createElement('a');link.href=url;link.download=name||'IDPROM-full-resolution.png';
  link.target='_blank';link.rel='noopener';link.className='idprom-automatic-photo-download';
  (container||document.body).appendChild(link);link.click();
  // A browser request is observable; a completed device save is not.
  observe(onEvent,'download_requested',{method:'save_link',sizeId:'original'});
  return 'requested';
 }finally{link?.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
}

export function createPaidPhotoAutoDownload({
 read=()=>sessionStorage.getItem(STORAGE_KEY),write=value=>sessionStorage.setItem(STORAGE_KEY,value),request=requestFullResolutionDownload,allowPdf=false
}={}){
 const attempted=new Set();
 return ({key,blob,name,container,onEvent,isCurrent=()=>true})=>{
  if(typeof key!=='string'||!key||key.length>600||!blob?.size||!(blob.type?.startsWith('image/')||allowPdf&&blob.type==='application/pdf')||!isCurrent())return 'skipped';
  let remembered=[];
  try{const raw=read();if(raw&&raw.length<=40000){const rows=JSON.parse(raw);if(Array.isArray(rows)&&rows.length<=MAX_REMEMBERED&&rows.every(row=>typeof row==='string'&&row.length<=600))remembered=rows}}catch{}
  if(attempted.has(key)||remembered.includes(key)||!isCurrent())return 'skipped';
  // Claim before clicking: repeated polling, rerenders and StrictMode cannot
  // request another file. The three receipt buttons remain available for retry.
  attempted.add(key);if(attempted.size>100)attempted.delete(attempted.values().next().value);
  try{write(JSON.stringify([...new Set([...remembered,key])].slice(-MAX_REMEMBERED)))}catch{}
  if(!isCurrent())return 'skipped';
  try{return request(blob,name,{container,onEvent})}catch{
   observe(onEvent,'download_failed',{method:'save_link',sizeId:'original',errorStage:'delivery',errorCode:'delivery_failed'});
   return 'failed';
  }
 };
}
