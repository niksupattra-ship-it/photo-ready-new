import {FEMALE_AGE_LOCK_PRO_PROMPT} from './female-soft-korean-pro-prompt.js';
import {PRO_LAB_MODEL} from './seedream-pro-payload.js';

// Browser-safe fingerprint for cache identity, not for security. Derive it from
// the actual request contract so a prompt edit cannot silently reuse old pixels.
export function femalePromptCacheKey(prompt=FEMALE_AGE_LOCK_PRO_PROMPT,model=PRO_LAB_MODEL){
 let hash=0xcbf29ce484222325n;
 for(const byte of new TextEncoder().encode(JSON.stringify([model,'2K',prompt]))){
  hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
 }
 return 'female-prompt-'+hash.toString(16).padStart(16,'0');
}
export const FEMALE_CURRENT_PROMPT_CACHE_KEY=femalePromptCacheKey();
