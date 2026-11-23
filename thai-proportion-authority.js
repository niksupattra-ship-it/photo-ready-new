import {ENGLISH_HEAD_BODY_POLICY} from './english-body-portrait.js';
import {THAI_PROPORTION_AUTHORITY_VERSION} from './thai-proportion-authority-version.js';
import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
import {usesThaiBodyGeometry,thaiBodyGeometryInstruction} from './thai-body-geometry-policy.js';
import {thaiAdaptiveCompositionInstruction} from './thai-adaptive-composition.js';
export function applyThaiProportionAuthority(prompt,fields,{gender='female',boardIndex=null}={}){
 if(!isThaiOutfitAi(fields)||!usesThaiBodyGeometry(fields)||fields.thaiProportionAuthorityVersion!==THAI_PROPORTION_AUTHORITY_VERSION)return prompt;
 const hasBoard=Number.isInteger(boardIndex)&&boardIndex>=2;
 prompt=prompt.replace(ENGLISH_HEAD_BODY_POLICY,'').replace(thaiBodyGeometryInstruction(fields,gender),'');
 if(hasBoard)prompt=prompt.replace(thaiAdaptiveCompositionInstruction(boardIndex),'');
 prompt=prompt.replace('Scale and move the whole portrait uniformly only; never squeeze a face to fit the garment or an ideal head/body ratio.',
  'Preserve intrinsic facial geometry. The COMPLETE head may be uniformly resized and translated relative to the garment according to the final proportion authority; never squeeze either face axis or move individual facial features.');
 prompt=prompt.replace('Preserve head size and position, facial proportions, ears, jaw, neck, pose, framing, background and the complete outfit including its fabric, collar, buttons and insignia.',
  'Skin finishing preserves intrinsic facial proportions, ears, jaw anatomy, pose, background and the complete selected outfit including its fabric, collar, buttons and insignia. Head size, head position and neck attachment follow the final proportion authority.');
 prompt=prompt.replace('Preserve inner facial features, eye/brow positions, ears, face dimensions and head scale.',
  'Preserve intrinsic inner facial proportions, eye/brow relationships and ear anatomy while fitting the hairstyle to the uniformly resized head defined by the final proportion authority.');
 prompt=prompt.replace("If any other body/head-size target conflicts, preserve the person's original facial proportions first.",
  'Preserve intrinsic facial proportions while uniformly fitting the COMPLETE head to the final proportion authority. Facial identity does not lock source head pixel size or source camera zoom.');
 if(hasBoard)prompt=prompt.replace('No mannequin, composited head, scale template or separate neck photo was supplied. Any instruction above asking to copy or shrink an unseen composition guide is inapplicable.',
  `Image 1 is the untouched uploaded person, not a pre-fitted layout. The separately labelled measured composition in Image ${boardIndex} supplies placement only, never facial identity, hairstyle or clothing design.`);
 return prompt+`\nSINGLE FINAL PROPORTION AUTHORITY:\n${hasBoard
  ?`Image ${boardIndex}, the MEASURED COMPOSITION, is the ONLY authority for whole-head size relative to the actual clothed shoulder span, chin placement and supporting neck. Match those relationships, including for broad/narrow faces and different body builds. Do not substitute source-photo zoom, hairstyle-donor head size or another numeric ratio. The board's placeholder supplies zero facial identity. Preserve its garment shoulder/collar anchors; do not narrow the body to keep a large source head.`
  :'No measured composition board is present. Use ONE target: cheek-to-cheek width around 0.30 of the actual clothed shoulder span. Fit the entire head with uniform scale; preserve the selected garment shoulder silhouette. Source-photo zoom does not set head size.'}
Identity protection preserves the real cheek/jaw contour, face width-to-height ratio, feature spacing, eyes, iris colour, gaze and expression; it does NOT freeze absolute head pixel size relative to the garment. Uniformly scale the ENTIRE head, including scalp hair, as one anatomical unit; retain a compact continuous neck into the single selected collar. Never stretch a face axis, enlarge only hair, paste a face, alter the garment design or move its insignia. Keep the selected hairstyle and approved Natural/Makeup finish. Frame continuous cloth through the bottom crop; never enlarge the head to fill empty space or keep every lower button visible. Resolve this inside the SAME single AI request, without a repair call.\n`;
}
