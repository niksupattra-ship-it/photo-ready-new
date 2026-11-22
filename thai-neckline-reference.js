import sharp from 'sharp';
import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
import {THAI_COLLARLESS_VERSION} from './thai-collarless-version.js';
export const usesCleanThaiNecklineReference=fields=>isThaiOutfitAi(fields)&&fields.thaiCollarlessVersion===THAI_COLLARLESS_VERSION&&fields.portraitMode==='female'&&/^\/assets\/government-uniforms\/female-(operational|academic|senior|government-employee)\.png$/.test(fields.neckOutfitReferencePath||'');
// Real garment pixels stay intact. Remove only the contaminated alpha fringe
// bordering its transparent neck hole; this never processes a customer result.
export function cleanNeckCutoutAlpha(data,width,height,{reuseBuffer=false}={}){
 if(width!==2048||height!==1731||data.length!==width*height*4)throw Error('unexpected_uniform_reference_dimensions');
 const result=reuseBuffer?data:Buffer.from(data);let changed=0;
 for(let y=120;y<480;y++){
  const center=(y*width+1024)*4;if(data[center+3]>=200)continue;
  let left=1024,right=1024;
  while(left>700&&data[(y*width+left)*4+3]<200)left--;
  while(right<1348&&data[(y*width+right)*4+3]<200)right++;
  if(left<=720||right>=1328||left>=right)continue;
  const li=(y*width+left)*4,ri=(y*width+right)*4;
  if(Math.min(...data.subarray(li,li+3),...data.subarray(ri,ri+3))<160)continue;
  const ramp=Math.min(1,(y-120)/24,(480-y)/24,(right-left)/160),trim=14*Math.max(0,ramp),feather=3;
  for(let x=Math.max(720,left-20);x<=Math.min(1328,right+20);x++){
   const i=(y*width+x)*4;if(!data[i+3])continue;
   const coverage=x<=1024?(left-trim-x)/feather:(x-right-trim)/feather;
   const a=Math.min(data[i+3],Math.round(255*Math.max(0,Math.min(1,coverage))));
   if(a!==data[i+3]){result[i+3]=a;changed++}
  }
 }
 return {data:result,changed};
}
export async function prepareThaiNecklineReference(buffer,fields){
 if(!usesCleanThaiNecklineReference(fields))return buffer;
 const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width!==2048||info.height!==1731)return buffer;
 const clean=cleanNeckCutoutAlpha(data,info.width,info.height,{reuseBuffer:true});
 if(!clean.changed)return buffer;
 return sharp(clean.data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
export const CLEAN_NECK_REFERENCE_POLICY=`\nREAL GARMENT NECK CUTOUT — CLEAN REFERENCE V6:
The selected real garment reference and its detail/layout views have had ONLY the contaminated transparent neck-hole edge cleaned. Original cloth, collar leaves, tie, shoulder boards and insignia pixels remain the garment authority. The neck opening shows ONE boundary: generate the person's bare neck meeting that boundary directly, without recreating any peach skin fringe, bright white piping, thin second-shirt rim or parallel border. The reference's transparency is an opening for the natural neck, not an instruction to insert a collar-shaped liner. Keep the single real folded shirt collar and its two pointed leaves; complete the contact naturally in this same AI generation. No additional outfit overlay, neck/face patch or post-generation alpha editing is applied to the customer portrait.`;
