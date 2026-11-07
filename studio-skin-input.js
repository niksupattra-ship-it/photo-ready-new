import sharp from 'sharp';
import {STUDIO_SKIN_WORKFLOW_VERSION,STUDIO_SKIN_RETOUCH_VERSION,STUDIO_SKIN_SOFT_VERSION,isStudioSkinWorkflowVersion,parseStudioSkinEvidence,applyStudioSkinBase} from './studio-skin-treatment.js';
import {applyStudioSkinSoftFocus} from './studio-skin-soft-focus.js';
import {applyStudioSkinRetouch} from './studio-skin-retouch.js';
import {assertStudioReferenceInputQuality} from './studio-reference-quality.js';

const styles=new Set(['natural','makeup','korean-rosy-v1','soft-rosy-v1']);
const invalid=(message,code='studio_skin_evidence_invalid')=>Object.assign(Error(message),{status:400,code});

// No field keeps historical requests on their existing route. A declared stage
// must carry valid evidence; it never silently falls back to the original input.
export function parseStudioSkinRequest(fields={},gender=fields.portraitMode){
 const version=fields.studioSkinVersion,evidence=fields.studioSkinEvidence;
 if(version===undefined||version===null||version===''){
  if(evidence!==undefined&&evidence!==null&&evidence!=='')throw invalid('ข้อมูลปรับแสงผิวไม่มีเวอร์ชัน กรุณารีเฟรชหน้าเว็บ');
  return null;
 }
 if(!isStudioSkinWorkflowVersion(version))throw invalid('กรุณารีเฟรชหน้าเว็บเพื่อใช้ขั้นตอนปรับแสงผิวล่าสุด','unsupported_studio_skin_version');
 if(gender!=='female'||!styles.has(fields.femaleEyeStyle||'natural'))throw invalid('ตัวเลือกปรับแสงผิวไม่ถูกต้อง');
 try{const parsed=parseStudioSkinEvidence(evidence);if(parsed.version!==version)throw Error('version mismatch');return parsed}catch(error){throw invalid('ข้อมูลพื้นที่ผิวไม่ครบ กรุณาเปิดรูปเดิมแล้วลองใหม่')}
}

// The owned work input is immutable. Only this derivative, never the stored
// original, goes to the provider. Orientation is baked once without any resize.
export async function prepareStudioSkinInput(input,fields={},gender=fields.portraitMode){
 const evidence=parseStudioSkinRequest(fields,gender);
 if(!evidence)return {input,staged:false,report:null};
 const decode=sharp(input.buffer,{limitInputPixels:33554432,sequentialRead:true});
 const metadata=await decode.metadata();
 if((metadata.pages||1)!==1)throw invalid('กรุณาใช้รูปภาพนิ่งสำหรับปรับแสงผิว');
 const {data,info}=await decode.rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.channels!==4||info.width!==evidence.width||info.height!==evidence.height)throw invalid('ขนาดภาพกับพื้นที่ผิวไม่ตรงกัน กรุณาเปิดรูปเดิมแล้วลองใหม่','studio_skin_source_mismatch');
 const referenceQuality=evidence.version===STUDIO_SKIN_WORKFLOW_VERSION?assertStudioReferenceInputQuality({pixels:data,width:info.width,height:info.height,evidence}):null;
 let result=applyStudioSkinBase({pixels:data,width:info.width,height:info.height,evidence});
 if(!result?.pixels||result.pixels.length!==data.length||result.report?.reason==='insufficient_skin_evidence')throw invalid('ตรวจพื้นที่ผิวไม่ครบ กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าชัดเจน');
 // Preserve the released v1 base and v2 soft-focus paths for pending jobs.
 // V3 repair stays exact. V4 adds a conservative source-quality gate and a
 // separate visual lighting guide in the existing portrait request.
 let softened=[STUDIO_SKIN_SOFT_VERSION,STUDIO_SKIN_RETOUCH_VERSION,STUDIO_SKIN_WORKFLOW_VERSION].includes(evidence.version)?applyStudioSkinSoftFocus({pixels:result.pixels,width:info.width,height:info.height,evidence}):null;
 let retouched=[STUDIO_SKIN_RETOUCH_VERSION,STUDIO_SKIN_WORKFLOW_VERSION].includes(evidence.version)?applyStudioSkinRetouch({pixels:softened.pixels,width:info.width,height:info.height,evidence}):null;
 if([STUDIO_SKIN_RETOUCH_VERSION,STUDIO_SKIN_WORKFLOW_VERSION].includes(evidence.version)&&(!retouched?.pixels||retouched.pixels.length!==data.length))throw invalid('ตรวจพื้นที่ผิวไม่ครบ กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าชัดเจน');
 const preparedPixels=retouched?.pixels||softened?.pixels||result.pixels;
 const report={...result.report,version:evidence.version,...(softened?{softFocus:softened.report}:{}),...(retouched?{retouch:retouched.report}:{}),...(referenceQuality?{referenceQuality}:{})};
 // Reports outlive encoding, but intermediate full-resolution copies need not.
 // Keep only the final v3 surface while Sharp encodes the PNG asynchronously.
 if(retouched){result=null;softened=null;retouched=null}
 const buffer=await sharp(preparedPixels,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
 return {input:{...input,buffer,mimetype:'image/png',originalname:'prepared-studio-skin.png'},staged:true,version:evidence.version,report};
}
