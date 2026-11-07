// Only immutable Blob objects are keys. Pixel-changing operations produce a new
// Blob and must never inherit detection/evidence from their input.
export function createImmutablePortraitMemo(){
 const entries=new WeakMap();
 return (blob,compute,variant='default')=>{
  let variants=entries.get(blob);
  if(!variants){variants=new Map();entries.set(blob,variants)}
  if(variants.has(variant))return variants.get(variant);
  const pending=Promise.resolve().then(compute);variants.set(variant,pending);
  const evict=()=>{if(variants.get(variant)===pending)variants.delete(variant)};
  pending.then(value=>{if(value==null)evict()},evict);
  return pending;
 };
}
