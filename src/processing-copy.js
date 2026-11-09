export const PROCESS_FAILURE_HINT='เปลี่ยนรูปใหม่หรือเลือกทรงผม';
export const PROCESS_FAILURE_MESSAGE='ประมวลไม่สำเร็จ '+PROCESS_FAILURE_HINT;
export const TOOL_HELP={
 move:'ปรับตำแหน่งส่วนที่เลือก',
 transform:'ปรับขนาดและหมุนส่วนที่เลือก',
 neck:'ปรับความกว้างและความสูงคอเสื้อ',
 warp:'ปรับรูปทรงเฉพาะบริเวณ',
 erase:'ลบส่วนที่ไม่ต้องการ',
 paint:'ระบายสีบนส่วนที่เลือก',
 restore:'คืนส่วนที่ถูกลบ',
 pan:'ปรับมุมมองภาพ'
};
export const WARP_HELP=TOOL_HELP.warp;

export const PHOTO_EDITING_TITLE='กำลังตัดต่อรูป';
export const PHOTO_EDITING_WAIT='กรุณารอสักครู่';
// Display phases follow the existing estimated progress; 100% means ready.
export const photoEditingStage=value=>Number(value)>=100?'ภาพพร้อมแล้ว':Number(value)>=86?'กำลังเก็บรายละเอียด':Number(value)>=31?'กำลังตัดต่อรูป':'กำลังเตรียมรูป';
