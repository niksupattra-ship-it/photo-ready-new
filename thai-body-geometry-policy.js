import {usesThaiSelectedHair} from './thai-selected-hair-policy.js';
import {thaiBodyGeometryInstruction as archivedBodyInstruction} from './thai-body-geometry-v4.js';
import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const THAI_BODY_GEOMETRY_PREVIOUS_VERSION='thai-one-call-unified-proportions-v4';
export const THAI_BODY_GEOMETRY_VERSION='thai-one-call-adaptive-board-v5';
export const usesThaiBodyGeometry=fields=>isThaiOutfitAi(fields)&&['thai-one-call-body-geometry-v1','thai-one-call-whole-head-v2','thai-one-call-balanced-head-v3',THAI_BODY_GEOMETRY_PREVIOUS_VERSION,THAI_BODY_GEOMETRY_VERSION].includes(fields.thaiBodyGeometryVersion);
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
 return `\nONE AUTHORITATIVE HEAD / SHOULDER PROPORTION — SINGLE GENERATION:
Create one coherent photographic person from the untouched original identity and selected garment. Identity locks protect intrinsic facial anatomy, original eyes/gaze, expression and the head's width-to-height ratio; they do NOT lock source-photo zoom, head pixel size, selfie perspective, reference-model torso width or garment pixel dimensions. This block supersedes earlier fixed head-scale or fixed shoulder-width instructions for this new portrait only.
Use ONE face-to-shoulder target: cheek-to-cheek width around 0.30 of the complete clothed shoulder span (normally 0.28–0.33). Measure actual fabric shoulder ends, not the PNG canvas, hair tips or background. Fit the ENTIRE head including scalp hair with uniform scale relative to naturally proportioned shoulders and chest; allow coherent shoulder breadth and body framing to balance with it. Never narrow the torso to accommodate the uploaded crop or preserve an already oversized previous generated head. Preserve the selected garment design, collar/tie construction and insignia, not the reference model's absolute body dimensions.
Whole head means supported highest hair point to chin and outer hair at face level; exclude long ends below the chin. Keep its width around 0.40–0.45 and crown-to-chin height around 0.50–0.58 of clothed shoulder width. A new hairstyle changes hair design, not skull shape, face aspect, eyes or individual identity. Keep the crown low with natural scalp coverage and a compact anatomical neck into the single selected collar. No face-axis squeeze, separate face paste, neck warp or garment overlay repair.
${gender==='female'?'Preserve the selected female parting, braids/curls and cut length, with long lengths behind both shoulders. '+(usesThaiSelectedHair(fields)?'Use the selected reference crown and gathering only.':'No tall hair dome or visible bun.'):''}
Frame continuous cloth through the bottom crop. Let the full head sit lower if it fits; add crown clearance only when needed to avoid clipping. Do not enlarge the head to fill empty space or preserve a complete hem/button. Resolve all proportions inside this ONE existing AI request; never run a second repair or generation call.`;
}
export const usesUnifiedThaiBodyGeometry=fields=>isThaiOutfitAi(fields)&&[THAI_BODY_GEOMETRY_VERSION,THAI_BODY_GEOMETRY_PREVIOUS_VERSION].includes(fields.thaiBodyGeometryVersion);
