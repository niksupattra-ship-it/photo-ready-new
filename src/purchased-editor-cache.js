// Local acceleration ONLY for already-owned purchased photos. The server remains
// authoritative for ownership, paid rights, and the seven-day expiry.
const NAME='idprom-purchased-editor-cache-v1',STORE='projects',MAX=12,CACHE_FORMAT=2;
// A small RAM hot cache bypasses large IndexedDB structured-clone reads when
// returning to a purchased edit within the same browser tab.
const hot=new Map(),HOT_MAX=3;
const rememberHot=row=>{if(hot.has(row.key))hot.delete(row.key);hot.set(row.key,row);while(hot.size>HOT_MAX)hot.delete(hot.keys().next().value)};
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
  const id=key(walletId,photoId),valid=row=>row&&row.cacheFormat===CACHE_FORMAT&&row.updatedAt===updatedAt&&validProject(row.project)&&Number.isFinite(Date.parse(row.expiresAt))&&Date.parse(row.expiresAt)>Date.now()&&(!expiresAt||row.expiresAt===expiresAt);
  const warm=hot.get(id);
  if(valid(warm))return warm.project;
  if(warm)hot.delete(id);
  const row=await transact('readonly',store=>store.get(id));
  if(!valid(row))return null;
  rememberHot(row);
  return row.project;
 }catch{return null}
}
export async function writePurchasedEditorCache({walletId,photoId,project,updatedAt,expiresAt}){
 if(!validIdentity(walletId,photoId)||!validProject(project)||!updatedAt||!expiresAt||Date.parse(expiresAt)<=Date.now())return false;
 try{
  const row={key:key(walletId,photoId),cacheFormat:CACHE_FORMAT,walletId,photoId,project,updatedAt,expiresAt,savedAt:Date.now()};
  rememberHot(row);
  await transact('readwrite',store=>store.put(row));
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
 hot.delete(key(walletId,photoId));
 try{await transact('readwrite',store=>store.delete(key(walletId,photoId)))}catch{}
}
