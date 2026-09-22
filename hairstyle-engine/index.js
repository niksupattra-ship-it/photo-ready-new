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
export function validateHairId(id){return /^(?:hair-(?:0[1-9]|1[0-9]|2[0-9])|manhair-(?:0[1-9]|1[0-2]))$/.test(id||'');}
// Short-lived, bounded memory cache. Stores generated output only, never source portraits.
// Cache key includes portrait bytes, selected reference bytes and exact generation settings.
const MAX_CACHE_ENTRIES=8, CACHE_TTL_MS=15*60*1000;
const results=new Map(),inFlight=new Map();
export function clearHairstyleCache(){results.clear();inFlight.clear();}
export function hairstyleCacheStats(){return {completed:results.size,inFlight:inFlight.size};}
function cacheKey(portrait,reference,hairId,provider){
 return crypto.createHash('sha256').update('v196|gpt-image-1.5|high|high|1024x1536|png|moderation-hardened-head-neck|')
 .update(provider).update(hairId).update(portrait).update(reference).digest('hex');
}
export async function editHairstyle({portrait,hairId,root=process.cwd(),env=process.env,fetcher=fetch}){
 if(!portrait?.buffer?.length)throw Object.assign(Error('กรุณาส่งภาพฐาน'),{status:400});
 if(!validateHairId(hairId))throw Object.assign(Error('หมายเลขทรงผมไม่ถูกต้อง'),{status:400});
 const provider=env.HAIRSTYLE_PROVIDER||'openai';
 if(!PROVIDERS.includes(provider))throw Object.assign(Error('HAIRSTYLE_PROVIDER ไม่ถูกต้อง'),{status:503});
 if(provider!=='openai')throw Object.assign(Error(`${provider}: ยังไม่ได้รับ API contract ที่ยืนยันแล้ว จึงไม่เรียกบริการอื่นแทน`),{status:503});
 if(!env.OPENAI_API_KEY)throw Object.assign(Error('ยังไม่ได้ตั้งค่า OPENAI_API_KEY'),{status:503});
 const reference=path.join(root,'public','assets',hairId.startsWith('manhair-')?'hair':'hairstyle-previews',`${hairId}.png`);
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
 const styleInstruction=hairId.startsWith('manhair-')
  ? 'Image 2 is the selected MENS HAIRSTYLE reference. Match its specific short-hair silhouette, fade/taper, part, fringe, sideburns and crown. Do not add a bun, ponytail, long hair or a generic hairstyle unless clearly present in Image 2.'
  : hairId==='hair-04'
  ? 'STYLE 04 IS A LONG, HALF-UP HAIRSTYLE: middle part, subtly braided/pinned sections at both temples, and TWO long straight sections hanging down on the left and right past the ears to the shoulders. DO NOT turn it into a swept-back updo, bun, cropped bob or tucked-away hair. The long dark side lengths are mandatory and must be visibly present in the final image.'
  : 'Read the precise hairstyle from Image 2, including whether the lengths hang below the ears and shoulders. If Image 2 has loose hair down the sides, it MUST remain visibly down the sides; never turn loose hair into an updo.';
 form.append('prompt',`STRICT HAIRSTYLE REFERENCE TRANSFER for an ID portrait. Image 1 is the ORIGINAL SUBJECT. Image 2 is ${hairId.startsWith('manhair-')?'the FACELESS transparent hairstyle-only PNG corresponding to the male portrait thumbnail selected in the app':'the EXACT FULL-COLOR THUMBNAIL the user selected in the app, with a model wearing the desired hairstyle'}. The subject in Image 1 MUST remain the same person; do not transfer any reference-model face or clothing. ${styleInstruction} Match Image 2's parting, braid or twist details, fringe, top silhouette, crown height, hair texture, left/right side lengths, and where the hair falls behind the ears and shoulders. The user chose this exact thumbnail, not a generic similar hairstyle. DO NOT default to a smooth tied-back hairstyle or preserve Image 1's old hair when it conflicts with Image 2. No topknot or bun unless visibly present in Image 2. MANDATORY NECK-SKIN CLEARANCE: no strand, braid, ponytail, hair panel or loose end may overlap visible front or side neck skin. Route long hair outside the neck silhouette and behind the shoulders/clothing-template area. Hair ends must taper into individual natural strands, never a straight horizontal or vertical cut line. Preserve Image 1's exact face, skin, pores, eyes, nose, mouth, ears, expression, head placement, neck and existing restrained acne/dark-spot retouch. Keep one continuous bare neck and upper-clavicle skin area extending just below the clavicle line, with the same skin colour and lighting as the face. Do not add any shirt, jacket, black garment, shoulders, rectangular patch or duplicated anatomy. Do not smooth, whiten, recolor or reshape skin. Remove replaced hair and reconstruct natural background where necessary. Preserve head-neck-clavicle framing; no clothing, insignia or reference-model face. Output a natural coherent photographic portrait with no seams or halos.`);
 // V196: request a conventional adult headshot only. Canvas handles the deep
 // neck extension later, reducing false-positive output moderation blocks.
 form.set('prompt',`Edit a conventional professional ID headshot of the same adult person. Image 1 is the subject and Image 2 is the selected hairstyle reference only. Preserve Image 1's exact identity, face, expression, age, complexion, pores, ears, neck, framing and head placement. ${styleInstruction} Change only the hair to match Image 2's parting, fringe, crown, silhouette, texture and length. Keep all hair outside the visible neck outline, with natural tapered ends. Never transfer the reference face, clothing, skin tone or lighting. Do not beautify, reshape, whiten, smooth or add makeup. Show only the complete head, hair, ears and normal visible neck on a simple neutral studio background. Do not add clothing, shoulders, torso, insignia, jewelry or extra objects. Return one natural photographic professional headshot.`);
 form.append('image[]',new Blob([portrait.buffer],{type:portrait.mimetype||'image/png'}),'portrait.png');
 form.append('image[]',new Blob([referenceBytes],{type:'image/png'}),`${hairId}.png`);
 const response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});
 const body=await response.json();
 if(!response.ok){
  const code=body?.error?.code||'image_edit_failed';
  const safety=code==='moderation_blocked'||code==='safety_violations';
  const error=Error(safety?'ระบบคงภาพและทรงผมเดิมไว้อัตโนมัติ เนื่องจากตัวกรองผลลัพธ์ไม่อนุญาตภาพใหม่':`OpenAI image edit: ${code}`);
  if(safety)error.code='SAFETY_FALLBACK';
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
