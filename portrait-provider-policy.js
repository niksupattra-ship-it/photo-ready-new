import {openaiApiKey} from './openai-api-key.js';
import {productionHair} from './hairstyle-catalog.js';
import {requestReviewSeedream} from './seedream-review-transport.js';
import {requestOpenAIPortrait} from './openai-portrait-transport.js';
export function isThaiFemalePortrait(fields={}){
 return fields.interfaceLanguage!=='en'&&(productionHair(fields.hairId)?.gender||fields.portraitMode)==='female';
}
export function portraitProviderFor(fields={},env=process.env){
 const openai=isThaiFemalePortrait(fields),key=openai?openaiApiKey(env.OPENAI_API_KEY):env.ARK_API_KEY;
 if(!key)throw Object.assign(Error(openai?'ยังไม่ได้ตั้งค่า OPENAI_API_KEY':'ยังไม่ได้ตั้งค่า ARK_API_KEY'),{status:503,code:openai?'openai_not_configured':'seedream_not_configured'});
 return {id:openai?'openai':'seedream',key,requestPortrait:openai?requestOpenAIPortrait:requestReviewSeedream};
}
