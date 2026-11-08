import {withNaturalStudioSkin} from './natural-studio-skin.js';
import {SOFT_ROSY_PORTRAIT_MAKEUP} from './soft-rosy-portrait-finish.js';
import {KOREAN_ROSY_FINISH} from './korean-rosy-finish.js';
// Single source of female cosmetics; natural and makeup finishes are separately scoped.
export const REVIEW_FEMALE_FINISH="FEMALE NATURAL STUDIO PORTRAIT — CLEAN, EVEN, CAMERA-READY SKIN:\nIDENTITY SOURCE, FINISH TARGET: Image 1 anchors identity, facial anatomy, original eyebrow hair, eyes, nose, lips and face shape. Keep the same woman, same expression and same face.\nSKIN AND LIGHT — ADAPTIVE FRONTAL STUDIO ILLUMINATION: Use soft, balanced frontal studio light with natural depth and controlled highlights. Correct exposure and colour cast without changing the person's complexion or facial geometry.\nLIPS — NATURAL KOREAN SOFT ROSE, SLIGHT HYDRATED GLOSS: Preserve the person's natural lip colour and shape; do not add lipstick, gloss, blush, eyeshadow, eyeliner, mascara or a foundation mask in the natural option.\nCLEAR SKIN: Remove visible active acne, whiteheads, red spots, temporary blemishes, post-acne marks and shallow wrinkle lines across the forehead, temples, cheeks, nose, chin and around the mouth. Repair those areas to the nearby healthy skin tone without over-smoothing the face.\nNATURAL FINISH: Keep a fresh healthy complexion, softly refined texture and clean photographic skin. Preserve authentic undertone, subtle texture, natural pores and genuine identifying marks.\nPROPORTION AND SKIN AUTHORITY: Keep the original face width, jaw, chin, eyes, lips and asymmetry. Preserve natural facial structure.\n";

const ACNE="\nFEMALE MAKEUP OPTION ONLY — LOCAL BLEMISH AND DARK-MARK CLEANUP: Inspect the entire forehead, temples, BOTH cheeks, nose and chin, not only the centre of the face. Repair active pimples, whiteheads, red bumps, temporary acne marks, post-acne dark spots and shallow wrinkle lines to nearby healthy skin. Prioritize visibly clear, camera-ready skin while preserving real skin texture.\n";
const STUDIO_SOFT_SKIN="\nFEMALE MAKEUP OPTION ONLY — ADAPTIVE SOFT STUDIO SKIN FINISH: After localized blemish repair, soften remaining coarse pore contrast, rough patches and harsh edges of shallow acne scars. Reduce texture noise only where it looks artificial; keep natural fine pores, skin grain and realistic complexion variation.\n";
const LIPS="LIPS — FRESH KOREAN ROSE-PINK WITH HYDRATED GLOSS: Give both lips a fresh soft rose-pink tint with a slight warm-red undertone, balanced and gently visible on every complexion. Rebalance any uneven lip tone and add a clean hydrated sheen.\n";
const LINER="UPPER LASH-ROOT DEFINITION ONLY: Use a thin, softly defined natural brown eyeliner along the existing upper lash roots, of moderate cosmetic intensity: clearly tidy but never black, heavy or excessive. Keep the original eye shape and lid structure.\n";
const EYE="EYES — SOFT SKIN-BALANCED PINK-NUDE, FRESH NATURAL MAKEUP: Apply a very soft translucent PINK-NUDE upper-lid tint, made predominantly of the person's adjacent neutral beige/nude skin undertone with a subtle rose-pink warmth. Keep the effect clean, polished and delicate rather than heavily made up.\n";
const EXPOSURE="EXPOSURE AND BARE-FACE HANDLING — REQUIRED FOR THE MAKEUP OPTION: Deliver the SAME soft skin-balanced pink-nude eye target, existing full-strand brow design, rose-pink lips/gloss finish and even studio-light complexion across the whole face, ears and neck. Keep a bright, polished, premium-profile look without making the face look over-processed.\n";
const SKIN="SKIN AND LIGHT — FAIRER, BRIGHTER SOFT-DIFFUSED MAKEUP COMPLEXION: Render the same woman with visibly brighter and fairer cosmetic skin than the former makeup finish, like softly luminous studio portrait skin: even, clear and polished while still natural. Preserve authentic undertone, natural texture and real facial structure.\n";
// Makeup edits are scoped to this option; the exported natural finish stays unchanged.
function replaceSection(text,start,end,replacement){
  const a=text.indexOf(start),b=text.indexOf(end,a);
  if(a<0||b<a)throw new Error('Female makeup section missing: '+start);
  return text.slice(0,a)+replacement+text.slice(b);
}
const FEMALE_ACNE_PRIORITY="\nFEMALE ACNE AND ROUGH-SKIN PRIORITY — NATURAL AND MAKEUP OPTIONS: On visibly acne-prone skin, remove active pimples, whiteheads, blackheads and temporary red blemishes. Reduce harsh rough-skin contrast and uneven tone while keeping genuine pores, freckles and natural skin variation. Preserve the original face, age and identity.\n";
const FEMALE_EYE_IDENTITY_PRIORITY="\nFEMALE EYE IDENTITY PRIORITY — NATURAL AND MAKEUP OPTIONS, INITIAL AND HAIRSTYLE-CHANGE PORTRAITS: Image 1 is the sole authority for BOTH eyes and the person's real intrinsic facial geometry. Keep the original eye shape, lid crease structure, eye size, spacing, asymmetry and iris colour; do not widen, lift, flatten or mirror the eyes. Preserve the original brow shape, brow density and face proportions.\n";
const MAKEUP_ACNE_PRIORITY="\nFEMALE ACNE AND ROUGH-SKIN PRIORITY — MAKEUP OPTION ONLY: Identity preservation protects facial anatomy and genuine stable moles/freckles; it does not require preserving all rough texture or uneven skin. Clear visible acne, temporary redness and dark post-acne marks thoroughly, then finish with balanced studio skin and a polished complexion. Keep real skin grain, but remove harsh texture that makes the portrait look dated or unretouched.\n";
// Applied last to every female finish, including the separately maintained rosy looks.
const FEMALE_IDENTITY_GEOMETRY_LOCK=`\nFINAL FEMALE IDENTITY / EYE / GEOMETRY LOCK — ALL NATURAL AND MAKEUP FINISHES:
Image 1 is the immutable authority for the person's identity and facial geometry. Preserve the exact original gaze direction and eye expression, each eye's shape, opening, eyelid boundaries, crease,
inner and outer corners, spacing, iris and pupil size/position, and natural left/right asymmetry. Do not retouch, redraw, enlarge, shrink, lift, lower, rotate, recolour or otherwise alter the eyes or gaze.
Preserve the original face width, face height, aspect ratio, forehead, temples, cheeks, jaw angles, chin, nose, mouth and feature spacing. Do not stretch, elongate, compress, squeeze, widen, narrow,
slim, reshape, symmetrize or change the apparent age of the face. No face morphing or beauty-geometry correction. Makeup, blemish repair, skin finish and lighting may change surface colour/texture only;
they must not move facial landmarks or change the face's proportions. Keep the original head scale and framing.
`;
// The makeup option is evaluated afresh from the uploaded person's skin.
const ADAPTIVE_KOREAN_MAKEUP=`FEMALE MAKEUP — ADAPTIVE SOFT CLEAR KOREAN STUDIO STYLE:
Image 1, the original uploaded photograph in THIS request, is the sole source for this woman's identity, natural complexion, undertone, skin condition and existing facial anatomy. Evaluate that underlying skin and create a fresh, polished studio portrait that looks professionally retouched in-camera. The goal is a clean premium beauty finish, not a heavily filtered or overly stylized effect.
SKIN — NATURAL SOFT-FOCUS ROSY FINISH, FEMALE MAKEUP OPTION ONLY: Conceal temporary acne, localized red/brown post-acne patches and visible rough-skin texture to the nearby healthy skin tone. Gently reduce harsh pores, dull patches and uneven skin contrast, then finish with a bright soft-diffused studio complexion. Keep real pores and normal skin variation, but remove obvious blemish and coarse texture so the skin looks smooth, luminous and camera-ready.
EYES AND BROWS: Let the original complexion and real lid area determine a very delicate nude-pink upper-lid tint. Keep any upper-lid tint extremely sheer, low in saturation and close to the neighbouring skin tone, with a refined soft-pink warmth. Preserve the original brow structure and maintain the real eye shape, spacing and asymmetry.
LIPS AND CHEEKS: Choose a soft translucent rose-pink or peach-rose lip tint that flatters the original undertone, with a gentle inner-to-outer gradient and light hydrated gloss. Apply a subtle natural blush on the cheeks so the face looks healthy and polished without looking too heavy. Neutralize unwanted redness and keep the finish clean and fresh.
IDENTITY AND SCOPE: Preserve the original eyes, nose, mouth, jaw, chin, both ears, head scale and facial proportions. Never slim, stretch, mirror or reshape the face or borrow anatomy from the hairstyle reference. Keep the person's natural structure while adding refined studio makeup.
`;
export const NATURAL_FEMALE_FINISH=withNaturalStudioSkin(REVIEW_FEMALE_FINISH);

