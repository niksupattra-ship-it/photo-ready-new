// V114 provider boundary. Never guess a vendor endpoint or silently fall back to a billable provider.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROVIDERS = Object.freeze(['openai','meitu','specialized']);
export function providerStatus(env=process.env){
 const selected=env.HAIRSTYLE_PROVIDER||'openai';
 return {selected,providers:{
  openai:{configured:Boolean(env.OPENAI_API_KEY),referenceImage:true},
  meitu:{configured:false,referenceImage:null,reason:'Awaiting official API contract, credentials and custom-reference support confirmation'},
  specialized:{configured:false,referenceImage:null,reason:'Awaiting selected model, deployment and license'}
 }};
}
export function validateHairId(id){return /^hair-(0[1-9]|1[0-9]|2[0-9])$/.test(id||'');}
// Short-lived, bounded memory cache. Stores generated output only, never source portraits.
// Cache key includes portrait bytes, selected reference bytes and exact generation settings.
const MAX_CACHE_ENTRIES=8, CACHE_TTL_MS=15*60*1000;
const results=new Map(),inFlight=new Map();
export function clearHairstyleCache(){results.clear();inFlight.clear();}
export function hairstyleCacheStats(){return {completed:results.size,inFlight:inFlight.size};}
function cacheKey(portrait,reference,hairId,provider){
 return crypto.createHash('sha256').update('v115|gpt-image-1.5|high|high|1024x1536|png|prompt-v114|')
 .update(provider).update(hairId).update(portrait).update(reference).digest('hex');
}
export async function editHairstyle({portrait,hairId,root=process.cwd(),env=process.env,fetcher=fetch}){
 if(!portrait?.buffer?.length)throw Object.assign(Error('กรุณาส่งภาพฐาน'),{status:400});
 if(!validateHairId(hairId))throw Object.assign(Error('หมายเลขทรงผมไม่ถูกต้อง'),{status:400});
 const provider=env.HAIRSTYLE_PROVIDER||'openai';
 if(!PROVIDERS.includes(provider))throw Object.assign(Error('HAIRSTYLE_PROVIDER ไม่ถูกต้อง'),{status:503});
 if(provider!=='openai')throw Object.assign(Error(`${provider}: ยังไม่ได้รับ API contract ที่ยืนยันแล้ว จึงไม่เรียกบริการอื่นแทน`),{status:503});
 if(!env.OPENAI_API_KEY)throw Object.assign(Error('ยังไม่ได้ตั้งค่า OPENAI_API_KEY'),{status:503});
 const reference=path.join(root,'public','assets','hair',`${hairId}.png`);
 if(!fs.existsSync(reference))throw Object.assign(Error('ไม่พบภาพอ้างอิงทรงผม'),{status:400});
 const referenceBytes=fs.readFileSync(reference);
 const key=cacheKey(portrait.buffer,referenceBytes,hairId,provider);
 const existing=results.get(key);
 if(existing){
  if(Date.now()-existing.created<CACHE_TTL_MS){results.delete(key);results.set(key,existing);return {...existing.result,cache:'HIT'};}
  results.delete(key);
 }
 if(inFlight.has(key))return {...await inFlight.get(key),cache:'COALESCED'};
 const generate=async()=>{
 const form=new FormData();
 form.append('model','gpt-image-1.5');
 form.append('input_fidelity','high');
 form.append('quality','high');
 form.append('size','1024x1536');
 form.append('output_format','png');
 form.append('prompt',`Professional portrait hairstyle transfer. Image 1 is the original person and the sole identity and anatomical reference. Image 2 is HAIRSTYLE REFERENCE ONLY, never its face or skin. Change the original hairstyle to match image 2 including part, hairline, fringe, crown, volume and tied/loose length. Remove any former long hair that no longer belongs to the selected style; reconstruct the original plain background where needed. Keep the original person's eyes, eyebrows, nose, lips, ears, jaw, skin texture, expression, neck, head position and framing. Do not create clothing or change any insignia. Natural photographic roots, flyaways and studio lighting; no visible pasted edges, gaps, halos, or rectangular patches. Output one coherent head and short neck on a simple solid background. No torso or shoulders.`);
 form.append('image[]',new Blob([portrait.buffer],{type:portrait.mimetype||'image/png'}),'portrait.png');
 form.append('image[]',new Blob([referenceBytes],{type:'image/png'}),`${hairId}.png`);
 const response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});
 const body=await response.json();
 if(!response.ok){
  const code=body?.error?.code||'image_edit_failed';
  const error=Error(code==='moderation_blocked'?'OpenAI ปฏิเสธผลลัพธ์ภาพ (safety block) — คงภาพเดิม':`OpenAI image edit: ${code}`);
  error.status=response.status;error.requestId=response.headers?.get?.('x-request-id');throw error;
 }
 const b64=body?.data?.[0]?.b64_json;
 if(!b64)throw Object.assign(Error('OpenAI ไม่ส่งภาพกลับมา'),{status:502});
 return {png:Buffer.from(b64,'base64'),provider:'openai',requestId:response.headers?.get?.('x-request-id')||''};
 };
 const pending=generate();inFlight.set(key,pending);
 try{
  const result=await pending;
  results.set(key,{created:Date.now(),result});
  while(results.size>MAX_CACHE_ENTRIES)results.delete(results.keys().next().value);
  return {...result,cache:'MISS'};
 }finally{if(inFlight.get(key)===pending)inFlight.delete(key);}
}
