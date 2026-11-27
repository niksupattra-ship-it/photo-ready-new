import {FEMALE_SOFT_KOREAN_PRO_PROMPT,FEMALE_AGE_LOCK_PRO_PROMPT} from './female-soft-korean-pro-prompt.js';
import {productionFemaleV9Payload} from './production-female-v9-payload.js';
import {FEMALE_MATCHED_PRO_PROMPT} from './female-matched-pro-prompt.js';
import {PRO_LAB_MODEL} from './seedream-pro-payload.js';
// One shared request builder for the current Pro lab and new production female jobs.
export async function femaleMatchedProPayload({files,prompt=FEMALE_AGE_LOCK_PRO_PROMPT}){
 if(![FEMALE_MATCHED_PRO_PROMPT,FEMALE_SOFT_KOREAN_PRO_PROMPT,FEMALE_AGE_LOCK_PRO_PROMPT].includes(prompt))throw Error('Unsupported female Pro prompt');
 const payload=await productionFemaleV9Payload({prompt,order:'person-outfit-hair',files,identityFaceOnly:true,appendGuideInstruction:false});
 return {...payload,model:PRO_LAB_MODEL};
}
