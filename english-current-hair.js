import {isEnglishBodyPortrait} from './english-body-portrait.js';
import {isEnglishHeadPortrait} from './english-head-portrait.js';
export function validateCurrentHairRequest(fields={}){
 if(!fields.keepCurrentHair&&!fields.preserveHairJobId)return;
 if(fields.keepCurrentHair!=='1'||!(isEnglishBodyPortrait(fields)||isEnglishHeadPortrait(fields))||(fields.hairId||'original')!=='original'||(fields.preserveHairJobId&&typeof fields.preserveHairJobId!=='string'))throw Error('Invalid current hairstyle option');
}
export async function loadCurrentHairReference(fields,wallet,lookup){
 validateCurrentHairRequest(fields);
 if(!fields.preserveHairJobId)return null;
 const job=await lookup(fields.preserveHairJobId,wallet);
 if(!job||job.status!=='completed'||!job.result?.length)throw Error('Your previous portrait is unavailable. Choose a hairstyle or reopen your portrait.');
 return job.result;
}
