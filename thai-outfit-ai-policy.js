export const THAI_OUTFIT_AI_VERSION='th-full-outfit-ai-v1';
export const isThaiOutfitAi=fields=>fields?.thaiOutfitAiVersion===THAI_OUTFIT_AI_VERSION;
export const isThaiOutfitPath=value=>typeof value==='string'&&/^\/assets\/(?:job|government|student|gown)-uniforms\/[A-Za-z0-9_-]+\.(?:png|webp)$/.test(value)&&!value.includes('-example');
// Internal rendering reuses the complete-portrait engine. Credit authorization
// continues to inspect the original request's language and Thai marker.
export function thaiOutfitGenerationFields(fields={}){
 if(fields.thaiOutfitAiVersion===undefined)return fields;
 if(!isThaiOutfitAi(fields)||!isThaiOutfitPath(fields.neckOutfitReferencePath))throw Error('ชุดสำหรับแก้ไขด้วย AI ไม่ถูกต้อง');
 return {...fields,interfaceLanguage:'en'};
}
