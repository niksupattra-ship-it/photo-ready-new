import {proLabPayload,registerSeedreamProLab} from './seedream-pro-lab.js';
import {seedreamLabPayload} from './seedream-review-transport.js';
import multer from 'multer';
import {createFemaleLabGuide,FEMALE_GUIDE_INSTRUCTION} from './female-lab-guide.js';

// The review service's ARK_MODEL was confirmed by the owner's screenshot.
// Keep its Flash transport separate from the existing Pro experiment.
export async function femaleFlashLabPayload(options){
 if(options.order!=='person-outfit-hair')throw Error('ใช้ลำดับ คน ชุด ผม เท่านั้น');
 const {prompt,image}=await proLabPayload(options);
 const guide=await createFemaleLabGuide(options.files.outfit[0].buffer);
 const finalPrompt=prompt.includes(FEMALE_GUIDE_INSTRUCTION)?prompt:prompt+'\n'+FEMALE_GUIDE_INSTRUCTION;
 return {...seedreamLabPayload(finalPrompt,image),image:[...image,'data:image/png;base64,'+guide.toString('base64')]};
}
export function registerFemaleFullLab(app,options={}){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:0,parts:1}}).single('outfit');
 app.post('/api/female-full-lab/guide',(req,res)=>upload(req,res,async error=>{
  res.set('Cache-Control','no-store');
  if(error||!req.file)return res.status(400).json({error:'กรุณาเลือกภาพชุดที่ถูกต้อง ไม่เกิน 20 MB'});
  try{res.type('png').send(await createFemaleLabGuide(req.file.buffer));}
  catch{res.status(400).json({error:'สร้างไกด์จากชุดนี้ไม่ได้ กรุณาเลือกชุดจากเว็บหลัก'});}
 }));
 registerSeedreamProLab(app,{...options,route:'/api/female-full-lab',payloadFor:femaleFlashLabPayload});
}
