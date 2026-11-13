import path from 'node:path';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {requestReviewSeedream} from './seedream-review-transport.js';
import {createAiMakeupVariant} from './ai-portrait-makeup.js';
import {isEnglishBodyOutfitPath,ENGLISH_HEAD_BODY_POLICY,ENGLISH_OUTFIT_LIGHTING_POLICY} from './english-body-portrait.js';
export function validateEnglishProportionMetrics(value){
 if(!value||![value.faceRatio,value.headRatio,value.headScale].every(Number.isFinite)||value.faceRatio<.1||value.faceRatio>1||value.headRatio<.15||value.headRatio>2||value.headScale<.76||value.headScale>.94)throw Object.assign(Error('Invalid proportion measurements'),{status:400});
 return {faceRatio:value.faceRatio,headRatio:value.headRatio,headScale:value.headScale};
}
export async function correctEnglishProportions({portrait,fields,metrics,root,key,removeBackground,hasMakeup=false,requestPortrait=requestReviewSeedream}){
 const measured=validateEnglishProportionMetrics(metrics),template=fields.neckOutfitReferencePath;
 if(!isEnglishBodyOutfitPath(template))throw Object.assign(Error('Invalid English outfit'),{status:400});
 const {width,height}=await sharp(portrait).metadata();
 const input=await sharp(portrait).flatten({background:'#5a86b0'}).png().toBuffer();
 const outfit=await sharp(await readFile(path.join(root,'public',template.slice(1)))).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const prompt=`Correct the proportions of the SAME complete person in Image 1; do not create a new identity or hairstyle. Its measured face/shoulder ratio is ${measured.faceRatio.toFixed(3)} and crown-to-chin/shoulder ratio is ${measured.headRatio.toFixed(3)}. The head is oversized. Reduce the WHOLE head (skull, face, ears and attached hair) to approximately ${Math.round(measured.headScale*100)}% of its present linear size relative to the existing torso. Move it naturally down onto the same upright supporting neck, rendering continuous skin and hair with no seams or pasted panels. Preserve every internal facial proportion, expression, skin finish, hair design and age. Keep the existing garment and shoulder shape, fabric, colour, buttons and insignia; Image 2 is the selected outfit detail reference. Do not enlarge shoulders, narrow the face or crop away the chest to fake a correction. Keep both complete shoulder ends, the same canvas dimensions and a medium-blue temporary background for matting.\n${ENGLISH_HEAD_BODY_POLICY}\n${ENGLISH_OUTFIT_LIGHTING_POLICY}`;
 const result=await requestPortrait({key,prompt,portrait:input,portraitMime:'image/png',outfit,size:`${width}x${height}`});
 if(!result?.png?.length)throw Error('No proportion correction returned');
 const meta=await sharp(result.png).metadata();if(!meta.width||!meta.height||Math.abs(meta.width/meta.height-width/height)>.02)throw Error('Correction changed portrait framing');
 const resized=await sharp(result.png).resize(width,height).png().toBuffer();
 const natural=await sharp(await removeBackground(resized)).ensureAlpha().png().toBuffer();
 // stats() reads its original input, before extractChannel transformations.
 // This PNG already has alpha: inspect that channel, not red-channel extrema.
 const alpha=(await sharp(natural).stats()).channels[3];
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('Correction background removal failed');
 const makeup=hasMakeup?await createAiMakeupVariant(natural,{key,requestPortrait,preserveOutfit:true}):null;
 return {natural,makeup};
}
