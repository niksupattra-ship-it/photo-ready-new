import {PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS,THAI_FREE_MALE_HAIR_IDS} from './hairstyle-catalog.js';

export const THAI_BASIC_AI_MESSAGE='โปร 99 ใช้ AI เปลี่ยนได้เฉพาะทรงผมฟรีกับชุดเดิมของรูปนี้ เปลี่ยนชุดด้วยการวาง PNG และปรับแต่งเองได้ หรือใช้โปร 159 เพื่อสร้างชุดด้วย AI';
export function basicThaiHairRequestAllowed(body,kind,templates){
 const hair=PRODUCTION_HAIR_CATALOG.find(h=>h.id===body?.hairId);
 const free=hair&&(hair.gender==='female'?THAI_FREE_FEMALE_HAIR_IDS.includes(hair.id):THAI_FREE_MALE_HAIR_IDS.includes(hair.id));
 const outfit=body?.neckOutfitReferencePath||'';
 return Boolean(kind==='hairstyle'&&free&&templates.includes(outfit)&&(!body.outfitReferencePath||body.outfitReferencePath===outfit));
}
