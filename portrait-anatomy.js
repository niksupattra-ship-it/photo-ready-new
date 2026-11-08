import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {selectedHairDesign,selectedHairInstruction} from './hairstyle-catalog.js';
export const PORTRAIT_ANATOMY_VERSION='studio-original-ai-v5';
export const isBoundedPortrait=fields=>fields?.studioSkinVersion===PORTRAIT_ANATOMY_VERSION&&fields?.portraitMode==='female';
// Current female V5 prompts only; historical and male prompts remain unchanged.
export const boundedPortraitPreparationPrompt=()=>`FEMALE ORIGINAL-PHOTO SKIN / LIGHT PREPARATION:
Image 1 is the intact original clothed photograph and the sole identity/composition source. Image 2 is an identity-free skin/light guide, never a face or fixed skin colour.
Retouch skin only: remove active acne, raised pimples, temporary red/brown marks, scattered dark blemishes, roughness and fine wrinkle grooves on forehead, between brows, under eyes, crow's-feet, cheeks and around the mouth. Blend repairs into healthy fine-textured skin; preserve distinctive permanent moles, intrinsic age structure and broad facial volume.
Use broad diffused frontal key/fill, correct unwanted casts and shadows, gently lift deficient diffuse midtones approximately 8–12%, protect bright skin and reduce oily hotspots to soft satin. Preserve authentic complexion depth; no whitening, grey skin, opaque foundation, wax/plastic blur, fog, synthetic grain or stamped pores.
Keep exact face height/width, skull/forehead height, jaw/chin, ears, brows, nostrils, lip contour/texture/pigment, expression, head scale and source yaw/pitch. Lock original eye openings, true eyelid borders/folds, iris colour/texture/diameter, pupil position/size, gaze, catchlights and moisture; no enlarged eyes, new sparkle or whitened sclera.
Keep all source hair, garments and coverage, pose, background, aspect and framing. Add no cosmetics; do not change hair/clothes, expose new skin, reconstruct body, remove background or make a cutout. Return the same complete photograph with repaired skin and light.`;
function boundedPortraitFinish(style){
 return `PREPARED SKIN: Retain Image 1's repaired clear, even, fine-textured skin and soft studio light; continue it through ears and reconstructed neck. The original identity image supplies anatomy/expression only: do not restore old acne, marks, wrinkle grooves, roughness, casts, shadows or shine. Preserve authentic complexion depth, distinctive permanent moles and broad facial volume. No extra exposure lift, whitening, grey skin, wax/plastic blur, fog, synthetic grain or coarse/stamped pores. Keep facial features and hair crisp. No later local skin or makeup filter.\n`+
 (style==='natural'
 ?'NATURAL OPTION: Keep original eye/lip pigments, brows and lashes; add no lipstick, gloss, eyeshadow, liner, cosmetic lashes, blush or foundation pigment. Preserve original eye openings, eyelid borders/folds, iris/pupil geometry and texture, gaze, catchlights and expression.'
 :`MAKEUP OPTION: Add the established soft ${style==='soft-rosy-v1'?'peach-rose':'rose-pink'} gradient lip tint with restrained hydrated sheen, sheer skin-balanced pink-nude upper lids, subtle upper-lash definition, individual natural brow hairs and very light rosy cheeks. Apply once, adapted to the person's undertone; keep original eye/lip shapes and brow positions, with no extra whitening, nose highlighter or stronger shine.`);
}
export function boundedPortraitPrompt(selected,style='natural'){
 const finish=boundedPortraitFinish(style);
 const design=selectedHairDesign(selected);
 const hairTask=selected.id==='original'||!selected.id
  ?'HAIR — COMPLETE GATHERED REPLACEMENT: Gather ALL source hair compactly against its original skull, with visible ears, no added crown height or bulk. Remove every original long side/back panel, nape tail and curtain beside or behind both ears and the neck. The gathering is complete, never a crown overlay on retained long hair. Reconstruct any newly exposed neck/ear skin continuously; blue background replaces removed hair outside that anatomy.\n'
  :'HAIR-ONLY DESIGN — IMAGE 2: This reference contains hair only, no donor face, neck or body. Fit the selected hair to the original skull and retain the exact selected cut.\n'+selectedHairInstruction(selected)+'\n'+(design?.kind==='long'?'Only the long lengths actually present in this selected design stay behind the neck backing and ears.\n':'COMPLETE COMPACT SILHOUETTE: Remove the original lower hair completely. Do not combine the selected upper crown/braid with old loose lengths behind the ears, jaw, neck or clavicles. Newly uncovered neck sides must be continuous natural skin, without rectangular holes or abrupt horizontal cuts.\n');
 return `FEMALE ID HEAD, SELECTED HAIR AND NECK-BACKING ASSET:
Image 1 supplies the AI-prepared skin/light, head scale, pose and framing. The original-upload identity image locks the same woman's anatomy and expression; never copy another person's face or skin.
ANATOMY LOCK: Preserve original face height/width, skull/forehead height, jaw/chin, ears, nose, mouth and asymmetry; exact eye openings, eyelid folds, iris/pupil size/position, gaze and catchlights. Correct image-plane roll only if needed; do not change source yaw/pitch, head scale or facial proportions. Cosmetics affect surface pigments only.
`+hairTask+`
NECK BACKING: Under the unchanged chin, retain both complete clavicles and a continuous opaque WIDE, DEEP rounded U-shaped skin backing following the separate geometry guide, with hidden overlap under wide/deep collars. No narrow shaft, V tip, collar-shaped notch, transparent/blue hole or missing side skin. Replace the source collar only inside this backing; remove source garment/body outside it to plain medium-blue temporary background.
The backing is flat lower-neck/clavicle editing material beneath a separate outfit, never an undressed body. No rounded breast anatomy anywhere: no breast volume, cleavage grooves/shadows, outer shoulder contours, arms or torso. Keep gentle neck/clavicle shading and stop at the guide boundary; blue outside retained head/hair/backing. Complete a cropped crown compactly without raising roots or stretching skull/face.
`+finish;
}
export const BOUNDED_PORTRAIT_PRIORITY='FINAL AUTHORITY: Original-upload identity controls face/eye anatomy and expression; prepared Image 1 controls repaired skin/light; the selected hair reference controls hair only; the neck guide controls the WIDE, DEEP rounded U backing only. Keep the same head scale, authentic complexion and continuous face/neck light. Never restore source defects or collar holes, copy guide colours, shorten the backing, add body/breast anatomy or change facial geometry.';

