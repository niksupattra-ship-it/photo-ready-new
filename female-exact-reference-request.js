import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {FEMALE_EXACT_PROMPT_VERSION,FEMALE_EXACT_PROMPT,usesFemaleExactPrompt} from './female-exact-prompt-policy.js';
import {isThaiOutfitPath} from './thai-outfit-ai-policy.js';
import {loadCatalogueHairGuide} from './catalogue-hair-guide.js';
import {prepareFreePngReference} from './free-png-reference.js';

export async function generateExactFemalePortrait({input,fields,root,key,chosen,currentHair,requestPortrait,onStage}){
 if(!usesFemaleExactPrompt(fields)||!isThaiOutfitPath(fields.neckOutfitReferencePath)||chosen&&chosen.gender!=='female')throw Error('ข้อมูลคำสั่งหรือรูปอ้างอิงผู้หญิงไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ');
 if(fields.preserveHairJobId&&!currentHair)throw Error('ไม่พบรูปทรงผมเดิม · เก็บภาพเดิมไว้');
 const source=async buffer=>sharp(buffer,{limitInputPixels:33554432}).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const hairReference=async()=>{
  let buffer;
  if(fields.keepCurrentHair==='1'||!chosen)buffer=currentHair||input.buffer;
  else if(/^seedream-\d{2}$/.test(chosen.id))buffer=await loadCatalogueHairGuide(chosen.id,root);
  else{
   if(!chosen.file||path.basename(chosen.file)!==chosen.file)throw Error('ไม่พบรูปทรงผมที่เลือก');
   buffer=await readFile(path.join(root,'public/assets',chosen.referenceDirectory==='hair'?'hair':'seedream-hairstyles/references',chosen.file));
   if(chosen.referenceDirectory==='hair')buffer=await prepareFreePngReference(buffer,chosen.id);
  }
  return sharp(buffer,{limitInputPixels:33554432}).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).png().toBuffer();
 };
 // EXACTLY Image 1 = original person, Image 2 = selected/current hairstyle,
 // Image 3 = unmodified selected garment. No neutral board, alternate skin
 // reference, old hair contract, geometry prompt or native outfit repair.
 const [portrait,hair,outfit]=await Promise.all([source(input.buffer),hairReference(),readFile(path.join(root,'public',fields.neckOutfitReferencePath.slice(1))).then(source)]);
 await onStage('generation');
 return requestPortrait({key,prompt:FEMALE_EXACT_PROMPT,femaleExactPromptVersion:FEMALE_EXACT_PROMPT_VERSION,singleAttempt:true,size:'1824x2432',portrait,portraitMime:'image/png',hair,outfit});
}
