import {proLabPayload} from './seedream-pro-lab.js';
import {FEMALE_PORTRAIT_MODEL,PORTRAIT_AI_OUTPUT_SIZE} from './seedream-pro-payload.js';

export async function currentFemalePortraitPayload(options){
 if(options.order!=='person-outfit-hair')throw Error('ใช้ลำดับ คน ชุด ผม เท่านั้น');
 const {prompt,image}=await proLabPayload(options);
 return {model:FEMALE_PORTRAIT_MODEL,prompt,image:[image[0],image[2],image[1]],size:PORTRAIT_AI_OUTPUT_SIZE,output_format:'png',response_format:'b64_json',watermark:false};
}
