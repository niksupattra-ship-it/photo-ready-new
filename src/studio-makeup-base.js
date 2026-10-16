// Makeup always starts from a clean, saved portrait, never the current buffer.
export function studioMakeupBase(head){
 const base=head?.makeupCleanBaseSource||head?.processedOriginalSource||head?.makeupBaseSource||head?.hairOriginalSource;
 if(base)return base;
 if(head?.makeupStyles?.look)throw Error('ไม่พบภาพก่อนแต่งหน้า กรุณาเปิดรูปหลังประมวลผลก่อนแต่งใหม่');
 if(head?.source)return head.source;
 throw Error('ไม่พบภาพหลังประมวลผลสำหรับแต่งหน้า');
}
