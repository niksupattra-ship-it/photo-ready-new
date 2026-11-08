import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {boundedHairInstruction,prepareCatalogueHairOnly,loadNeckBackingGuide,neckBackingGuideInstruction} from './portrait-anatomy.js';
import {prepareFreePngReference} from './free-png-reference.js';
import {loadStudioSkinLightReference} from './studio-skin-light-reference.js';

export const FEMALE_HAIR_FIRST_VERSION='studio-original-ai-v6';
export const isFemaleHairFirstRequest=fields=>fields?.portraitMode==='female'&&fields?.studioSkinVersion===FEMALE_HAIR_FIRST_VERSION;
export function femaleHairFirstPrompt(selected){
 return `FEMALE ID PORTRAIT — HEAD, HAIR AND NECK FIRST:
Image 1 is the original uploaded woman and supplies identity, head scale, pose and framing. The separately labelled original identity image is the same person, never another model. Preserve exact face height/width, forehead/skull height, ears, jaw/chin, nose, mouth, expression and asymmetry. Lock original eye openings, true eyelid borders/folds, iris/pupil colour, texture, size and position, gaze and catchlights. Correct image-plane roll only if needed; do not change yaw/pitch or facial proportions.
${boundedHairInstruction(selected)}
Create a continuous opaque WIDE, DEEP rounded U-shaped lower-neck/clavicle backing under the unchanged chin, following the last geometry guide. Retain both clavicles with hidden overlap under wide/deep collars; no narrow shaft, V tip, collar notch or internal blue/transparent holes. Inside the backing replace the original collar with matching skin. Outside retained head/hair/backing remove garment, outer shoulders, arms and torso to plain medium-blue temporary background.
The backing is flat editing material under a separate outfit, never a bust: no breast volume, cleavage grooves/shadows or new body silhouette. Match adjacent skin and gentle anatomical shading. Complete a cropped crown compactly without raising roots or stretching skull/face.
Remove earrings locally without changing ear anatomy. Keep realistic fine roots and strands, natural hair colour and restrained volume; no pasted wig, halo, double hairline or extra hair absent from the design. No donor face, skin, body or jewellery. Perform head/hair/neck construction only; defer skin retouch, relighting and added cosmetics to the next edit. Return one coherent head/hair/neck asset on the same plain blue field.`;
}
export function femaleHairFirstSkinPrompt(style='natural'){
 const cosmetics=style==='natural'
  ?'NATURAL: Keep original eye/lip pigments, brows and lashes. Add no lipstick, gloss, eyeshadow, liner, cosmetic lashes, blush or foundation pigment.'
  :`MAKEUP: Apply the established soft ${style==='soft-rosy-v1'?'peach-rose':'rose-pink'} gradient lip tint, restrained hydrated sheen, sheer pink-nude upper lids, subtle upper-lash definition, natural brow hairs and very light rosy cheeks once. Preserve pigment boundaries, eye/lip shapes and brow positions; no extra whitening or nose highlighter.`;
 return `FEMALE SKIN / LIGHT FINISH — AFTER HEAD AND HAIR ARE COMPLETE:
Image 1 is the finished head, selected hairstyle and wide/deep neck backing. It is the SOLE identity, geometry and composition authority. Image 2 is an identity-free skin/light guide only, never a face, fixed skin colour or makeup palette.
EDIT SKIN ONLY across the face, both ears and ENTIRE neck/clavicle backing. REMOVE ALL moles, freckles, black/dark spots, red spots, active/raised acne, whiteheads, acne scars/marks and red/brown discoloration, including permanent or identifying skin spots. There is no mole, freckle or stable-mark preservation exception. Repair each spot and unwanted fine wrinkle groove into neighbouring healthy skin; do not merely brighten a remaining dark centre or raised edge. Blend continuously without patch rims, invented pores or grain.
Use broad diffused frontal key/fill and authentic complexion depth. Correct casts, excessive shadows and uneven tone across face–ears–neck together; gently lift deficient diffuse midtones approximately 8–12%, protect already-bright regions and reduce oily hotspots to soft satin. Keep delicate photographic texture and broad facial volume; no fixed whitening, grey skin, opaque mask, wax/plastic blur, fog or coarse/stamped pores.
LOCK THE COMPLETED HAIR AND GEOMETRY: Keep the exact selected hairstyle, hairline, parting, length, strands, colour, volume and silhouette from Image 1. Do not regrow original hair, reinterpret a hairstyle reference, add flyaways or alter hair pixels. Preserve face/head proportions, jaw/chin/ear contours, eye openings, eyelid borders/folds, iris/pupil colour, texture, size/position, gaze, catchlights, expression, nose, lip outline and head scale. Keep neck shape, U-backing boundary, canvas dimensions, pose, framing and plain blue background unchanged. Skin marks are removable surface detail, not protected facial anatomy. Do not erase brows/lashes, nostrils, eyelid folds or the mouth opening as spots. No new body, garment or jewellery.
${cosmetics}
Return the same finished portrait with clean continuous face/ear/neck skin and soft light. Do not make a cutout or change the background; matting and outfit composition follow only after this edit succeeds.`;
}