export async function loadNeckBackingGuide(root){return readFile(path.join(root,'public/assets/neck-backing-reference/wide-deep-u-v1.png'));}
export function neckBackingGuideInstruction(index){return '\nNECK-BACKING GEOMETRY GUIDE — IMAGE '+index+', THE LAST IMAGE: This identity-free diagram shows the required neck-backing silhouette below the unchanged chin. Its light area is a geometry mask, not white skin, a body, a face or a colour reference. Fill this whole continuous neck/clavicle/U-shaped backing with the same finished facial skin material. Keep it broad and deep for wide-open collars and hidden garment overlap; no missing central/side skin. The lower area is flat compositor backing, with no breast mounds, cleavage grooves, breast shadows or torso anatomy. Do not copy diagram colours, border or a new head. Outside this backing and the retained head/hair use temporary blue background.';}
export async function prepareCatalogueHairOnly(buffer,id,root){
 if(!/^seedream-\d{2}$/.test(id))throw Error('Invalid catalogue hair reference');
 const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const mask=await sharp(await readFile(path.join(root,'public/assets/portrait-hair-masks',id+'.png'))).greyscale().raw().toBuffer({resolveWithObject:true});
 if(info.width!==mask.info.width||info.height!==mask.info.height||mask.info.channels!==1)throw Error('Hair reference mask dimensions differ');
 for(let i=0;i<info.width*info.height;i++){
  data[i*4+3]=Math.round(data[i*4+3]*mask.data[i]/255);
  if(!data[i*4+3])data[i*4]=data[i*4+1]=data[i*4+2]=255;
 }
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
