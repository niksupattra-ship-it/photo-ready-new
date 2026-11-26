import {proLabPayload} from './seedream-pro-lab.js';
import {registerFemaleLabTransport} from './female-full-lab-transport.js';
import {seedreamLabPayload} from './seedream-review-transport.js';
import multer from 'multer';
import {createFemaleLabBase,FEMALE_GUIDE_INSTRUCTION} from './female-lab-guide.js';

// The review service's ARK_MODEL was confirmed by the owner's screenshot.
// Keep its Flash transport separate from the existing Pro experiment.
export async function femaleFlashLabPayload(options){
 if(options.order!=='person-outfit-hair')throw Error('ใช้ลำดับ คน ชุด ผม เท่านั้น');
 const {prompt,image}=await proLabPayload(options);
 const base=await createFemaleLabBase(options.files.outfit[0].buffer,options.files.face?.[0]?.buffer);
 const finalPrompt=prompt.includes(FEMALE_GUIDE_INSTRUCTION)?prompt:prompt+'\n'+FEMALE_GUIDE_INSTRUCTION;
 return {...seedreamLabPayload(finalPrompt,image),image:['data:image/png;base64,'+base.toString('base64'),image[0],image[2],image[1]]};
}
export function registerFemaleFullLab(app,options={}){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:2,fields:0,parts:2}}).fields([{name:'outfit',maxCount:1},{name:'face',maxCount:1}]);
 app.post('/api/female-full-lab/guide',(req,res)=>upload(req,res,async error=>{
  res.set('Cache-Control','no-store');
  if(error||!req.files?.outfit?.[0]||!req.files?.face?.[0])return res.status(400).json({error:'กรุณาเลือกรูปคนและชุดก่อนเตรียมภาพ'});
  try{res.type('png').send(await createFemaleLabBase(req.files.outfit[0].buffer,req.files.face[0].buffer));}
  catch{res.status(400).json({error:'สร้างไกด์จากชุดนี้ไม่ได้ กรุณาเลือกชุดจากเว็บหลัก'});}
 }));
 registerFemaleLabTransport(app,{...options,route:'/api/female-full-lab',payloadFor:femaleFlashLabPayload,extraFiles:['face']});
}
