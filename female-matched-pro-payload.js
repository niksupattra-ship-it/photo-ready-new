import {FEMALE_PORTRAIT_PROMPT} from './female-portrait-prompt.js';
import {currentFemalePortraitPayload} from './female-portrait-payload.js';
import {PRO_LAB_MODEL} from './seedream-pro-payload.js';
// One shared request builder for the current Pro lab and new production female jobs.
export async function femaleMatchedProPayload({files,prompt=FEMALE_PORTRAIT_PROMPT}){
 if(prompt!==FEMALE_PORTRAIT_PROMPT)throw Error('Unsupported female Pro prompt');
 const payload=await currentFemalePortraitPayload({prompt,order:'person-outfit-hair',files,identityFaceOnly:true});
 return {...payload,model:PRO_LAB_MODEL};
}
