// Female makeup references shared by the Studio picker and YouCam transfer API.
export const MAKEUP_LOOKS=[
 {id:'youcam-female-natural-01-soft-glow-v2',name:'ธรรมชาติสุภาพ',description:'ผิวเนียนสว่าง ชมพูธรรมชาติ ประกายบางเบา ขนตางอนและไลเนอร์เส้นบาง',reference:'female-natural-01-soft-glow-v2.jpg'},
 {id:'youcam-female-soft-pink-02-soft-glow-v2',name:'ชมพูอ่อน',description:'ผิวเนียนฟุ้ง แก้มปากชมพูละมุน ตาประกายมุก ขนตางอนและไลเนอร์',reference:'female-soft-pink-02-soft-glow-v2.jpg'},
 {id:'youcam-female-peach-03-soft-glow-v2',name:'พีช',description:'ผิวสว่างฉ่ำ แก้มพีชอมชมพู ปากพีชกุหลาบ ขนตาและไลเนอร์ละมุน',reference:'female-peach-03-soft-glow-v2.jpg'},
 {id:'youcam-female-nude-brown-04-soft-glow-v2',name:'น้ำตาลนู้ด',description:'ผิวเนียนผ่อง ปากนู้ดน้ำตาลอมชมพู ตาประกายแชมเปญ ขนตาและไลเนอร์',reference:'female-nude-brown-04-soft-glow-v2.jpg'},
 {id:'youcam-female-muted-rose-05-soft-glow-v2',name:'กุหลาบหม่น',description:'ผิวเนียนสว่าง แก้มปากกุหลาบหม่น ประกายละมุน ขนตางอนและไลเนอร์',reference:'female-muted-rose-05-soft-glow-v2.jpg'}
].map(look=>({...look,gender:'female',preview:'/assets/makeup/looks/'+look.id+'.webp'}));
export function makeupLook(id){return MAKEUP_LOOKS.find(look=>look.id===id)||null}
