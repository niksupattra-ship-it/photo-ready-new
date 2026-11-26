import {proLabPayload} from './seedream-pro-lab.js';
import {seedreamLabPayload} from './seedream-review-transport.js';
import {createFemaleLabBase,FEMALE_GUIDE_INSTRUCTION} from './female-lab-guide.js';

export async function femaleFlashLabPayload(options){
 if(options.order!=='person-outfit-hair')throw Error('ใช้ลำดับ คน ชุด ผม เท่านั้น');
 const {prompt,image}=await proLabPayload(options);
 const base=await createFemaleLabBase(options.files.outfit[0].buffer,options.files.face?.[0]?.buffer);
 const finalPrompt=prompt.includes(FEMALE_GUIDE_INSTRUCTION)?prompt:prompt+'\n'+FEMALE_GUIDE_INSTRUCTION;
 return {...seedreamLabPayload(finalPrompt,image),image:['data:image/png;base64,'+base.toString('base64'),image[0],image[2],image[1]]};
}
