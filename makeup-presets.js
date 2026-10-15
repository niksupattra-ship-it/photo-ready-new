// Reference looks only. The retired prompt-based cosmetic presets are no longer offered.
export const MAKEUP_LOOKS=[
 {id:'youcam-rose-glow',name:'โรสโกลว์ละมุน',description:'ชมพูกุหลาบ ปากฉ่ำละมุน',reference:'rose-glow.jpg'},
 {id:'youcam-pink-glitter',name:'พิงก์กลิตเตอร์',description:'ตาประกาย อายไลเนอร์คม ปากชมพู',reference:'pink-glitter.jpg'},
 {id:'youcam-soft-pink-matte',name:'ซอฟต์พิงก์แมตต์',description:'ชมพูบางเบา ปากฟุ้งแมตต์',reference:'soft-pink-matte.jpg'},
 {id:'youcam-peach-rose',name:'พีชโรสฉ่ำ',description:'พีชกุหลาบ ผิวฉ่ำสุขภาพดี',reference:'peach-rose.jpg'}
].map(look=>({...look,gender:'female',preview:'/assets/makeup/looks/'+look.id+'.webp'}));
export function makeupLook(id){return MAKEUP_LOOKS.find(look=>look.id===id)||null}
