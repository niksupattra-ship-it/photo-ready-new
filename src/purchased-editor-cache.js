// Local acceleration ONLY for already-owned purchased photos. The server remains
// authoritative for ownership, paid rights, and the seven-day expiry.
const NAME='idprom-purchased-editor-cache-v1',STORE='projects',MAX=12;
const key=(walletId,photoId)=>walletId+':'+photoId;
function openDb(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(Error('IndexedDB unavailable'));
  const req=indexedDB.open(NAME,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'})};
  req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db)};
  req.onerror=()=>reject(req.error||Error('Cache unavailable'));
  req.onblocked=()=>reject(Error('Cache is busy'));
 });
}
async function transact(mode,action){
 const db=await openDb();
 try{
  return await new Promise((resolve,reject)=>{
   let transaction,result;
   try{transaction=db.transaction(STORE,mode);const object=transaction.objectStore(STORE),request=action(object);
    if(request)request.onsuccess=()=>{result=request.result};
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=()=>reject(transaction.error||Error('Cache transaction failed'));
    transaction.onabort=()=>reject(transaction.error||Error('Cache aborted'));
   }catch(error){reject(error)}
  });
 }finally{db.close()}
}
const validProject=p=>p?.format==='idprom-studio'&&p.version===1&&Array.isArray(p.layers)&&p.layers.length>0;
const validIdentity=(walletId,photoId)=>typeof walletId==='string'&&walletId.length>0&&typeof photoId==='string'&&/^photo_[a-f0-9]{36}$/.test(photoId);
export async function readPurchasedEditorCache({walletId,photoId,updatedAt,expiresAt}){
 if(!validIdentity(walletId,photoId)||!updatedAt)return null;
 try{
  const row=await transact('readonly',store=>store.get(key(walletId,photoId)));
  if(!row||row.updatedAt!==updatedAt||!validProject(row.project)||!Number.isFinite(Date.parse(row.expiresAt))||Date.parse(row.expiresAt)<=Date.now()||(expiresAt&&row.expiresAt!==expiresAt))return null;
  return row.project;
 }catch{return null}
}
export async function writePurchasedEditorCache({walletId,photoId,project,updatedAt,expiresAt}){
 if(!validIdentity(walletId,photoId)||!validProject(project)||!updatedAt||!expiresAt||Date.parse(expiresAt)<=Date.now())return false;
 try{
  await transact('readwrite',store=>store.put({key:key(walletId,photoId),walletId,photoId,project,updatedAt,expiresAt,savedAt:Date.now()}));
  // Keep a small, expiring cache: downloaded photos themselves are not stored.
  await transact('readwrite',store=>{
   const cursor=store.openCursor();const now=Date.now();
   cursor.onsuccess=()=>{
    const entry=cursor.result;if(!entry)return;
    if(Date.parse(entry.value.expiresAt)<=now)entry.delete();
    entry.continue();
   };
   return null;
  });
  return true;
 }catch{return false}
}
export async function deletePurchasedEditorCache(walletId,photoId){
 if(!validIdentity(walletId,photoId))return;
 try{await transact('readwrite',store=>store.delete(key(walletId,photoId)))}catch{}
}
