import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
import {THAI_COLLARLESS_VERSION,THAI_COLLARLESS_PREVIOUS_VERSION,collarlessTemplatePath} from './thai-collarless-version.js';
export {THAI_COLLARLESS_VERSION} from './thai-collarless-version.js';
export const usesThaiCollarlessNeckline=fields=>isThaiOutfitAi(fields)&&[THAI_COLLARLESS_VERSION,THAI_COLLARLESS_PREVIOUS_VERSION].includes(fields.thaiCollarlessVersion)&&fields.portraitMode==='female'&&/^\/assets\/government-uniforms\/female-(operational|academic|senior|government-employee)\.png$/.test(fields.neckOutfitReferencePath||'');
export const usesThaiCollarlessPrimary=fields=>usesThaiCollarlessNeckline(fields)&&fields.thaiCollarlessVersion===THAI_COLLARLESS_VERSION;
export function thaiCollarlessOutfitPath(fields,originalPath){return usesThaiCollarlessPrimary(fields)?collarlessTemplatePath(originalPath)||originalPath:originalPath}
export function thaiCollarlessPrimaryInstruction(outfitIndex,detailIndex){return `\nCOLLARLESS PRIMARY OUTFIT — ALL GARMENT REFERENCES AGREE:
Image ${outfitIndex}, the body layout and BOTH detail crops in Image ${detailIndex} all show the selected outfit WITHOUT an inner pointed shirt collar. Reproduce that exact collarless inner-shirt construction. Plain white inner-shirt fabric continues beside the black tie knot with no collar points, no raised collar band and no repeated white outline. Keep ONLY the outer jacket lapels, the selected black tie, cloth, shoulder boards and all selected insignia. Do not invent a conventional shirt collar from the uploaded person or hairstyle/makeup photographs. REMOVE both pointed shirt-collar flaps. The third neckline panel, cropped from the same real selected garment, only reinforces the same construction; it does not replace the selected rank, face, tie or body. Complete the faithful outfit inside this one original generation.`}
export async function addThaiCollarlessReference(details,root,realOutfit=null){
 if(!details?.length)throw Error('missing_selected_outfit_detail');
 const guide=realOutfit?await sharp(realOutfit).extract({left:650,top:280,width:750,height:620}).png().toBuffer():await readFile(path.join(root,'public/assets/government-insignia/collarless-neckline-v1.webp'));
 const panel=await sharp(guide).resize(768,768,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 return sharp({create:{width:2304,height:768,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:details,left:0,top:0},{input:panel,left:1536,top:0}]).png().toBuffer();
}
export function thaiCollarlessInstruction(outfitIndex,detailIndex){
 if(!Number.isInteger(outfitIndex)||!Number.isInteger(detailIndex))throw Error('missing_collarless_reference_index');
 return `\nCUSTOMER-SELECTED COLLARLESS INNER SHIRT — DELIBERATE LOCAL DESIGN EXCEPTION:
Image ${detailIndex} has THREE panels. Its first two panels are the unchanged selected outfit from Image ${outfitIndex}; they control colour, fabric, rank, shoulder boards, buttons, original black tie and OUTER JACKET LAPELS. Its RIGHTMOST third panel controls ONLY the requested absence of the pointed INNER SHIRT COLLAR.
REMOVE both pointed shirt-collar flaps immediately beside the tie knot. Continue plain smooth white inner-shirt fabric where those flaps used to be, meeting the base of the neck without a folded collar, collar points, upright collar band or another parallel white outline. Keep the black tie knot and complete tie, both outer jacket lapels and all selected original uniform details. Do not remove the jacket lapels, expose bare chest, lengthen the neck, copy a new rank or redraw insignia from the third panel.
The original inner shirt collar visible in Image ${outfitIndex}, the layout and the first two detail panels is intentionally OBSOLETE for this request. Earlier exact-garment/single-collar instructions must preserve the selected OUTER jacket and tie, but must not restore that inner pointed shirt collar. The third panel changes only this neckline construction, never the person's face, hair, skin, garment colour, outer silhouette, camera framing or insignia. Deliver the collarless inner shirt in the SAME original AI generation, without a mask, extra provider request or post-image patch.`;
}
