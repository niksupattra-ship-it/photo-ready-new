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
function cacheKey(portrait,mask,reference,hairId,provider){
 return crypto.createHash('sha256').update('v214|gpt-image-1.5|high|high|1024x1536|png|ai-hair-only-face-pixel-lock|')
 .update(provider).update(hairId).update(portrait).update(mask).update(reference).digest('hex');
}
export async function editHairstyle({portrait,mask,hairId,root=process.cwd(),env=process.env,fetcher=fetch}){
 if(!portrait?.buffer?.length)throw Object.assign(Error('กรุณาส่งภาพฐาน'),{status:400});
 if(!mask?.buffer?.length)throw Object.assign(Error('กรุณาส่ง mask ล็อกใบหน้า'),{status:400});
 if(!validateHairId(hairId))throw Object.assign(Error('หมายเลขทรงผมไม่ถูกต้อง'),{status:400});
 const provider=env.HAIRSTYLE_PROVIDER||'openai';
 if(!PROVIDERS.includes(provider))throw Object.assign(Error('HAIRSTYLE_PROVIDER ไม่ถูกต้อง'),{status:503});
 if(provider!=='openai')throw Object.assign(Error(`${provider}: ยังไม่ได้รับ API contract ที่ยืนยันแล้ว จึงไม่เรียกบริการอื่นแทน`),{status:503});
 if(!env.OPENAI_API_KEY)throw Object.assign(Error('ยังไม่ได้ตั้งค่า OPENAI_API_KEY'),{status:503});
 const reference=path.join(root,'public','assets','hair',`${hairId}.png`);
 if(!fs.existsSync(reference))throw Object.assign(Error('ไม่พบภาพอ้างอิงทรงผม'),{status:400});
 const referenceBytes=fs.readFileSync(reference);
 const key=cacheKey(portrait.buffer,mask.buffer,referenceBytes,hairId,provider);
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
 form.append('prompt',`EDIT ONLY THE HAIRSTYLE IN IMAGE 1. Image 2 is the exact FACELESS TRANSPARENT HAIRSTYLE CUTOUT selected by the user, not a general inspiration image. ${styleInstruction} This is a REAL AI HAIRSTYLE REPLACEMENT, not a pasted transparent PNG or a generic restyling. Reconstruct the selected hairstyle as realistic strands attached to the SAME person's original scalp. Reproduce Image 2's identifying geometry as closely as possible: exact part location, fringe or braid pattern, crown height, side volume, outline, length, direction and tapered ends. Adapt ONLY HAIR width, crown height and side volume to Image 1's unchanged skull and face: maintain a believable head-to-hair ratio without enlarging the face, moving eyes or narrowing the jaw. Never copy the reference's face or skin. Keep the original photographed skin pixels and pore texture exactly unchanged; do not apply beauty filters, blush, lip tint, exposure changes or skin regeneration during hairstyle replacement. Create a photographic hairline with individual roots and fine strands that blend naturally into the existing forehead boundary; use HAIR PIXELS ONLY for this transition. Do not paint, patch, recolour or regenerate any forehead or face skin. The transparent pixels of the supplied mask are the only editable area; every opaque pixel must remain unchanged. Preserve the exact face, eyes, gaze, eyebrows, nose, mouth, jaw, ears, complexion, neck, shoulders, clothing and placement from Image 1. Never insert a face layer, skin rectangle, overlay band or hard geometric edge. Keep long hair outside the visible neck silhouette. This is a modest professional ID portrait. Return the same canvas size, framing and background with realistic roots, strand separation, subtle flyaways and no seams, halos or rectangular patches. Preserve a continuous, strand-by-strand photographic transition across the hairline; do not expose blue background holes above the forehead, temples or ears, and do not create straight side cut lines. Fill every former-hair area either with the selected new hairstyle or with naturally reconstructed background only OUTSIDE the original face/skin. Keep the hairline naturally attached to the ORIGINAL forehead skin, with no transparent wedge or bright halo.`);
 form.set('moderation','low');
 form.append('image[]',new Blob([portrait.buffer],{type:portrait.mimetype||'image/png'}),'portrait.png');
 form.append('mask',new Blob([mask.buffer],{type:'image/png'}),'hair-edit-mask.png');
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
