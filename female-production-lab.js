import multer from 'multer';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {registerFemaleLabTransport} from './female-full-lab-transport.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {createFemaleLabBase} from './production-female-v9-layout.js';
import {PRO_LAB_MODEL} from './seedream-pro-payload.js';
import {productionFemaleV9Payload} from './production-female-v9-payload.js';
import {productionFemalePromptFor} from './production-female-skin-prompt.js';
import {FEMALE_REAR_HAIR_VERSION} from './female-exact-prompt-policy.js';
import {preserveExactFemalePixels} from './production-portrait-pipeline.js';
import {planThaiBodyFrame} from './src/thai-body-framing.js';

const route='/api/female-production-lab';
export const productionLabPrompt=()=>productionFemalePromptFor(FEMALE_REAR_HAIR_VERSION);
export async function productionLabPayload({prompt,order,files,fields}){
 prompt=typeof prompt==='string'?prompt.replace(/\r\n/g,'\n'):prompt;
 if(prompt!==productionLabPrompt())throw Error('Prompt does not match current production');
 const person=files?.person?.[0]?.buffer;
 if(!person)throw Error('Missing original portrait');
 const face=await prepareFemaleFace(person,fields?.femalePreplacedFace);
 const payload=await productionFemaleV9Payload({prompt,order,identityFaceOnly:true,files:{...files,face:[{buffer:face}]}});
 // Isolated model comparison: keep the exact production prompt, references and 2K settings.
 return {...payload,model:PRO_LAB_MODEL};
}
export async function productionLabResult(original,removeBackground){
 const {png,alpha}=await preserveExactFemalePixels(original,await removeBackground(original));
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('Background removal did not produce a valid portrait');
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const frame=planThaiBodyFrame(data,info.width,info.height,{fullBodyFrame:true,crownFromAlpha:true});
 // Same uniform source transform as composePortrait / Canvas export, without a face warp.
 const background=await readFile(new URL('./public/assets/background.jpg',import.meta.url));
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="900" height="1200"><image xlink:href="data:image/jpeg;base64,${background.toString('base64')}" width="900" height="1200" preserveAspectRatio="none"/><image xlink:href="data:image/png;base64,${png.toString('base64')}" width="${info.width}" height="${info.height}" transform="translate(${frame.x} ${frame.y}) scale(${frame.scale})"/></svg>`);
 return sharp(svg).png().toBuffer();
}
export function registerFemaleProductionLab(app,{removeBackground, ...options}={}){
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
 registerFemaleLabTransport(app,{...options,route,fieldLimit:5,payloadFor:productionLabPayload,processResult:png=>productionLabResult(png,removeBackground)});
}
