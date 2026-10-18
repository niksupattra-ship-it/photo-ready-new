// Skin edits use the current native layer, never an earlier processed portrait.
export function studioMakeupBase(head,currentSource=null){
 if(currentSource)return currentSource;
 if(head?.source)return head.source;
 throw Error('ไม่พบภาพปัจจุบันสำหรับปรับผิว');
}
