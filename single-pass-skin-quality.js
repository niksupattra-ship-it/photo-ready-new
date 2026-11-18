// Visual revision of the current ONE-provider-call female portrait flow.
// This changes only new Natural/Makeup generation prompts, not the v1 request
// protocol, old queued jobs, saved images, credits, or the two-pass legacy route.
import {MAKEUP_STUDIO_RETOUCH_POLICY} from './makeup-studio-retouch-policy.js';
export const SINGLE_PASS_SKIN_QUALITY_VERSION='one-pass-studio-skin-finish-v8-ai-only-even-bright-complexion';

const SHARED_SKIN=`FINAL ONE-PASS STUDIO SKIN AND LIGHTING AUTHORITY — AI ONLY, USE INSIDE THE SAME PORTRAIT GENERATION:
The customer's original portrait is the sole facial identity reference. Complete the hairstyle, clothing, requested Natural/Makeup finish, studio skin refinement and lighting in ONE image-generation request. This is a photographic re-render by the AI, NOT a face replacement, separate skin layer, facial mask, pixel-retouch operation, canvas blur, or follow-up AI generation.
IDENTITY AND SKIN-TONE LOCK: Retain the exact person's facial proportions, asymmetry, expression, eye openings, natural lip edges, facial age, genuine skin-tone depth and undertone. Keep permanent features such as distinctive freckles and moles. Do not whiten or transplant another face or alter nose, jaw, eyes, lips or neck dimensions.
NATURAL CLEAR-SKIN BASE — BOTH NATURAL AND MAKEUP: Subtly clean up small active pimples, temporary acne-red dots and post-acne marks and soften distracting localized red blotches and shallow rough patches. Correct the individual temporary imperfections as part of a genuine photograph while leaving fine uneven pores, natural pigment variation, small facial shadows and subtle texture visible across the surrounding skin. The corrected areas must merge imperceptibly with the person's adjacent real skin; never render a uniform, textureless face, opaque foundation plate, pasted cheek panel, blurred patch, or pale halo.
BRIGHTER STUDIO LIGHT, NOT WHITER SKIN: Give the face a slightly fresher, clearer, softly lit appearance using gentle frontal fill and a restrained lift of dull midtones, not by changing the underlying skin colour. Maintain soft three-dimensional shading around eyes, nose, cheekbones and jaw, and continue the same natural skin tone and lighting into ears and visible neck. Do not independently bleach or brighten the face against a darker neck or body.
NATURAL PHOTO REALISM: Preserve subtle real pores, fine facial detail and soft tonal transitions. Do not fabricate artificial gritty pore patterns. Never create plastic, waxy, porcelain, airbrushed, overly blurred, grey-white, excessively saturated, or mask-like skin. Avoid obvious facial colour borders or thickly painted coverage. This is an instruction to improve the generated photographic appearance, not to add a later skin-processing stage.
NON-FACE PROTECTION: Preserve hairstyle silhouette, hair strands, clothing fabric and collar, accessories, pose, camera crop, head/shoulder proportions, background and transparency requirements. Keep eyebrow strands, lashes, iris texture, nostril openings and lip boundaries sharply recognizable and unchanged.`;

const NATURAL=`SELECTED FINISH — NATURAL CLEAR STUDIO SKIN, NO ADDED MAKEUP:
Use the shared gently clarified skin and soft studio fill, correcting temporary pimples and uneven redness while keeping the original skin's fine real texture, actual age and complexion. Natural means NO cosmetics at all: no blush, eyeliner, eyeshadow, lipstick, lip gloss, fake eyelashes or visible foundation. The face must not look painted, filtered, overly smooth, pale, or like a separate overlay. Preserve original brow hairs and natural eyelid/lip colours. Keep the natural photographic face and neck continuous.`;

/** Final priority appended after geometry, hairstyle and clothing instructions. */
export function onePassSkinQualityPriority(finish='natural',english=false){
 if(finish!=='natural'&&finish!=='makeup')throw Error('Invalid one-pass skin finish');
 const outfitLock=english?'\nENGLISH OUTFIT REFERENCE LOCK: Treat the outfit image only as the selected garment and proportions; never borrow any model face, skin colour, cosmetics or skin texture from an outfit reference. Keep the complete garment and its native lighting unchanged.':'';
 // Natural keeps its released prompt bytes. Makeup has one appearance target,
 // rather than inheriting Natural texture limits and then overriding them.
 if(finish==='makeup')return outfitLock+'\n'+MAKEUP_STUDIO_RETOUCH_POLICY;
 return '\n'+SHARED_SKIN+'\n'+NATURAL+outfitLock;
}
