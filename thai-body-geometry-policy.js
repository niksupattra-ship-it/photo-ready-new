import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const THAI_BODY_GEOMETRY_VERSION='thai-one-call-body-geometry-v1';
export const usesThaiBodyGeometry=fields=>isThaiOutfitAi(fields)&&fields.thaiBodyGeometryVersion===THAI_BODY_GEOMETRY_VERSION;
export function parseThaiBodyReference(value){
 if(!value)return null;
 let p;try{p=typeof value==='string'?JSON.parse(value):value}catch{return null}
 if(!p||!Number.isFinite(p.faceToShoulder)||p.faceToShoulder<.265||p.faceToShoulder>.405||!Number.isFinite(p.crownRatio)||p.crownRatio<.65||p.crownRatio>1.4||!Number.isFinite(p.neckGap)||p.neckGap<-.05||p.neckGap>.30)return null;
 return {faceToShoulder:p.faceToShoulder,crownRatio:p.crownRatio,neckGap:p.neckGap};
}
export function thaiBodyGeometryInstruction(fields,gender='female'){
 if(!usesThaiBodyGeometry(fields))return '';
 const p=parseThaiBodyReference(fields.thaiBodyReference);
 return `\nONE-CALL HEAD / BODY GEOMETRY LOCK:
Generate this single complete portrait from the untouched original identity and selected garment. A different hairstyle changes HAIR ONLY: keep the same person's anatomical skull, face size relative to the clothed shoulders, chin position, compact neck, shoulder breadth and garment construction. Do not rebuild a larger head or a narrower body to accommodate long hair. Hair endpoints do not determine skull width or crown height. Preserve the actual eyes, gaze and internal face proportions; no face resizing on a separate axis, face paste, anatomical warp or garment overlay repair.
${p?`ACCEPTED SAME-PHOTO DIMENSIONLESS BODY TARGETS: cheek-to-cheek width / actual shoulder width = ${p.faceToShoulder.toFixed(4)}; eye-line-to-crown / eye-line-to-chin must not exceed ${p.crownRatio.toFixed(4)} (reduce excess styling lift while keeping anatomical scalp coverage); shoulder-origin minus chin / shoulder width = ${p.neckGap.toFixed(4)}. Maintain these measured proportions while replacing the hairstyle. These numbers describe composition only, never reference-person anatomy. Do not copy a previous generated face or its eyes.`:'INITIAL BODY TARGET: keep cheek-to-cheek width around 0.34 of the actual full clothed shoulder span (normally 0.32–0.38). Measure visible anatomy and fabric, not hair width, transparent margins or a reference model.'}
${gender==='female'?'LOW CROWN: follow the uploaded woman\'s anatomical scalp with a smooth low crown; reduce excess styling lift without moving roots, enlarging the forehead or changing skull shape. Long hair must not create a tall dome or widen the head. Preserve selected parting, braids/waves and actual length behind the shoulders. No visible bun.':''}
Set the single camera distance for the whole person and continuous garment; keep natural headroom and cloth reaching the lower frame edges. Finish within this ONE image-generation request. Do not propose or run a second repair/generation call.`;
}
