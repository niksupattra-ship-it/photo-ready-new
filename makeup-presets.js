// Female makeup references shared by the Studio picker and YouCam transfer API.
export const MAKEUP_LOOKS=[
 {id:'youcam-female-natural-01',name:'ธรรมชาติสุภาพ',description:'ตาน้ำตาลบางเบา แก้มระเรื่อ ปากนู้ดกุหลาบสุภาพ',reference:'female-natural-01.jpg'},
 {id:'youcam-female-soft-pink-02',name:'ชมพูอ่อน',description:'แก้มชมพูอ่อน ปากชมพูละมุน ดวงตานุ่มนวล',reference:'female-soft-pink-02.jpg'},
 {id:'youcam-female-peach-03',name:'พีช',description:'แก้มพีชอบอุ่น ปากพีชกุหลาบ แต่งตาโทนอ่อน',reference:'female-peach-03.jpg'},
 {id:'youcam-female-nude-brown-04',name:'น้ำตาลนู้ด',description:'ตาน้ำตาลเทา แก้มเบจอมกุหลาบ ปากน้ำตาลนู้ด',reference:'female-nude-brown-04.jpg'},
 {id:'youcam-female-muted-rose-05',name:'กุหลาบหม่น',description:'แก้มกุหลาบหม่น ปากดัสตี้โรส ตากุหลาบน้ำตาล',reference:'female-muted-rose-05.jpg'}
].map(look=>({...look,gender:'female',preview:'/assets/makeup/looks/'+look.id+'.webp'}));
export function makeupLook(id){return MAKEUP_LOOKS.find(look=>look.id===id)||null}
