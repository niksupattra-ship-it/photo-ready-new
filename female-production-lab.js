import multer from 'multer';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {registerFemaleLabTransport} from './female-full-lab-transport.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {createFemaleLabBase} from './production-female-v9-layout.js';
import {femaleMatchedProPayload} from './female-matched-pro-payload.js';
import {productionFemalePromptFor} from './production-female-skin-prompt.js';
import {FEMALE_SOFT_KOREAN_PRO_VERSION} from './female-exact-prompt-policy.js';
import {preserveExactFemalePixels} from './production-portrait-pipeline.js';
import {planThaiBodyFrame} from './src/thai-body-framing.js';

const route='/api/female-production-lab';
export const productionLabPrompt=()=>productionFemalePromptFor(FEMALE_SOFT_KOREAN_PRO_VERSION);
export async function productionLabPayload({prompt,order,files,fields}){
 prompt=typeof prompt==='string'?prompt.replace(/\r\n/g,'\n'):prompt;
 if(prompt!==productionLabPrompt())throw Error('Prompt does not match current production');
 const person=files?.person?.[0]?.buffer;
 if(!person)throw Error('Missing original portrait');
 const face=await prepareFemaleFace(person,fields?.femalePreplacedFace);
 if(order!=='person-outfit-hair')throw Error('Invalid reference order');
 return femaleMatchedProPayload({prompt,identityFaceOnly:true,files:{...files,face:[{buffer:face}]}});
}
export async function productionLabResult(original,removeBackground){
 const {png,alpha}=await preserveExactFemalePixels(original,await removeBackground(original));
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('Background removal did not produce a valid portrait');
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const frame=planThaiBodyFrame(data,info.width,info.height,{fullBodyFrame:true,crownFromAlpha:true});
 // Use raster pixels directly. Embedding a detailed 2K PNG as an SVG data URL
 // exceeds libxml's text-node limit, even when the PNG itself is valid.
 const scaled=await sharp(png).affine([frame.scale,0,0,frame.scale],{background:'#00000000',interpolator:sharp.interpolators.bicubic}).png().toBuffer();
 const size=await sharp(scaled).metadata(),x=Math.round(frame.x),y=Math.round(frame.y);
 const left=Math.max(0,-x),top=Math.max(0,-y),destX=Math.max(0,x),destY=Math.max(0,y);
 const width=Math.min(size.width-left,900-destX),height=Math.min(size.height-top,1200-destY);
 if(width<=0||height<=0)throw Error('Portrait is outside the output frame');
 const visible=await sharp(scaled).extract({left,top,width,height}).png().toBuffer();
 return sharp(fileURLToPath(new URL('./public/assets/background.jpg',import.meta.url)))
  .resize(900,1200,{fit:'fill'}).composite([{input:visible,left:destX,top:destY}]).png().toBuffer();
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
