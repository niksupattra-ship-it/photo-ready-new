import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {selectedHairDesign} from './hairstyle-catalog.js';

// Reference preparation only. Never trim customer or generated portrait pixels.
// A front-draped catalogue cutout contradicts the rear-only outfit instruction.
// Retain its real crown/part/texture while describing long length behind the back.
export async function thaiRearHairReference({selected,hair,root}){
 if(!hair||selected?.interfaceLanguage==='en'||selectedHairDesign(selected)?.kind!=='long'||!/^seedream-\d{2}$/.test(selected.id))return hair;
 const manifest=JSON.parse(await readFile(path.join(root,'public/assets/catalogue-hair-guides/v1/manifest.json'),'utf8'));
 const entry=manifest.entries?.[selected.id];
 if(!entry?.face?.[152])throw Error('Selected long hairstyle reference is unavailable');
 const meta=await sharp(hair).metadata();
 if(meta.width!==entry.width||meta.height!==entry.height)throw Error('Selected long hairstyle reference dimensions changed');
 const height=Math.max(1,Math.min(meta.height,Math.ceil(entry.face[152].y*meta.height)));
 return sharp(hair).extract({left:0,top:0,width:meta.width,height}).png().toBuffer();
}
export const THAI_REAR_HAIR_FINAL_POLICY=`FINAL THAI GARMENT OCCLUSION AUTHORITY — REAR HAIR V2: Any hairstyle reference cropped at chin height is a CROWN/PART/TEXTURE reference only, never an instruction to shorten the selected long cut. Continue its true long lengths entirely BEHIND the shoulders and back. No hair is visible on the jacket front, collar, tie, chest or shoulder boards. This overrides every earlier instruction to preserve front drapes, shoulder-side endpoints or all reference pixels. Both entire epaulettes and jacket shoulders are solid uninterrupted garment in front of hair; no background-coloured hole, missing cloth or erased rank detail where old hair used to be. The original person's clothing and front hair are replaced in this ONE generation. Preserve the real face and eyes. Complete skin-to-collar join is one natural seam. Do not output a repair mask or paste garment pixels.`;
