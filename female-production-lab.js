import {completeFemaleLabResult} from './female-lab-output.js';
import multer from 'multer';
import {fileURLToPath} from 'node:url';
import {registerFemaleLabTransport} from './female-full-lab-transport.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {createFemaleLabBase} from './female-portrait-layout.js';
import {femaleMatchedProPayload} from './female-matched-pro-payload.js';
import {FEMALE_PORTRAIT_PROMPT} from './female-portrait-prompt.js';

const route='/api/female-production-lab';
export const productionLabPrompt=()=>FEMALE_PORTRAIT_PROMPT;
export async function productionLabPayload({prompt,order,files,fields}){
 prompt=typeof prompt==='string'?prompt.replace(/\r\n/g,'\n'):prompt;
 if(prompt!==productionLabPrompt())throw Error('Prompt does not match current production');
 const person=files?.person?.[0]?.buffer;
 if(!person)throw Error('Missing original portrait');
 const face=await prepareFemaleFace(person,fields?.femalePreplacedFace);
 if(order!=='person-outfit-hair')throw Error('Invalid reference order');
 return femaleMatchedProPayload({prompt,identityFaceOnly:true,files:{...files,face:[{buffer:face}]}});
}
export {completeFemaleLabResult as productionLabResult} from './female-lab-output.js';
export function registerFemaleProductionLab(app,{removeBackground, ...options}={}){
 app.get('/female-reference-evidence-client.js',(_req,res)=>res.type('application/javascript').sendFile(fileURLToPath(new URL('./female-reference-evidence-client.js',import.meta.url))));
 app.get(route+'/prompt',(_req,res)=>res.set('Cache-Control','no-store').type('text').send(productionLabPrompt()));
 app.get(route+'/face-contract.js',(_req,res)=>res.type('application/javascript').sendFile(fileURLToPath(new URL('./female-preplaced-face-contract.js',import.meta.url))));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:2,fields:1,parts:3,fieldSize:12000}}).fields([{name:'person',maxCount:1},{name:'outfit',maxCount:1}]);
 app.post(route+'/guide',(req,res)=>upload(req,res,async error=>{
  res.set('Cache-Control','no-store');
  try{
   if(error||!req.files?.outfit?.[0]||!req.files?.person?.[0])throw Error('Missing references');
   const face=await prepareFemaleFace(req.files.person[0].buffer,req.body.femalePreplacedFace);
   res.type('png').send(await createFemaleLabBase(req.files.outfit[0].buffer,face));
  }catch{res.status(400).json({error:'เตรียมไกด์ไม่ได้ กรุณาใช้รูปหน้าตรงและเลือกชุดใหม่'});}
 }));
 registerFemaleLabTransport(app,{...options,route,fieldLimit:5,payloadFor:productionLabPayload,processResult:(png,{files})=>completeFemaleLabResult(png,removeBackground,{outfit:files.outfit[0].buffer})});
}