export async function processFemaleHairFirstPortrait({input,fields,selected,root,key,onStage,requestPortrait,removeBackground,cleanCutout}){
 const chosen=selected.id&&selected.id!=='original'?selected:null;
 const reference=chosen?await readFile(path.join(root,'public','assets',chosen.referenceDirectory==='hair'?'hair':'seedream-hairstyles/references',chosen.file)):null;
 const hair=reference?(chosen.referenceDirectory==='hair'?await prepareFreePngReference(reference,chosen.id):await prepareCatalogueHairOnly(reference,chosen.id,root)):null;
 // Load both guides before spending on either provider request.
 const [identity,neckReference,skinReference]=await Promise.all([
  sharp(input.buffer,{limitInputPixels:33554432}).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer(),
  loadNeckBackingGuide(root),loadStudioSkinLightReference(root)
 ]);
 const identityIndex=hair?3:2,neckIndex=identityIndex+1;
 const prompt=femaleHairFirstPrompt(selected)+`\nORIGINAL-UPLOAD IDENTITY ONLY — IMAGE ${identityIndex}: Same woman's anatomy and expression only; Image 1 controls framing and head scale. Do not copy hair from this identity image over the selected design.\n`+neckBackingGuideInstruction(neckIndex);
 await onStage('generation');
 const head=await requestPortrait({key,prompt,size:'2K',portrait:input.buffer,portraitMime:input.mimetype,...(hair?{hair}:{}),identity,neckReference});
 if(!head?.png?.length)throw Object.assign(Error('สร้างหัวและทรงผมไม่สำเร็จ เก็บงานเดิมไว้'),{code:'female_head_invalid'});
 await onStage('skin-finish');
 // No original/hair reference in this edit: the completed head is authoritative.
 const finished=await requestPortrait({key,prompt:femaleHairFirstSkinPrompt(fields.femaleEyeStyle||'natural'),size:'2K',portrait:head.png,portraitMime:'image/png',skinReference});
 if(!finished?.png?.length)throw Object.assign(Error('ปรับผิวไม่สำเร็จ เก็บงานเดิมไว้'),{code:'female_skin_finish_invalid'});
 const [headInfo,finishInfo]=await Promise.all([sharp(head.png).metadata(),sharp(finished.png).metadata()]);
 if(headInfo.width!==finishInfo.width||headInfo.height!==finishInfo.height)throw Object.assign(Error('ขนาดภาพเปลี่ยนระหว่างปรับผิว เก็บงานเดิมไว้'),{code:'female_skin_geometry_changed'});
 await onStage('matting');
 const matted=await removeBackground(finished.png);
 await onStage('edges');
 const {png,alpha}=await cleanCutout(matted);
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('แยกพื้นหลังโปร่งใสไม่สำเร็จ กรุณาลองใหม่');
 return png;
}
