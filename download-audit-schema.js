// Bounded observational metadata only. Client reports never grant rights.
export const DOWNLOAD_AUDIT_CLIENT_EVENTS=Object.freeze([
 'download_clicked','file_prepared','save_panel_opened','download_requested','save_clicked',
 'share_clicked','share_handoff','share_cancelled','download_failed','panel_closed','crop_cancelled','rights_blocked'
]);
export const DOWNLOAD_AUDIT_MODES=Object.freeze(['easy','studio','classic']);
export const DOWNLOAD_AUDIT_INITIATORS=Object.freeze(['user','automatic_after_unlock']);
export const DOWNLOAD_AUDIT_METHODS=Object.freeze(['desktop_anchor','mobile_panel','save_link','web_share','unknown']);
export const DOWNLOAD_AUDIT_BROWSER_FAMILIES=Object.freeze(['chrome','safari','firefox','edge','in_app','other']);
export const DOWNLOAD_AUDIT_DEVICE_CLASSES=Object.freeze(['mobile','tablet','desktop']);
export const DOWNLOAD_AUDIT_ERROR_STAGES=Object.freeze(['rights','render','crop','delivery','save','share','account','source','suit','unknown']);
export const DOWNLOAD_AUDIT_ERROR_CODES=Object.freeze(['unknown','rights_required','rights_unavailable','account_changed','output_changed','render_failed','crop_failed','blob_failed','delivery_failed','share_failed','share_cancelled','network_error','request_aborted','timeout','export_failed','source_unprocessed','suit_unavailable']);
export const DOWNLOAD_AUDIT_MAX_EVENTS=20;
export const DOWNLOAD_AUDIT_MAX_JOBS=20;
const id=/^[A-Za-z0-9][A-Za-z0-9_-]{11,119}$/;
const reference=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const label=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const invalid=()=>Object.assign(Error('invalid_download_event'),{code:'invalid_download_event',status:400});
const optionalText=(value,pattern)=>value==null||value===''?null:typeof value==='string'&&pattern.test(value)?value:(()=>{throw invalid()})();
const oneOf=(value,values,fallback=null)=>value==null||value===''?fallback:values.includes(value)?value:(()=>{throw invalid()})();
export function normalizeDownloadAuditBatch(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
 let length;try{length=JSON.stringify(value).length}catch{throw invalid()}if(length>24000)throw invalid();
 const attemptId=value.attemptId;if(typeof attemptId!=='string'||!id.test(attemptId)||attemptId.startsWith('server_'))throw invalid();
 if(!Array.isArray(value.jobIds)||value.jobIds.length<1||value.jobIds.length>DOWNLOAD_AUDIT_MAX_JOBS||value.jobIds.some(v=>typeof v!=='string'||!reference.test(v)))throw invalid();
 const jobIds=[...new Set(value.jobIds)].sort();
 const mode=oneOf(value.mode,DOWNLOAD_AUDIT_MODES),initiator=oneOf(value.initiator,DOWNLOAD_AUDIT_INITIATORS);
 if(!mode||!initiator)throw invalid();
 if(!Array.isArray(value.events)||value.events.length<1||value.events.length>DOWNLOAD_AUDIT_MAX_EVENTS)throw invalid();
 const seen=new Map(),events=[];
 for(const input of value.events){
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.eventId!=='string'||!id.test(input.eventId)||input.eventId.startsWith('server_')||!DOWNLOAD_AUDIT_CLIENT_EVENTS.includes(input.type))throw invalid();
  let clientAt=null;if(input.clientAt!=null){const time=typeof input.clientAt==='number'?input.clientAt:typeof input.clientAt==='string'?Date.parse(input.clientAt):NaN;if(!Number.isFinite(time)||time<Date.UTC(2020,0,1)||time>Date.UTC(2100,0,1))throw invalid();clientAt=new Date(time).toISOString()}
  const byteSize=input.byteSize==null?null:input.byteSize;if(byteSize!==null&&(!Number.isSafeInteger(byteSize)||byteSize<0||byteSize>128*1024*1024))throw invalid();
  const event={eventId:input.eventId,type:input.type,clientAt,sizeId:optionalText(input.sizeId,label),fileType:oneOf(input.fileType,['image/png','image/jpeg','image/webp']),byteSize,method:oneOf(input.method,DOWNLOAD_AUDIT_METHODS),errorStage:oneOf(input.errorStage,DOWNLOAD_AUDIT_ERROR_STAGES),errorCode:oneOf(input.errorCode,DOWNLOAD_AUDIT_ERROR_CODES)};
  const encoded=JSON.stringify(event);if(seen.has(event.eventId)){if(seen.get(event.eventId)!==encoded)throw invalid();continue}seen.set(event.eventId,encoded);events.push(event);
 }
 const expectedWalletId=optionalText(value.expectedWalletId,reference);if(!expectedWalletId)throw invalid();
 return {attemptId,jobIds,mode,initiator,savedWorkId:optionalText(value.savedWorkId,reference)||'',expectedWalletId,browserFamily:oneOf(value.browserFamily,DOWNLOAD_AUDIT_BROWSER_FAMILIES,'other'),deviceClass:oneOf(value.deviceClass,DOWNLOAD_AUDIT_DEVICE_CLASSES,'desktop'),events};
}
