import {thaiBodyGeometryInstruction as archivedBodyInstruction} from './thai-body-geometry-legacy.js';
import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const THAI_BODY_GEOMETRY_PREVIOUS_VERSION='thai-one-call-whole-head-v2';
export const THAI_BODY_GEOMETRY_VERSION='thai-one-call-balanced-head-v3';
export const usesThaiBodyGeometry=fields=>isThaiOutfitAi(fields)&&['thai-one-call-body-geometry-v1',THAI_BODY_GEOMETRY_PREVIOUS_VERSION,THAI_BODY_GEOMETRY_VERSION].includes(fields.thaiBodyGeometryVersion);
export function parseThaiBodyReference(value,{legacy=false,strict=false}={}){
 if(!value)return null;
 let p;try{p=typeof value==='string'?JSON.parse(value):value}catch{return null}
 if(!p||!Number.isFinite(p.faceToShoulder)||p.faceToShoulder<.265||p.faceToShoulder>(strict ? .365 : .405)||!Number.isFinite(p.crownRatio)||p.crownRatio<.65||p.crownRatio>1.4||!Number.isFinite(p.neckGap)||p.neckGap<-.05||p.neckGap>(legacy ? .30 : strict ? .13 : .18))return null;
 const head={};for(const [key,max]of [['wholeHeadWidthToShoulder',strict ? .50 : .58],['wholeHeadHeightToShoulder',strict ? .62 : .72]])if(Number.isFinite(p[key])&&p[key]>.1&&p[key]<=max)head[key]=p[key];
 return {faceToShoulder:p.faceToShoulder,crownRatio:p.crownRatio,neckGap:p.neckGap,...head};
}
export function thaiBodyGeometryInstruction(fields,gender='female'){
 if(!usesThaiBodyGeometry(fields))return '';
 if(fields.thaiBodyGeometryVersion!==THAI_BODY_GEOMETRY_VERSION)return archivedBodyInstruction(fields,gender);
 const p=parseThaiBodyReference(fields.thaiBodyReference,{strict:true});
 return `\nONE-CALL HEAD / BODY GEOMETRY LOCK:
Generate this single complete portrait from the untouched original identity and selected garment. A different hairstyle changes HAIR ONLY: keep the same person's anatomical skull, face size relative to the clothed shoulders, chin position, compact neck, shoulder breadth and garment construction. Do not rebuild a larger head or a narrower body to accommodate long hair. Hair endpoints do not determine skull width or crown height. Preserve the actual eyes, gaze and internal face proportions; no face resizing on a separate axis, face paste, anatomical warp or garment overlay repair.
${p?`ACCEPTED SAME-PHOTO DIMENSIONLESS BODY TARGETS: cheek-to-cheek width / actual shoulder width = ${p.faceToShoulder.toFixed(4)}; eye-line-to-crown / eye-line-to-chin must not exceed ${p.crownRatio.toFixed(4)} (reduce excess styling lift while keeping anatomical scalp coverage); shoulder-origin minus chin / shoulder width = ${p.neckGap.toFixed(4)}. Maintain these measured proportions while replacing the hairstyle. These numbers describe composition only, never reference-person anatomy. Do not copy a previous generated face or its eyes.`:'INITIAL BODY TARGET: keep cheek-to-cheek width around 0.30 of the actual full clothed shoulder span (normally 0.28–0.33). Measure visible anatomy and fabric, not hair width, transparent margins or a reference model.'}
${gender==='female'?'LOW CROWN: follow the uploaded woman\'s anatomical scalp with a smooth low crown; reduce excess styling lift without moving roots, enlarging the forehead or changing skull shape. Long hair must not create a tall dome or widen the head. Preserve selected parting, braids/waves and actual length behind the shoulders. No visible bun.':''}
WHOLE HEAD INCLUDES HAIR: Measure the outer hair silhouette around the skull from the supported highest hair point down to the chin, including side hair at face level; do not use face width alone and do not count long ends hanging below the chin as head size. Keep the complete hair/head width around 0.40–0.45 of clothed shoulder width and crown-to-chin height around 0.50–0.58 of shoulder width, with a compact natural chin-to-collar join. Never make the skull or neck larger for long hair.
DELIVERY GEOMETRY: Generate enough continuous lower torso and natural full-width shoulders so the complete hair/head fits within 44% of photo height and 46% of photo width while cloth continues below the crop. Do not enlarge the head to fill the frame; adjust the single camera composition and garment naturally in this same call.
ID PHOTO TOP ANCHOR: leave 5% of the photo height as clear background above the highest supported hair point. Fit the complete head including hair naturally in the frame. The lower torso MAY extend below the bottom crop; do not move the crown up to the top edge merely to preserve a button, hem or complete jacket. Scale the whole person uniformly and preserve original facial anatomy. Finish within this ONE image-generation request. Do not propose or run a second repair/generation call.`;
}
