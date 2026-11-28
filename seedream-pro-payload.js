// Shared provider settings for the isolated Pro Lab and exact female requests.
// Neither caller adds an appearance, geometry or retouch instruction here.
export const PORTRAIT_AI_OUTPUT_SIZE='2K';
export const FEMALE_PORTRAIT_MODEL='dola-seedream-5-0-flash-260915';
export const PRO_LAB_MODEL='dola-seedream-5-0-pro-260628';
export function seedreamProPayload(prompt,image){
 if(!Array.isArray(image)||image.length!==3)throw Error('Exactly three references required');
 return {model:PRO_LAB_MODEL,prompt,image,size:PORTRAIT_AI_OUTPUT_SIZE,output_format:'png',response_format:'b64_json',watermark:false};
}