export function femaleFinishFor(style="natural"){
  let finish;
  if(style==='natural')finish=NATURAL_FEMALE_FINISH+FEMALE_ACNE_PRIORITY+FEMALE_EYE_IDENTITY_PRIORITY;
  else if(style==='soft-rosy-v1')finish=SOFT_ROSY_PORTRAIT_MAKEUP;
  else if(style==='korean-rosy-v1')finish=KOREAN_ROSY_FINISH;
  else if(style!=="makeup")finish=REVIEW_FEMALE_FINISH+FEMALE_ACNE_PRIORITY+FEMALE_EYE_IDENTITY_PRIORITY;
  else finish=ADAPTIVE_KOREAN_MAKEUP+MAKEUP_ACNE_PRIORITY+FEMALE_EYE_IDENTITY_PRIORITY;
  return finish+FEMALE_IDENTITY_GEOMETRY_LOCK;
}

export const FEMALE_MAKEUP_SOURCE_LOCK=`
FINAL FEMALE MAKEUP SOURCE-FACE LOCK — ORIGINAL UPLOAD ONLY:
Makeup is a surface colour/skin finish on the photographed person. Keep the original intrinsic eye shapes, opening, upper/lower lid boundaries, creases, inner/outer corners, spacing and individual
left/right asymmetry. Preserve the original face width/height, cheek fullness, jaw angles, chin width/height, nose shape/width, mouth contour/size, feature spacing, age, expression and identifying
asymmetry. No slimming, widening, lengthening, reshaping or face morphing. This source-face lock overrides every conflicting beauty, freshness, symmetry, eye-brightening and cosmetic contouring
instruction. Preserve the established natural skin texture, subtle colours, head scale and real facial structure while adding the selected soft makeup.
`;

export const FEMALE_MAKEUP_TEXTURE_PRIORITY="\nFINAL FEMALE MAKEUP TEXTURE PRIORITY — NATURAL SELECTIVE SOFT FOCUS: Apply only when the user selected female makeup. Retain fine original pores, subtle facial grain and natural skin texture. Reduce harsh coarse texture and uneven rough patches while keeping the portrait realistic, polished and camera-ready.\n";
