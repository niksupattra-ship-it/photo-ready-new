// Keep the first submitted bytes with the untouched upload. Canvas encoders and
// optional leveling can differ between browsers or after a temporary model error.
const pendingInputs=new WeakMap();
const supported=new Set(['image/png','image/jpeg','image/webp']);
function usable(blob){return blob instanceof Blob&&blob.size>0&&supported.has(blob.type)}
export function canonicalPortraitInput(source,{normalize,legacy=false}={}){
 if(!usable(source))return Promise.reject(Error('อ่านรูปต้นฉบับไม่สำเร็จ กรุณาเพิ่มรูปใหม่'));
 // Historical saved-work proof is bound to the stored original bytes.
 if(legacy)return Promise.resolve(source);
 if(usable(source.idpromCanonicalInput))return Promise.resolve(source.idpromCanonicalInput);
 if(pendingInputs.has(source))return pendingInputs.get(source);
 const pending=Promise.resolve().then(async()=>{
  const input=typeof normalize==='function'?await normalize(source):source;
  if(!usable(input))throw Error('เตรียมรูปต้นฉบับไม่สำเร็จ กรุณาลองใหม่');
  source.idpromCanonicalInput=input;
  return input;
 }).finally(()=>{if(pendingInputs.get(source)===pending)pendingInputs.delete(source)});
 pendingInputs.set(source,pending);return pending;
}
