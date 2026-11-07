import {preparePreAiSkin} from './pre-ai-skin.js';
import {createImmutablePortraitMemo} from './immutable-portrait-memo.js';
export const POST_AI_SKIN_VERSION='final-skin-colour-light-v1';
const memo=createImmutablePortraitMemo();
// Runs on the AI cutout, before geometry/garment checks and before it becomes
// an editor layer. Never replaces the original upload or changes job rights.
export function finishAiPortraitSkin(blob,{decode,faceFor,masksFor,toBlob}){
 if(blob.idpromPostAiSkinVersion===POST_AI_SKIN_VERSION)return Promise.resolve(blob);
 return memo(blob,async()=>{
  const image=await decode(blob),[face,masks]=await Promise.all([faceFor(blob,image),masksFor(blob,image)]);
  const result=await preparePreAiSkin(image,masks?.skinMask,face,{finish:'post'});
  try{
   const output=await toBlob(result);
   for(const key of Object.getOwnPropertyNames(blob))if(key.startsWith('idprom'))Object.defineProperty(output,key,Object.getOwnPropertyDescriptor(blob,key));
   output.idpromPostAiSkinVersion=POST_AI_SKIN_VERSION;
   return output;
  }finally{result.width=1;result.height=1}
 });
}
