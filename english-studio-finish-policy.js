import {isEnglishBodyPortrait} from './english-body-portrait.js';
export const ENGLISH_STUDIO_FINISH_VERSION='en-reference-soft-matte-pair-v1';
export const usesEnglishStudioFinish=fields=>isEnglishBodyPortrait(fields)&&fields.englishStudioFinishVersion===ENGLISH_STUDIO_FINISH_VERSION;
export function validateEnglishStudioFinish(fields){
 if(fields.englishStudioFinishVersion!==undefined&&!usesEnglishStudioFinish(fields))throw Error('Invalid English studio finish version');
}
