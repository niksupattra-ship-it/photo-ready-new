const DB='idprom-purchase-draft-v1',BACKUP='idprom-purchase-draft-backup-v1',STORE='checkout-drafts-v2';
let memoryDraft=null;
const bounded=(operation)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new DOMException('Draft storage timed out','TimeoutError')),10000);Promise.resolve().then(operation).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
// A timed-out database request may resume after the banking app closes. Abort
// its transaction and close any late connection before a newer draft is saved.
function draftTransaction(store,mode,operation){return new Promise((resolve,reject)=>{
 let db,tx,finished=false,value;
 const close=()=>{try{db?.close()}catch{}};
 const fail=error=>{if(finished)return;finished=true;clearTimeout(timer);try{tx?.abort()}catch{}close();reject(error)};
 const timer=setTimeout(()=>fail(new DOMException('Draft storage timed out','TimeoutError')),10000);
 try{
  const request=indexedDB.open(DB,2);
  request.onupgradeneeded=()=>{if(finished){try{request.transaction?.abort()}catch{}return}if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
  request.onerror=()=>fail(request.error);
  request.onblocked=()=>fail(new DOMException('Draft storage blocked','InvalidStateError'));
  request.onsuccess=()=>{
   db=request.result;if(finished){close();return}
   try{
    if(!db.objectStoreNames.contains(store)){finished=true;clearTimeout(timer);close();resolve(null);return}
    tx=db.transaction(store,mode);
    tx.oncomplete=()=>{if(finished)return;finished=true;clearTimeout(timer);close();resolve(value)};
    tx.onerror=()=>fail(tx.error||new DOMException('Draft storage failed','UnknownError'));
    tx.onabort=()=>fail(tx.error||new DOMException('Draft storage aborted','AbortError'));
    const result=operation(tx.objectStore(store));if(result)result.onsuccess=()=>{value=result.result};
   }catch(error){fail(error)}
  };
 }catch(error){fail(error)}
})}
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
  await draftTransaction(STORE,'readwrite',store=>store.put(value,'current'));
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
 return await draftTransaction(STORE,'readonly',store=>store.get('current'))||await draftTransaction('drafts','readonly',store=>store.get('current'))||null;
}
