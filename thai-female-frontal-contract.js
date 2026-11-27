import {usesUnifiedFemalePoseVersion,usesThaiWholeHeadGuide} from './thai-whole-head-guide.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from './female-portrait-prompt.js';
import {normalizeThaiRealFaceAppearance} from './thai-real-face-policy.js';
export const usesFemaleFrontalContract=fields=>usesThaiWholeHeadGuide(fields)&&usesUnifiedFemalePoseVersion(fields.thaiWholeHeadGuideVersion);
// Remove legacy 2D pose locks only from NEW female full-image requests. Keep
// the audited cosmetics block byte-identical; anatomy and pose are distinct.
export function applyFemaleFrontalContract(prompt,fields){
 if(!usesFemaleFrontalContract(fields))return prompt;
 const protectedPolicies=[...new Set([MAKEUP_STUDIO_RETOUCH_POLICY,normalizeThaiRealFaceAppearance(MAKEUP_STUDIO_RETOUCH_POLICY)])];
 for(const [i,policy] of protectedPolicies.entries())prompt=prompt.replaceAll(policy,`\u0000MAKEUP_POLICY_${i}\u0000`);
 const replacements=[
  ['Position the whole head only with uniform scale and translation when fitting clothing.','Reconstruct the whole head in the frontal orientation of the neutral composition board; its uniform guide scale sets head size.'],
  ['Scale and move the whole portrait uniformly only; never squeeze a face to fit the garment or an ideal head/body ratio.','Keep the garment and camera frame fixed while correcting the head perspective to frontal without slimming or squeezing facial anatomy.'],
  ['never change face width-to-height ratio or reposition facial features.','preserve intrinsic face proportions while reprojecting the same features coherently into the frontal view.'],
  ["If a beauty, symmetry, wrinkle-removal or head-ratio instruction conflicts with this person's anatomy or gaze, preserve the original anatomy and gaze.",'Preserve original facial anatomy, eye shapes and expression during frontal pose correction; the source tilt and projected feature coordinates are not identity locks.'],
  ['or forced left/right symmetry','or mirrored eye substitutions'],
  ['or forced symmetry','or mirrored facial halves']
 ];
 for(const [before,after]of replacements)prompt=prompt.replaceAll(before,after);
 for(const [i,policy]of protectedPolicies.entries())prompt=prompt.replaceAll(`\u0000MAKEUP_POLICY_${i}\u0000`,policy);
 return prompt;
}
