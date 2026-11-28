import {femaleMatchedProPayload} from './female-matched-pro-payload.js';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {FEMALE_PORTRAIT_PROMPT,usesFemaleExactPrompt} from './female-portrait-prompt.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {isThaiOutfitPath} from './thai-outfit-ai-policy.js';



export async function generateExactFemalePortrait({input,fields,root,key,chosen,currentHair,requestPortrait,onStage}){
 if(!usesFemaleExactPrompt(fields)||!isThaiOutfitPath(fields.neckOutfitReferencePath)||chosen&&chosen.gender!=='female')throw Error('ข้อมูลคำสั่งหรือรูปอ้างอิงผู้หญิงไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ');
 if(fields.preserveHairJobId&&!currentHair)throw Error('ไม่พบรูปทรงผมเดิม · เก็บภาพเดิมไว้');
 const hairReference=async()=>{
  let buffer;
  if(fields.keepCurrentHair==='1'||!chosen)buffer=currentHair||input.buffer;
  
  else{
   if(!chosen.file||path.basename(chosen.file)!==chosen.file)throw Error('ไม่พบรูปทรงผมที่เลือก');
   buffer=await readFile(path.join(root,'public/assets',chosen.referenceDirectory==='hair'?'hair':'seedream-hairstyles/references',chosen.file));
  }
  return buffer;
 };
 // The original person is used only to prepare the guide. The provider gets
 // guide, selected hair and garment, with no separate source-face reference.
 const [portrait,hair,outfit]=await Promise.all([input.buffer,hairReference(),readFile(path.join(root,'public',fields.neckOutfitReferencePath.slice(1)))]);
 await onStage('preparing');
 const face=await prepareFemaleFace(portrait,fields.femalePreplacedFace),prompt=FEMALE_PORTRAIT_PROMPT;
 const preparedFemalePayload=await femaleMatchedProPayload({prompt,fields,files:{person:[{buffer:portrait}],face:[{buffer:face}],outfit:[{buffer:outfit}],hair:[{buffer:hair}]}});
 await onStage('generation');
 return requestPortrait({key,prompt,preparedFemalePayload,femalePreplacedVersion:fields.thaiWholeHeadGuideVersion,singleAttempt:true});
}
