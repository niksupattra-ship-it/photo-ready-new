import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {selectedHairDesign} from './hairstyle-catalog.js';
const manifests=new Map();
export async function selectedRearLayoutHair({selected,hair,root}){
 if(!hair||selected?.interfaceLanguage==='en'||!/^seedream-\d{2}$/.test(selected?.id||''))return null;
 try{
  const filename=path.join(root,'public/assets/catalogue-hair-guides/v1/manifest.json');
  if(!manifests.has(filename))manifests.set(filename,readFile(filename,'utf8').then(JSON.parse).catch(e=>{manifests.delete(filename);throw e}));
  const entry=(await manifests.get(filename)).entries?.[selected.id],meta=await sharp(hair).metadata();
  if(!entry||meta.width!==entry.width||meta.height!==entry.height||!meta.hasAlpha)return null;
  const points=[234,454,10,152].map(i=>entry.face?.[i]);
  if(!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
  const faceWidth=Math.abs(points[1].x-points[0].x)*meta.width,faceHeight=(points[3].y-points[2].y)*meta.height;
  if(faceWidth<16||faceHeight<16)return null;
  return {buffer:hair,width:meta.width,height:meta.height,faceWidth,faceHeight,centerX:(points[0].x+points[1].x)*meta.width/2,chinY:points[3].y*meta.height};
 }catch{return null} // Optional conditioning view cannot fail a completed job.
}
export function selectedRearHairContract(prompt,selected,{keepCurrentHair=false,hairIndex=2}={}){
 const design=keepCurrentHair?null:selectedHairDesign(selected),kind=design?.kind||'current';
 return prompt
  .replaceAll('including any intended shoulder-side lengths','with those same lengths behind BOTH shoulders')
  .replaceAll('preserve the actual connected lengths, ends and shoulder-side silhouette','preserve the actual connected lengths and ends behind BOTH shoulders')+`
FINAL SELECTED HAIR AND PHYSICAL OCCLUSION CONTRACT:
${design?`Use ONLY the selected ${selected.id} hairstyle (${kind}) from ${selected.promptOnly?'its chosen text description':`Image ${hairIndex}`}.`:'Use only the actual supplied current hairstyle, without inventing a different cut.'} Preserve its actual parting, fringe, crown/braid structure, curl/wave texture, colour and cut length; identity photographs supply no replacement hairstyle. The primary board, when it shows selected hair, places that SAME design behind the fixed garment, not an alternative cut.
ALL continuing hair lengths must descend BEHIND BOTH SHOULDERS AND BEHIND THE OPAQUE CLOTH. The garment physically occludes hair: every shoulder board, jacket shoulder, collar, tie, lapel and front chest stays fully visible, with ZERO hair laid on it. Move front-draped sections behind the shoulders without shortening the real selected cut, changing its part or turning it into a bob, ponytail or bun. Short/bob/gathered designs retain their genuine endpoints and get no invented long extensions. Do not copy old source hair, merge two styles, cut a background hole into fabric or repaint an insignia to hide overlap.
Keep the current frontal face/neck pose, original eye identity, head dimensions, neck dimensions and complete garment scale unchanged. Resolve the selected style and behind-shoulder placement inside this SAME original generation. This physical layering rule overrides earlier shoulder-side/end-preservation wording only; it does not redesign the hairstyle. No garment paste, hair eraser, mask repair or second AI call.`;
}
