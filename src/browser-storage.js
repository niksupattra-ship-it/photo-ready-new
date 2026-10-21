// Keep this tab usable when Safari denies localStorage. Checkout drafts still
// require their own durable backup; this fallback must not bypass that check.
export function createBrowserStorage(local=()=>globalThis.localStorage,session=()=>globalThis.sessionStorage){
 const values=new Map(),modes=new Map(),prefix='idprom-storage-fallback-v1:';
 return {
  getItem(key){
   key=String(key);
   if(modes.get(key)==='local'){
    try{const value=local().getItem(key);values.set(key,value);return value}catch{return values.get(key)??null}
   }
   if(values.has(key))return values.get(key);
   try{const stored=session().getItem(prefix+key);if(stored!==null){const record=JSON.parse(stored);if(record&&Object.prototype.hasOwnProperty.call(record,'value')){values.set(key,record.value);modes.set(key,'session');return record.value}}}catch{}
   try{const value=local().getItem(key);values.set(key,value);modes.set(key,'local');return value}catch{return null}
  },
  setItem(key,value){
   key=String(key);value=String(value);values.set(key,value);
   try{local().setItem(key,value);modes.set(key,'local');try{session().removeItem(prefix+key)}catch{};return}catch{}
   try{session().setItem(prefix+key,JSON.stringify({value}));modes.set(key,'session');return}catch{}
   modes.set(key,'memory');
  },
  removeItem(key){
   key=String(key);values.set(key,null);
   try{local().removeItem(key);modes.set(key,'local');try{session().removeItem(prefix+key)}catch{};return}catch{}
   // A session tombstone prevents a stale local value reappearing after reload.
   try{session().setItem(prefix+key,JSON.stringify({value:null}));modes.set(key,'session');return}catch{}
   modes.set(key,'memory');
  },
  mode(key){return modes.get(String(key))||'local'}
 };
}
export const appStorage=createBrowserStorage();
