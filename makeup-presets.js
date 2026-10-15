// Local cosmetic looks shared by the Studio picker and on-device renderer.
export const MAKEUP_LOOKS=[
 {id:'local-natural-pink-v1',name:'ชมพูธรรมชาติ',gender:'female',description:'ผิวสว่างเนียนนุ่ม คงรายละเอียดใบหน้า ปากชมพูโปร่งบางเงาซาติน ขนตาบางธรรมชาติ และเปลือกตาชมพูระเรื่อ'},
 {id:'local-pink-glow-v1',name:'ชมพูโกลว์ใส',gender:'female',description:'ผิวฉ่ำใสสุขภาพดี แก้มชมพู ปากเงาบาง ขนตาธรรมชาติ ลดสิวและริ้วรอย'}
];
export function makeupLook(id){return MAKEUP_LOOKS.find(look=>look.id===id)||null}
