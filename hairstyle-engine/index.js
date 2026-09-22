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
 return crypto.createHash('sha256').update('v203|gpt-image-1.5|high|high|1024x1536|png|full-neck-covered-collar-margin|')
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
 form.append('prompt',`STRICT HAIRSTYLE REFERENCE TRANSFER for an ID portrait. Image 1 is the ORIGINAL SUBJECT. Image 2 is ${hairId.startsWith('manhair-')?'the FACELESS transparent hairstyle-only PNG corresponding to the male portrait thumbnail selected in the app':'the EXACT FULL-COLOR THUMBNAIL the user selected in the app, with a model wearing the desired hairstyle'}. The subject in Image 1 MUST remain the same person; do not transfer any reference-model face or clothing. ${styleInstruction} Match Image 2's parting, braid or twist details, fringe, top silhouette, crown height, hair texture, left/right side lengths, and where the hair falls behind the ears and shoulders. DO NOT default to another hairstyle. MANDATORY NECK-SKIN CLEARANCE: no hair may overlap visible neck skin; route long hair outside the neck and behind the shoulder area with naturally tapered ends. Preserve Image 1's exact face, skin, pores, eyes, nose, mouth, ears, expression and head placement. Generate one coherent neck in proportion to Image 1: visible chin-to-clavicle length normally around 28–40% of face height and narrow middle-neck width around 65–80% of jaw width, adapted to the person. The neck must taper gently below the jaw, then widen smoothly into BOTH COMPLETE CLAVICLES, full skin-only upper shoulders from left to right, and enough continuous upper-chest skin to fill a deep open uniform collar. There must be NO empty background hole between neck, collarbones, shoulders or upper chest. Keep the same complexion, pores, white balance, shadows and left/right lighting as the face. No pencil-thin neck, abrupt flare, blotches, repeated texture, seam, doubled anatomy or rectangular patch. Do not add any shirt, jacket, uniform, insignia or fabric; generate real shoulder and upper-chest anatomy but no lower torso. Do not smooth, whiten, recolor or reshape the face. Output one natural coherent photographic head-neck-shoulder-upper-chest portrait with no seams or halos.`);
 form.set('prompt',`EDIT A MODEST PROFESSIONAL ID PORTRAIT. Image 1 is the original adult subject and the sole authority for identity. Image 2 is a hairstyle reference only. Change only the hair to match the selected parting, fringe, silhouette, crown and length, while keeping hair clear of the visible neck. Preserve Image 1's exact face outline, forehead, cheeks, jaw, chin, natural asymmetry, eye shape and spacing, eyelids, eyebrows, nose, lips, ears, expression, age, complexion, marks and natural pore detail. Do not beautify, reshape, symmetrize, add makeup, whiten or smooth the face. Keep the result fully appropriate for an official application photo. Maintain a natural continuous neck to the normal professional collar line and a neutral modest shoulder presentation for placement behind the application's fixed uniform template. Do not generate badges, insignia or official uniform details. If the original face is dark, apply only a restrained neutral exposure correction while preserving skin texture. Return one coherent front-facing photographic subject with no seams, duplicate anatomy, rectangular patches or background holes.`);
 form.set('prompt',`${form.get('prompt')} Keep an unbroken lower-neck fill region on both sides, widening naturally to approximately the midpoint between the neck and each shoulder joint and continuing below the future collar edge. Match the face complexion and lighting with no transparent gaps or background-coloured cut-outs.`);
 form.set('moderation','low');
 form.append('image[]',new Blob([portrait.buffer],{type:portrait.mimetype||'image/png'}),'portrait.png');
 form.append('image[]',new Blob([referenceBytes],{type:'image/png'}),`${hairId}.png`);
 const response=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});
 const body=await response.json();
 if(!response.ok){
  const code=body?.error?.code||'image_edit_failed';
  const safetyBlocked=code==='moderation_blocked'||code==='safety_violations';
  const error=Error(safetyBlocked?'ภาพนี้ไม่ผ่านการตรวจสอบความปลอดภัย กรุณาเปลี่ยนภาพใหม่แล้วประมวลผลอีกครั้ง':`OpenAI image edit: ${code}`);
  if(safetyBlocked){
   error.code='IMAGE_SAFETY_BLOCK';
   error.moderationStage=body?.error?.moderation_details?.moderation_stage||'unknown';
  }
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
