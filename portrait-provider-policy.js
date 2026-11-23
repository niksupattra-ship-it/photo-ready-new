import {productionHair} from './hairstyle-catalog.js';
import {requestReviewSeedream} from './seedream-review-transport.js';
export function isThaiFemalePortrait(fields={}){
 return fields.interfaceLanguage!=='en'&&(productionHair(fields.hairId)?.gender||fields.portraitMode)==='female';
}
export function portraitProviderFor(fields={},env=process.env){
 const key=env.ARK_API_KEY;
 if(!key)throw Object.assign(Error('ยังไม่ได้ตั้งค่า ARK_API_KEY'),{status:503,code:'seedream_not_configured'});
 return {id:'seedream',key,requestPortrait:requestReviewSeedream};
}
