import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import sharp from 'sharp';

export const STUDIO_SKIN_LIGHT_REFERENCE_PATH='public/assets/skin-light-reference/studio-soft-frontal-v1.jpg';
const pending=new Map();
const unavailable=()=>Object.assign(Error('ระบบปรับผิวกำลังอัปเดต กรุณารีเฟรชหน้าเว็บแล้วลองใหม่'),{status:503,code:'studio_skin_reference_unavailable'});

// A fixed server asset, never an arbitrary client image or external URL.
// The visual guide is derived from the selected look and contains no identity.
export async function loadStudioSkinLightReference(root){
 const key=path.resolve(root||'.');
 if(!pending.has(key)){
  const work=(async()=>{
   try{
    const file=path.join(key,STUDIO_SKIN_LIGHT_REFERENCE_PATH),entry=await stat(file);
    if(!entry.isFile()||entry.size<1000||entry.size>300*1024)throw unavailable();
    const image=await readFile(file),decoder=sharp(image,{limitInputPixels:1024*1024}),m=await decoder.metadata();
    if(m.format!=='jpeg'||!m.width||!m.height||m.width<64||m.height<64||m.width>1024||m.height>1024||(m.pages||1)!==1)throw unavailable();
    await decoder.raw().toBuffer();return image;
   }catch{throw unavailable()}
  })();
  pending.set(key,work);work.catch(()=>{if(pending.get(key)===work)pending.delete(key)});
 }
 return Buffer.from(await pending.get(key));
}

export function skinLightReferenceInstruction(index){
 if(!Number.isInteger(index)||index<2||index>6)throw Error('Invalid skin/light reference position');
 return `\nIDENTITY-FREE SKIN / LIGHT STYLE GUIDE — IMAGE ${index}, THE LAST IMAGE: This derived six-swatch visual board supplies ONLY the photographic skin material and broad soft illumination target. It is not another person or a makeup reference. The top row is MAGNIFIED fine-skin texture: reproduce only subtle uniform pores at normal portrait scale, never enlarged dots, copied freckles/spots, repeated stamps or visible noise. The lower row shows broad diffuse lighting gradients, not point highlights or spotlights. Select the complexion-depth example closest to the uploaded person's authentic underlying complexion; match softness, evenness, fine texture and restrained satin response rather than copying a swatch's RGB values or whitening the person. Correct source exposure and unwanted lighting casts adaptively, and use a broad soft frontal key plus balanced fill across face, ears and neck with light anatomical shading. The same uploaded person's image and identity crop remain the only authorities for anatomy, eyes, nose, mouth, proportions, expression and identity. Never copy makeup, facial features, anatomy, grid layout or gutters. OUTPUT ONE coherent head/hair/neck asset on the established temporary background, never a skin board, collage or grid.\n`;
}
