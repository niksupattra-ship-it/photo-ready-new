export const FEMALE_HAIR_SUBMISSION_REVISION='female-reference-files-v14';
// Ignore only this rollout marker when recovering an in-flight legacy job.
// Source, hairstyle, outfit, finish and ownership checks remain unchanged.
export function sameHairIntentBeforeUpgrade(previous,current){
 try{
  const before=JSON.parse(previous),after=JSON.parse(current);
  const markers=new Set([FEMALE_HAIR_SUBMISSION_REVISION,'female-reference-only-hair-v8','female-rear-hair-frame-v9','female-matched-pro-v10','female-soft-korean-pro-v11','female-age-face-lock-pro-v12','female-complete-lab-process-pro-v13']);
  const clean=values=>values.filter(v=>!markers.has(v)&&!(typeof v==='string'&&v.startsWith('female-reference-assets:')));
  return Array.isArray(before)&&Array.isArray(after)&&previous!==current&&after.filter(v=>v===FEMALE_HAIR_SUBMISSION_REVISION).length===1&&JSON.stringify(clean(before))===JSON.stringify(clean(after));
 }catch{return false;}
}
export function shouldRecoverHairSubmission(previous,current,status){
 return previous===current?['queued','processing','completed'].includes(status):['queued','processing'].includes(status)&&sameHairIntentBeforeUpgrade(previous,current);
}
