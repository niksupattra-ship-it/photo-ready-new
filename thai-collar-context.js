import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const THAI_COLLAR_CONTEXT_VERSION='thai-upper-collar-contact-v1';
export const usesThaiCollarContext=fields=>isThaiOutfitAi(fields)&&fields?.thaiCollarContextVersion===THAI_COLLAR_CONTEXT_VERSION;
// Read native collar alpha anchors, not the lower tie knot / bottom of a V.
// The exposed chest inside an open neckline is not cervical neck length.
export function measureGarmentCollarContext(uniform,headHeight,template=''){
 const s=uniform?.shoulderWidth,t=uniform?.collarTopY,n=uniform?.necklineY,z=uniform?.socketY;
 if(![s,t,n,z,headHeight].every(Number.isFinite)||s<=0||headHeight<=0)return null;
 const path=String(template).split('?')[0],depth=Math.max(0,z-t)/s;
 const kind=/\/(?:male-government-employee|interior-0[123]|kmitl-(?:fe)?male|khon-kaen-(?:fe)?male)\.png$/.test(path)||/mandarin|standing/.test(path)?'standing':/\/female-(?:operational|academic|senior|government-employee)\.png$/.test(path)?'shirt-tie':/bow/.test(path)?'bow':/round-(?:neck|collar)|peter-pan|collarless/.test(path)?'round':depth>.22?'open':depth<.12?'standing':'shirt-tie';
 const profiles={standing:{offset:.025,gap:.040},'shirt-tie':{offset:.035,gap:.045},open:{offset:.015,gap:.035},bow:{offset:.020,gap:.035},round:{offset:.012,gap:.035}};
 const p=profiles[kind],contactY=Math.max(t,Math.min(n,t+s*p.offset));
 const gap=Math.max(s*.008,Math.min(s*.020,headHeight*p.gap));
 return {kind,contactY,gap,chinY:contactY-gap,upperCollarY:t,openingDepth:depth,shoulderWidth:s,headHeight,version:THAI_COLLAR_CONTEXT_VERSION};
}
export function thaiCollarContextInstruction(fields,context){
 if(!usesThaiCollarContext(fields)||!context)return '';
 const names={standing:'STANDING / HIGH COLLAR','shirt-tie':'FOLDED SHIRT COLLAR / TIE',open:'OPEN COLLAR / V NECKLINE',bow:'BOW / TIED BLOUSE COLLAR',round:'ROUND / COLLARLESS NECKLINE'};
 const details={standing:'The standing band rises around the base of the neck: keep only the measured modest skin gap above that band. The band top touching skin is the endpoint, never the first button or a lower placket.', 'shirt-tie':'The rear collar tips can rise behind the lower jaw. Use the INNER shirt edge touching skin as the front neck boundary, never the tie knot, outer jacket lapel, V opening or button. Seat the chin near this existing shirt collar without creating a second rim.',open:'The lower triangular opening is upper chest, not extra neck: transition the neck into relaxed shoulder roots and natural clavicle/upper-chest anatomy rather than drawing a long straight skin column down to the V. Use the measured upper inner collar edge, not the bottom of the opening.',bow:'Use the actual upper blouse rim touching skin. The bow knot and hanging ribbon are decorations below the neck; never measure to their lowest point or lengthen the neck to meet them.',round:'Use the curved upper fabric rim touching skin. Keep the short natural jaw-to-rim gap and shoulder transition; do not treat an exposed round neckline as a long neck column.'};
 return `\nTHIS GARMENT'S COLLAR CONTACT — FINAL NECK AUTHORITY:
The actual selected garment has a ${names[context.kind]} construction, measured from its own native upper collar/inner-opening anchors. The board's chin position was fitted AFTER the reduced head size was known. Follow this short, continuous chin-to-upper-collar relationship; do not lift the head or enlarge the neck gap to restore a previous guide or the uploaded selfie posture.
${details[context.kind]}
Keep this garment's exact collar height, neckline depth, shoulder geometry and full body scale in the board. Keep the established smaller head and its intrinsic facial/eye geometry unchanged; position the entire head coherently to meet this collar, without squeezing the face, stretching neck skin, moving the garment, adding another collar, a pasted skin patch or a second AI request.`;
}
