import sharp from 'sharp';
export {AI_MAKEUP_PAIR_VERSION} from './ai-makeup-pair-policy.js';
export const AI_MAKEUP_PROMPT=`Apply professional peach-rose portrait makeup to Image 1, the finished natural portrait. Return this exact photograph with makeup: softly defined natural brows, blended rose eyeshadow, fine eyeliner following the existing eyelid margin, soft blush and rose lip pigment with a restrained satin finish. Keep the same person, facial anatomy, expression, eye openings, gaze, iris/pupils, nose, mouth contour, age and complexion. Preserve the exact hairstyle, hairline, ears, neck, framing, pixel dimensions, head position, scale and background. Do not reshape, relight, whiten, move or regenerate the person. Only cosmetics may change; no new hair, clothes, ornaments, grids or second portrait.`;
export async function createAiMakeupVariant(natural,{key,requestPortrait}){
 const {width,height}=await sharp(natural).metadata();
 const portrait=await sharp(natural).flatten({background:'#5a86b0'}).png().toBuffer();
 const result=await requestPortrait({key,prompt:AI_MAKEUP_PROMPT,portrait,portraitMime:'image/png',size:`${width}x${height}`});
 if(!result?.png?.length)throw Error('สร้างภาพแต่งหน้าไม่สำเร็จ กรุณาลองใหม่');
 const meta=await sharp(result.png).metadata();
 if(!meta.width||!meta.height||Math.abs(meta.width/meta.height-width/height)>.02)throw Error('ภาพแต่งหน้ามีสัดส่วนไม่ตรงกับภาพฐาน');
 const alpha=await sharp(natural).ensureAlpha().extractChannel(3).toBuffer();
 const rgb=await sharp(result.png).resize(width,height).removeAlpha().png().toBuffer();
 return sharp(rgb).joinChannel(alpha).png().toBuffer();
}
