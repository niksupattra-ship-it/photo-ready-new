import sharp from 'sharp';
import {restoreEnglishMakeupSilhouette} from './english-makeup-edge-repair.js';
import {ENGLISH_CLEAN_EAR_AND_SILHOUETTE_POLICY} from './english-studio-finish.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from './makeup-studio-retouch-policy.js';
export {AI_MAKEUP_PAIR_VERSION} from './ai-makeup-pair-policy.js';
// Only the input/edit contract belongs here. Every route uses the same final
// complexion, cosmetics and skin-light specification below, without a second
// locale-specific beauty or powder policy competing with it.
export const AI_MAKEUP_PROMPT=`APPLY THE REQUESTED MAKEUP FINISH TO THIS COMPLETED NATURAL PHOTOGRAPH: Image 1 is the approved Natural portrait of the SAME customer. Edit this same photograph in the existing image request. It supplies identity, facial anatomy, expression, selected hairstyle, pose, image geometry, clothing and background. Its skin surface, cosmetic appearance and face/ear/neck light may be refined according to the single Makeup finish specification below; do not restore old skin defects or treat its previous bare-skin texture as an immutable appearance target. Preserve the original eye openings, iris/pupil details, gaze, real catchlights and lip contour. Return one coherent photograph with the same width, height, framing and outer cutout, without a new person or changed geometry.`;

export async function createAiMakeupVariant(natural,{key,requestPortrait,preserveOutfit=false,englishReferenceFinish=false,englishHeadFinish=false,englishTemplateFinish=false}){
 const {width,height}=await sharp(natural).metadata();
 const portrait=await sharp(natural).flatten({background:'#5a86b0'}).png().toBuffer();
 const outfitLock=preserveOutfit?'\nPreserve the existing selected outfit, complete clothed torso, collar, buttons, shoulder silhouette and head-to-body proportions exactly. Do not remove, replace or redesign any clothing. Preserve fabric weave, pattern direction and scale, stitching, pocket placement, button count and spacing, collar geometry and every insignia’s position, orientation and fine motif. Do not simplify, blur or sharpen these details.':'';
 const englishOnly=Boolean(englishTemplateFinish||englishHeadFinish||englishReferenceFinish);
 const modeLock=englishTemplateFinish
  ?'ENGLISH COMPLETE-OUTFIT GEOMETRY LOCK: Keep the whole outfit at its identical width, height, scale, shoulder silhouette, collar position and lower edge. Keep the entire head, neck, body and selected outfit in exactly the same canvas coordinates and proportions. Preserve the complete garment silhouette, shoulder endpoints, collar and every visible inner blouse, shirt, camisole or vest. Never convert existing cloth into skin, lower an inner neckline, add a second garment or crop the outfit.'
  :englishHeadFinish
   ?'ENGLISH CLOSE-UP HEAD/NECK MASTER LOCK: Preserve the large face detail, exact head scale, neck/clavicle base, framing and outer silhouette. This is the existing isolated head/neck master for placement behind the selected outfit; do not add clothes, shoulders, a torso or a new camera crop.'
   :englishReferenceFinish
    ?'ENGLISH FINISHED-PORTRAIT GEOMETRY LOCK: Keep the complete original portrait, head/neck placement and clothed torso at their identical scale, proportions and canvas coordinates. Preserve every selected garment detail and its existing illumination.'
    :'THAI FINISHED-PORTRAIT GEOMETRY LOCK: Keep this completed portrait at its exact head scale, pose, neck dimensions, framing and cutout boundaries. Preserve existing clothing and garment coverage, if present; do not add a torso or change the portrait composition.';
 const englishEdgeLock=englishOnly?'\n'+ENGLISH_CLEAN_EAR_AND_SILHOUETTE_POLICY+'\nNATURAL OUTER-CUTOUT LOCK: Preserve the existing clean outer silhouette and flat exterior background. No grey/black/blue outline, rim glow, matte fringe, double edge, drop shadow or vignette around hair, ears, jaw, neck, shoulders or garments. Keep the selected hairstyle\'s true connected lengths; remove only extra stray wisps or invented rear layers absent from that design.':'';
 // English AI repairs its own complexion; a separate English-only clean-cutout
 // finishing step later restores only the OUTER silhouette edge, not face skin.
 const prompt=AI_MAKEUP_PROMPT+'\n'+modeLock+outfitLock+englishEdgeLock+'\n'+MAKEUP_STUDIO_RETOUCH_POLICY;
 const result=await requestPortrait({key,prompt,portrait,portraitMime:'image/png',size:`${width}x${height}`});
 if(!result?.png?.length)throw Error('สร้างภาพแต่งหน้าไม่สำเร็จ กรุณาลองใหม่');
 const meta=await sharp(result.png).metadata();
 if(!meta.width||!meta.height||Math.abs(meta.width/meta.height-width/height)>.02)throw Error('ภาพแต่งหน้ามีสัดส่วนไม่ตรงกับภาพฐาน');
 // English: restore a narrow, smoothly feathered Natural cutout boundary to
 // prevent a provider-generated grey/dark halo around hair, neck and outfit.
 // Do not touch interior makeup pixels, reuse existing images, or alter Thai.
 if(englishOnly)return restoreEnglishMakeupSilhouette(natural,result.png,width,height);
 const alpha=await sharp(natural).ensureAlpha().extractChannel(3).toBuffer();
 const rgb=await sharp(result.png).resize(width,height).removeAlpha().png().toBuffer();
 return sharp(rgb).joinChannel(alpha).png().toBuffer();
}
