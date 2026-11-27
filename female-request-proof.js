import {createHash} from 'node:crypto';

export const femaleBytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Fingerprint the actual provider body, never the caller's UI options. No key,
// prompt text or photo bytes are retained in this diagnostic record.
export function femaleRequestProof(payload){
 const roles=['guide','identity','hair','outfit'];
 if(!Array.isArray(payload.image)||payload.image.length!==4)throw Error('Expected four female references');
 return {
  version:1,requestSha256:femaleBytesHash(JSON.stringify(payload)),
  promptSha256:femaleBytesHash(payload.prompt),model:payload.model,size:payload.size,
  images:payload.image.map((value,index)=>{
   const match=/^data:(image\/[a-z]+);base64,(.+)$/s.exec(value);
   if(!match)throw Error('Invalid female reference encoding');
   const bytes=Buffer.from(match[2],'base64');
   return {role:roles[index],mime:match[1],bytes:bytes.length,sha256:femaleBytesHash(bytes)};
  })
 };
}

export function logFemaleRequestProof(origin,proof,{phase='request',requestId=null,png=null,delivered=null}={}){
 console.info('Female request proof:',JSON.stringify({origin,phase,requestId,...proof,
  ...(png?{aiPngSha256:femaleBytesHash(png)}:{}),
  ...(delivered?{deliveredPngSha256:femaleBytesHash(delivered)}:{})}));
}
