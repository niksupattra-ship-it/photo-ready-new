import {isEnglishBodyPortrait} from './male-portrait-prompt.js';
import {isEnglishHeadPortrait,ENGLISH_HEAD_FINISH_VERSION} from './english-head-portrait.js';
import {isEnglishTemplateBody,englishTemplateBodyFinishForGender} from './english-template-body-policy.js';
export const ENGLISH_STUDIO_FINISH_VERSION='en-reference-soft-matte-pair-v1';
export const usesEnglishStudioFinish=fields=>isEnglishTemplateBody(fields)||isEnglishBodyPortrait(fields)&&fields.englishStudioFinishVersion===ENGLISH_STUDIO_FINISH_VERSION;
export function validateEnglishStudioFinish(fields){
 if(fields.interfaceLanguage==='en'&&fields.portraitComposition==='en-outfit-body-v1'&&fields.englishStudioFinishVersion!==englishTemplateBodyFinishForGender(fields.portraitMode))throw Error('Retired English portrait version; refresh the page');
 if(fields.englishStudioFinishVersion!==undefined&&!usesEnglishStudioFinish(fields)&&!(isEnglishHeadPortrait(fields)&&fields.englishStudioFinishVersion===ENGLISH_HEAD_FINISH_VERSION))throw Error('Invalid English studio finish version');
}
