import {hairRootTargetInstruction} from '../hair-root-target.js';
import {HAIRSTYLE_FIT_POLICY,HAIRSTYLE_PROPORTION_POLICY} from '../hairstyle-fit-policy.js';
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
 return crypto.createHash('sha256').update('v240|single-pass-coherent-portrait-neck-shoulder-clear|gpt-image-1.5|high|1024x1536|png|')
 .update(provider).update(hairId).update(portrait).update(reference).digest('hex');
}
export async function editHairstyle({portrait,hairId,hairRootTarget,root=process.cwd(),env=process.env,fetcher=fetch}){
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
 // V238: one image-edit generation produces the complete face AND hair together.
 // No mask, compositing, donor hair, or face cutout is used in this endpoint.
 const singlePassPrompt=`SINGLE-PASS PHOTOGRAPHIC PORTRAIT EDIT. Produce ONE complete coherent photograph of the person in Image 1 wearing the hairstyle selected in Image 2. Generate the hair, hairline, forehead transition, ears and face together in ONE unified image; never create or overlay a separate hairpiece, wig, face mask, pasted face, donor layer or cutout. Image 1 is the exclusive identity and facial-anatomy authority. Image 2 is ONLY the hairstyle-design reference; ignore the identity, face, complexion, skull size, clothes and lighting of any person in Image 2.

CRITICAL NATURAL HEAD ANATOMY: Measure proportions VISUALLY from the actual person in Image 1. Follow their existing forehead height, head width, temple position, ear height, chin-to-eyebrow distance and natural cranial curvature. Hair must grow close to this skull. Do NOT copy the reference's overall head size or volume. Avoid tall crowns, domed/puffy tops, swollen side masses, helmet hair, bouffants, lifted roots, oversized buns or unnaturally thick solid black hair. Crown should be low and naturally contoured unless the selected reference explicitly requires height; even then adapt it conservatively to this person's head. Keep side volume restrained, tapered and asymmetric in a believable way. Hair roots must emerge organically at the actual forehead and temples with natural irregular strands and believable density. No straight pasted-on hairline, hard seam, halo or sharp sticker edge. Respect ear occlusion and visible skin where the selected style requires it.

REFERENCE STYLE FIDELITY: ${styleInstruction} Preserve the selected parting, fringe, braid, gathering, length, texture and recognizable styling details. Match the STYLE, not the reference model's head dimensions. Long loose lengths must remain long and loose; tied styles must remain tied; short styles must remain short. Remove the original hair where it conflicts with the selected style, reconstructing background naturally.

IDENTITY: Keep exactly the same person from Image 1: original eyes, brows, nose, mouth, facial proportions, jaw, chin, expression, skin tone, pores and distinguishing details. Do not beautify, smooth skin, add makeup, change age, reshape features, widen eyes, or change face scale. Do not borrow the reference model's face. Preserve head orientation, camera perspective and framing. Keep the visible natural neck, with no added clothing or shoulders beyond the source crop.

PHOTO REALISM: Natural individual hair strands, subtle realistic highlights, restrained thickness, physically plausible shadows at the roots and temples, original photographic grain and lighting. No plastic shine, flat dark helmet, artificial edges or exaggerated studio retouching.

FINAL NECK AND SHOULDER CLEARANCE — OVERRIDES EVERY EARLIER STYLE-LENGTH INSTRUCTION: Keep the complete visible neck and both shoulders free of hair. No strand, braid, ponytail, loose section, flyaway, shadowed hair mass or hair tip may lie over, touch or cross the neck, clavicles, collar opening, shoulder skin or shoulder/clothing silhouette. For long hairstyles, route the long lengths entirely behind the neck and shoulders, behind the body silhouette and out of view from the front. End any visible front side sections above the neck, at or above jaw/ear level. Preserve the chosen part, crown and long-hair character without allowing hair to cover the neck or shoulders. Keep continuous visible neck skin from jaw to outfit collar and clean shoulder contours on both sides. This rule applies to every style, including hair-04, and overrides any reference or earlier instruction to let hair reach or fall across the shoulders. Output ONE finished portrait in a single generation with no additional compositing.`;
 form.append('prompt',singlePassPrompt);
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
