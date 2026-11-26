import {proLabPayload,registerSeedreamProLab} from './seedream-pro-lab.js';
import {seedreamLabPayload} from './seedream-review-transport.js';

// The review service's ARK_MODEL was confirmed by the owner's screenshot.
// Keep its Flash transport separate from the existing Pro experiment.
export async function femaleFlashLabPayload(options){
 if(options.order!=='person-outfit-hair')throw Error('ใช้ลำดับ คน ชุด ผม เท่านั้น');
 const {prompt,image}=await proLabPayload(options);
 return seedreamLabPayload(prompt,image);
}
export function registerFemaleFullLab(app,options={}){
 registerSeedreamProLab(app,{...options,route:'/api/female-full-lab',payloadFor:femaleFlashLabPayload});
}
