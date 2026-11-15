import {createAiMakeupVariant} from './ai-portrait-makeup.js';
import {requestReviewSeedream} from './seedream-review-transport.js';
import {isEnglishBodyPortrait} from './english-body-portrait.js';
import {usesEnglishStudioFinish} from './english-studio-finish-policy.js';
import {isEnglishHeadPortrait} from './english-head-portrait.js';
import {isEnglishTemplateBody} from './english-template-body-policy.js';

// The original studio makeup is a SECOND IMAGE EDIT on the approved Natural
// image, not a joint hair+makeup generation prompted from the untouched upload.
// Reusing the existing Natural AI pixels makes a Natural -> Makeup switch only
// ONE additional provider request and preserves the original complexion,
// hairstyle, framing, garment, and the exact previously released makeup prompt.
export {NATURAL_MASTER_MAKEUP_VERSION} from './female-single-finish-policy.js';
export const shouldUseNaturalMasterMakeup=(fields,finish)=>
 fields?.portraitMode==='female'&&fields?.femaleFinishSingleVersion==='female-single-finish-v1'&&
 fields?.femaleEyeStyle==='natural'&&finish==='makeup';

export async function generateMakeupFromCompletedNatural({natural,fields,key,requestPortrait=requestReviewSeedream}){
 if(!shouldUseNaturalMasterMakeup(fields,'makeup')||!Buffer.isBuffer(natural)||natural.length===0)throw Error('Natural master is unavailable for AI makeup');
 const english=usesEnglishStudioFinish(fields)||isEnglishHeadPortrait(fields)||isEnglishBodyPortrait(fields);
 const headOnly=english&&isEnglishHeadPortrait(fields);
 const templateBody=english&&isEnglishTemplateBody(fields);
 return createAiMakeupVariant(natural,{
  key,requestPortrait,
  preserveOutfit:english&&!headOnly,
  englishReferenceFinish:english&&!headOnly&&!templateBody,
  englishHeadFinish:headOnly,
  englishTemplateFinish:templateBody
 });
}
