import {FEMALE_55_LAB_PROMPT,female55LabPayloadFrom} from './female-55-lab-prompt.js';
import {currentFemalePortraitPayload} from './female-portrait-payload.js';
import {registerFemaleLabTransport} from './female-full-lab-transport.js';
import {completeGuideEditLabResult} from './female-guide-edit-lab-frame.js';
import {createFemaleLabBase} from './female-portrait-layout.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import multer from 'multer';

// Guide-only request shared with current Thai female production.
export {FEMALE_GUIDE_EDIT_LAB_PROMPT} from './female-guide-edit-prompt.js';
import {FEMALE_GUIDE_EDIT_LAB_PROMPT} from './female-guide-edit-prompt.js';

export async function guideEditLabPayload(options){
 const prompt=typeof options.prompt==='string'?options.prompt.replace(/\r\n/g,'\n'):options.prompt;
 if(prompt!==FEMALE_GUIDE_EDIT_LAB_PROMPT)throw Error('Prompt does not match guide-edit experiment');
 return currentFemalePortraitPayload({...options,prompt});
}

export function registerFemaleGuideEditLab(app,{removeBackground,...options}={}){
 const route='/api/female-guide-edit-lab';
 app.get(route+'/prompt',(_req,res)=>res.set('Cache-Control','no-store').type('text').send(FEMALE_55_LAB_PROMPT));
 const guideUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:2,fields:1,parts:3,fieldSize:12000}}).fields([{name:'person',maxCount:1},{name:'outfit',maxCount:1}]);
 app.post(route+'/guide',(req,res)=>guideUpload(req,res,async error=>{
  res.set('Cache-Control','no-store');
  try{
   if(error||!req.files?.person?.[0]||!req.files?.outfit?.[0])throw Error('Missing references');
   const face=await prepareFemaleFace(req.files.person[0].buffer,req.body.femalePreplacedFace);
   res.type('png').send(await createFemaleLabBase(req.files.outfit[0].buffer,face));
  }catch{res.status(400).json({error:'เตรียมไกด์ไม่ได้ กรุณาใช้รูปหน้าตรงและเลือกชุดใหม่'});}
 }));
 registerFemaleLabTransport(app,{...options,route,fieldLimit:5,payloadFor:female55LabPayloadFrom(guideEditLabPayload,FEMALE_GUIDE_EDIT_LAB_PROMPT),
  processResult:png=>completeGuideEditLabResult(png,removeBackground)});
}
