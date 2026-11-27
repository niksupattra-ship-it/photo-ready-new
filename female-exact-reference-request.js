import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {FEMALE_EXACT_PROMPT_VERSION,FEMALE_PREPLACED_PROMPT_VERSION,FEMALE_LUMINOUS_PROMPT_VERSION,FEMALE_HAIR_REPLACEMENT_VERSION,FEMALE_REAR_HAIR_VERSION,FEMALE_EXACT_PROMPT,usesFemaleExactPrompt} from './female-exact-prompt-policy.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {productionFemalePromptFor} from './production-female-skin-prompt.js';
import {productionFemaleV9Payload} from './production-female-v9-payload.js';
import {isThaiOutfitPath} from './thai-outfit-ai-policy.js';



export async function generateExactFemalePortrait({input,fields,root,key,chosen,currentHair,requestPortrait,onStage}){
 if(!usesFemaleExactPrompt(fields)||!isThaiOutfitPath(fields.neckOutfitReferencePath)||chosen&&chosen.gender!=='female')throw Error('ข้อมูลคำสั่งหรือรูปอ้างอิงผู้หญิงไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ');
 if(fields.preserveHairJobId&&!currentHair)throw Error('ไม่พบรูปทรงผมเดิม · เก็บภาพเดิมไว้');
 const mime=async buffer=>{const {format}=await sharp(buffer,{limitInputPixels:33554432}).metadata();const type={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[format];if(!type)throw Error('Unsupported reference image format');return type;};
 const hairReference=async()=>{
  let buffer;
  if(fields.keepCurrentHair==='1'||!chosen)buffer=currentHair||input.buffer;
  
  else{
   if(!chosen.file||path.basename(chosen.file)!==chosen.file)throw Error('ไม่พบรูปทรงผมที่เลือก');
   buffer=await readFile(path.join(root,'public/assets',chosen.referenceDirectory==='hair'?'hair':'seedream-hairstyles/references',chosen.file));
  }
  return buffer;
 };
 // Transport sends original person, selected garment, then hairstyle to match ModelArk trial. No neutral board, alternate skin
 // reference, old hair contract, geometry prompt or native outfit repair.
 const [portrait,hair,outfit]=await Promise.all([input.buffer,hairReference(),readFile(path.join(root,'public',fields.neckOutfitReferencePath.slice(1)))]);
 if([FEMALE_PREPLACED_PROMPT_VERSION,FEMALE_LUMINOUS_PROMPT_VERSION,FEMALE_HAIR_REPLACEMENT_VERSION,FEMALE_REAR_HAIR_VERSION].includes(fields.thaiWholeHeadGuideVersion)){
  await onStage('preparing');
  const face=await prepareFemaleFace(portrait,fields.femalePreplacedFace),prompt=productionFemalePromptFor(fields.thaiWholeHeadGuideVersion);
  const preparedFemalePayload=await productionFemaleV9Payload({prompt,order:'person-outfit-hair',identityFaceOnly:[FEMALE_HAIR_REPLACEMENT_VERSION,FEMALE_REAR_HAIR_VERSION].includes(fields.thaiWholeHeadGuideVersion)&&Boolean(chosen)&&fields.keepCurrentHair!=='1',files:{person:[{buffer:portrait}],face:[{buffer:face}],outfit:[{buffer:outfit}],hair:[{buffer:hair}]}});
  await onStage('generation');
  return requestPortrait({key,prompt,preparedFemalePayload,femalePreplacedVersion:fields.thaiWholeHeadGuideVersion,singleAttempt:true});
 }
 await onStage('generation');
 return requestPortrait({key,prompt:FEMALE_EXACT_PROMPT,femaleExactPromptVersion:FEMALE_EXACT_PROMPT_VERSION,singleAttempt:true,size:'1.5K',portrait,portraitMime:await mime(portrait),hair,hairMime:await mime(hair),outfit,outfitMime:await mime(outfit)});
}
