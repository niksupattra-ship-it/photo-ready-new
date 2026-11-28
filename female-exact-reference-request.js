import {femaleMatchedProPayload} from './female-matched-pro-payload.js';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {FEMALE_PORTRAIT_PROMPT,usesFemaleExactPrompt} from './female-portrait-prompt.js';
import {FIRST_GENERATION_FEMALE_HAIR} from './hairstyle-catalog.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {isThaiOutfitPath} from './thai-outfit-ai-policy.js';



export async function generateExactFemalePortrait({input,fields,root,key,chosen,currentHair,requestPortrait,onStage}){
 if(!usesFemaleExactPrompt(fields)||!isThaiOutfitPath(fields.neckOutfitReferencePath)||chosen&&chosen.gender!=='female')throw Error('ข้อมูลคำสั่งหรือรูปอ้างอิงผู้หญิงไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ');
 // A selected catalogue style must never fall back to a donor portrait or a
 // previous generated portrait. The default also uses a separate hair-only PNG.
 const hairReference=async()=>{
  const id=chosen?.id||FIRST_GENERATION_FEMALE_HAIR;
  if(fields.keepCurrentHair==='1'||fields.preserveHairJobId)throw Error('กรุณาเลือกทรงผมจากรายการก่อนสร้างภาพ');
  if(chosen?.referenceDirectory==='hair'){
   if(!/^hair-\d{2}\.png$/.test(chosen.file||'')||chosen.file!==id+'.png')throw Error('Invalid hair PNG');
   return readFile(path.join(root,'public/assets/hair',chosen.file));
  }
  if(!/^seedream-\d{2}$/.test(id))throw Error('Invalid hairstyle ID');
  const file=String(Number(id.slice('seedream-'.length)))+'.png';
  if(chosen&&chosen.file!==file)throw Error('Invalid hairstyle PNG mapping');
  return readFile(path.join(root,'public/assets/seedream-hairstyles/references',file));
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
