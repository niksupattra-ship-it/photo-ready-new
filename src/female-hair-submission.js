export const FEMALE_HAIR_SUBMISSION_REVISION='female-matched-pro-v10';
// Ignore only this rollout marker when recovering an in-flight legacy job.
// Source, hairstyle, outfit, finish and ownership checks remain unchanged.
export function sameHairIntentBeforeUpgrade(previous,current){
 try{
  const before=JSON.parse(previous),after=JSON.parse(current);
  return Array.isArray(before)&&Array.isArray(after)&&after.filter(v=>v===FEMALE_HAIR_SUBMISSION_REVISION).length===1&&!before.includes(FEMALE_HAIR_SUBMISSION_REVISION)&&JSON.stringify(before.filter(v=>!['female-reference-only-hair-v8','female-rear-hair-frame-v9'].includes(v)))===JSON.stringify(after.filter(v=>v!==FEMALE_HAIR_SUBMISSION_REVISION));
 }catch{return false;}
}
export function shouldRecoverHairSubmission(previous,current,status){
 return previous===current?['queued','processing','completed'].includes(status):['queued','processing'].includes(status)&&sameHairIntentBeforeUpgrade(previous,current);
}
