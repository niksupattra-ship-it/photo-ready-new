const DB='idprom-purchase-draft-v1',BACKUP='idprom-purchase-draft-backup-v1',STORE='checkout-drafts-v2';
let memoryDraft=null;
const bounded=(operation)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new DOMException('Draft storage timed out','TimeoutError')),10000);Promise.resolve().then(operation).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
async function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new DOMException('Draft storage blocked','InvalidStateError'))});}
async function encode(value){
 if(value instanceof Blob){const bytes=new Uint8Array(await value.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {__idpromBlob:true,data:btoa(binary),type:value.type,name:typeof File!=='undefined'&&value instanceof File?value.name:null,lastModified:value.lastModified}}
 if(Array.isArray(value))return Promise.all(value.map(encode));
 if(value&&typeof value==='object'){const result={};for(const [key,item] of Object.entries(value))result[key]=await encode(item);return result}return value;
}
function decode(value){
 if(value?.__idpromBlob===true){const binary=atob(value.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return value.name&&typeof File!=='undefined'?new File([bytes],value.name,{type:value.type,lastModified:value.lastModified}):new Blob([bytes],{type:value.type})}
 if(Array.isArray(value))return value.map(decode);
 if(value&&typeof value==='object'){const result={};for(const [key,item] of Object.entries(value))result[key]=decode(item);return result}return value;
}
export async function savePurchaseDraft(value,{allowMemoryFallback=false}={}){
 memoryDraft=value;
 try{
  await bounded(async()=>{const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);tx.objectStore(STORE).put(value,'current')})}finally{db.close()}});
  try{sessionStorage.removeItem(BACKUP)}catch{}return {storage:'indexeddb',persistent:true};
 }catch(primaryError){
  // Preserve the complete project in this tab, including original blobs. Never silently discard edits.
  try{const data=JSON.stringify(await bounded(()=>encode(value)));sessionStorage.setItem(BACKUP,data);return {storage:'session',persistent:true,primaryCode:primaryError?.name||'Error'}}catch(backupError){
   const details={primaryCode:primaryError?.name||'Error',backupCode:backupError?.name||'Error'};
   if(allowMemoryFallback)return {storage:'memory',persistent:false,...details};
   const failure=Error('Cannot persist checkout draft');failure.name='DraftStorageError';Object.assign(failure,details);throw failure;
  }
 }
}
export async function loadPurchaseDraft(){
 if(memoryDraft)return memoryDraft;
 try{const backup=sessionStorage.getItem(BACKUP);if(backup)return decode(JSON.parse(backup))}catch{}
 return bounded(async()=>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE),r=tx.objectStore(STORE).get('current');r.onsuccess=()=>{if(r.result||!db.objectStoreNames.contains('drafts'))resolve(r.result||null);else{const legacy=db.transaction('drafts').objectStore('drafts').get('current');legacy.onsuccess=()=>resolve(legacy.result||null);legacy.onerror=()=>reject(legacy.error)}};r.onerror=()=>reject(r.error)})}finally{db.close()}});
}
