import {renderLocalMakeup} from './local-makeup.js';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';

const looks={
 'makeup':'local-korean-pink-eye-v1',
 'korean-rosy-v1':'local-korean-pink-eye-v1',
 'soft-rosy-v1':'local-natural-pink-v1'
};
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการแต่งเมคอัพแล้ว'),{name:'AbortError'})};

// A deterministic final colour pass on the completed native AI image. This
// stage never changes the established skin exposure, texture, alpha or geometry.
// The async-job polling path calls this too, so resumed jobs get the same finish.
export async function finishStudioPostCosmetics(blob,{style='natural',prepare,toBlob,signal,onProgress}={}){
 abort(signal);
 if(style==='natural')return blob;
 const lookId=looks[style];
 if(!lookId)throw Error('ไม่พบรูปแบบเมคอัพที่เลือก');
 if(blob?.idpromStudioSkinVersion!==STUDIO_SKIN_WORKFLOW_VERSION)throw Error('ภาพฐานแสงและผิวยังไม่พร้อมสำหรับแต่งเมคอัพ');
 const version=STUDIO_SKIN_WORKFLOW_VERSION+':'+style;
 if(blob.idpromStudioCosmeticsVersion===version)return blob;
 if(blob.idpromStudioCosmeticsVersion)throw Error('กรุณาใช้ภาพฐานก่อนแต่งหน้าเพื่อเปลี่ยนเมคอัพ');
 if(typeof prepare!=='function'||typeof toBlob!=='function')throw Error('ระบบแต่งเมคอัพยังไม่พร้อม กรุณาลองใหม่');
 const evidence=await prepare(blob);abort(signal);
 const canvas=await renderLocalMakeup({...evidence,lookId,cosmeticsOnly:true,signal,onProgress});abort(signal);
 const result=await toBlob(canvas);abort(signal);
 if(!(result instanceof Blob)||!result.size||result.type!=='image/png')throw Error('สร้างรูปเมคอัพไม่สำเร็จ เก็บงานเดิมไว้');
 for(const key of Object.getOwnPropertyNames(blob))if(key.startsWith('idprom')&&key!=='idpromStudioCosmeticsVersion')Object.defineProperty(result,key,Object.getOwnPropertyDescriptor(blob,key));
 result.idpromStudioCosmeticsVersion=version;
 return result;
}
