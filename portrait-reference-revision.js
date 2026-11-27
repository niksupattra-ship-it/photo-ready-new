import {PORTRAIT_REFERENCE_HASHES} from './portrait-reference-assets.js';
// A selected ID is not a file version. Scope caches/provenance to both actual reference files.
export function portraitReferenceRevision(hairId,template){
 return (PORTRAIT_REFERENCE_HASHES.hair[hairId]||'original')+'.'+(PORTRAIT_REFERENCE_HASHES.outfit[template]||'unknown');
}
export function requireCurrentPortraitReferences(fields={}){
 if(fields.portraitReferenceRevision!==undefined&&fields.portraitReferenceRevision!==portraitReferenceRevision(fields.hairId||'original',fields.neckOutfitReferencePath))throw Object.assign(Error('ไฟล์ทรงผมหรือชุดมีการอัปเดต กรุณาโหลดเว็บใหม่แล้วเลือกอีกครั้ง ยังไม่ได้ส่งสร้างภาพ'),{status:409,code:'PORTRAIT_REFERENCE_UPDATED'});
}
