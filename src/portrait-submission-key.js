// Render revisions invalidate completed preview caches, never ownership of an
// already submitted job. Compare every actual selection after removing ONLY
// the two female render revisions added to recovery keys.
export function samePortraitSubmissionKey(left,right){
 if(typeof left!=='string'||typeof right!=='string')return false;
 if(left===right)return true;
 const normalize=value=>{
  const key=JSON.parse(value);
  if(!Array.isArray(key))throw Error('Invalid submission key');
  return JSON.stringify(key.filter(part=>typeof part!=='string'||
   !part.startsWith('thai-female-exact-three-ref-')&&!/^direct-modelark-(?:pro-garment-first-1p5k-v\d+|original-refs-v6)$/.test(part)));
 };
 try{return normalize(left)===normalize(right)}catch{return false}
}
