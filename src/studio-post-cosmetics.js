import {renderLocalMakeup} from './local-makeup.js';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {PORTRAIT_MAKEUP_VERSION,sharedOriginalPortraitSource} from '../shared-portrait-policy.js';

const looks={
 'makeup':'local-korean-pink-eye-v1',
 'korean-rosy-v1':'local-korean-pink-eye-v1',
 'soft-rosy-v1':'local-natural-pink-v1'
};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการแต่งเมคอัพแล้ว'),{name:'AbortError'})};

// A deterministic final colour pass on the completed native AI image. This
// stage keeps native geometry/alpha; current Makeup adds brow powder, rose
// pigment and softly polished satin skin while shielding the original eyes.
// The shared-base completion and Studio finish switch use this same colour pass.
export async function finishStudioPostCosmetics(blob,{style='natural',prepare,toBlob,signal,onProgress}={}){
 abort(signal);
 if(style==='natural')return blob;
 const original=blob?.idpromStudioSkinVersion===ORIGINAL_PORTRAIT_AI_VERSION||blob?.idpromStudioSkinVersion==='studio-original-ai-v5';
 const lookId=original&&looks[style]?(style==='soft-rosy-v1'?'shared-peach-nude-gloss-v9':'shared-pink-nude-gloss-v9'):looks[style];
 if(!lookId)throw Error('ไม่พบรูปแบบเมคอัพที่เลือก');
 if(blob?.idpromStudioSkinVersion!==STUDIO_SKIN_WORKFLOW_VERSION&&!(original&&sharedOriginalPortraitSource(blob)))throw Error('ภาพฐานแสงและผิวยังไม่พร้อมสำหรับแต่งเมคอัพ');
 const version=blob.idpromStudioSkinVersion+':'+style;
 if(blob.idpromStudioCosmeticsVersion===version&&(!original||blob.idpromStudioMakeupVersion===PORTRAIT_MAKEUP_VERSION))return blob;
 if(blob.idpromStudioCosmeticsVersion)throw Error('กรุณาใช้ภาพฐานก่อนแต่งหน้าเพื่อเปลี่ยนเมคอัพ');
 if(typeof prepare!=='function'||typeof toBlob!=='function')throw Error('ระบบแต่งเมคอัพยังไม่พร้อม กรุณาลองใหม่');
 const evidence=await prepare(blob);abort(signal);
 const canvas=await renderLocalMakeup({...evidence,lookId,cosmeticsOnly:true,signal,onProgress});abort(signal);
 const result=await toBlob(canvas);abort(signal);
 if(!(result instanceof Blob)||!result.size||result.type!=='image/png')throw Error('สร้างรูปเมคอัพไม่สำเร็จ เก็บงานเดิมไว้');
 for(const key of Object.getOwnPropertyNames(blob))if(key.startsWith('idprom')&&!['idpromStudioCosmeticsVersion','idpromStudioMakeupVersion'].includes(key))Object.defineProperty(result,key,Object.getOwnPropertyDescriptor(blob,key));
 result.idpromStudioCosmeticsVersion=version;
 if(original)result.idpromStudioMakeupVersion=PORTRAIT_MAKEUP_VERSION;
 return result;
}
