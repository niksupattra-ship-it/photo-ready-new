// Local PNG choices use the existing fitting pipeline after an original-hair portrait.
// Keep these IDs distinct from the paid Seedream hairstyle catalog.
export const FREE_FEMALE_HAIR_OPTIONS=[21,25,26].map(number=>({
 id:'hair-'+number,name:'ทรงผม '+number,gender:'female',free:true,
 src:'/assets/hairstyle-previews/hair-'+number+'.png'
}));
export const isFreeFemaleHair=id=>FREE_FEMALE_HAIR_OPTIONS.some(option=>option.id===id);
export const FREE_FEMALE_HAIR_MESSAGE='ทรงผมปรับแต่งเอง กรุณาเพิ่มรูปและใช้ตัวเลือก "ไม่เลือกผม" จึงจะใช้งานได้';


