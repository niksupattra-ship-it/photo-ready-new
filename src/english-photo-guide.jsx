import React from 'react';

// Share the same layout and reference image across languages so the upload
// guidance stays visually consistent. Only the copy changes by locale.
const GUIDE_COPY={
 en:{
  title:'Photo guide',
  intro:'Use a clear, well-lit, front-facing photo.',
  imageAlt:'Example of a well-lit, front-facing portrait with the head and upper body visible',
  caption:'Face forward. Keep your full head, shoulders and upper chest in view.',
  avoid:'Avoid',
  pitfalls:[
   'Extreme close-ups that crop the head or chin',
   'Distant or full-body photos with a small face',
   'Side views or a tilted head',
   'Photos that hide the neck or shoulders',
   'Faces too close to the image edge',
   'Dark or blurry photos, strong shadows, or an obscured face'
  ],
  note:'Leave space around your head and shoulders. Check the result before paying or downloading.'
 },
 th:{
  title:'คำแนะนำการใช้รูปถ่าย',
  intro:'ใช้รูปหน้าตรงที่คมชัด มีแสงสว่างเพียงพอและสม่ำเสมอ',
  imageAlt:'ตัวอย่างภาพถ่ายหน้าตรงที่มีแสงสม่ำเสมอ เห็นศีรษะและช่วงไหล่ชัดเจน',
  caption:'หันหน้าตรง เห็นศีรษะ ไหล่ และหน้าอกส่วนบนครบถ้วน',
  avoid:'ภาพที่ควรหลีกเลี่ยง',
  pitfalls:[
   'ภาพระยะใกล้เกินไปจนศีรษะหรือคางขาด',
   'ภาพถ่ายไกลหรือเต็มตัวจนใบหน้ามีขนาดเล็ก',
   'ภาพหันข้างหรือเอียงศีรษะ',
   'ภาพที่มองไม่เห็นคอหรือไหล่ชัดเจน',
   'ใบหน้าอยู่ชิดขอบภาพเกินไป',
   'ภาพมืด เบลอ มีเงาเข้ม หรือมีสิ่งบดบังใบหน้า'
  ],
  note:'เว้นพื้นที่รอบศีรษะและไหล่ และตรวจสอบภาพก่อนชำระเงินหรือดาวน์โหลด'
 }
};
export function PhotoGuide({language='en'}){
 const lang=language==='th'?'th':'en',copy=GUIDE_COPY[lang];
 return <div className="english-photo-guide" lang={lang}>
  <h2>{copy.title}</h2>
  <p>{copy.intro}</p>
  <div className="english-photo-guide-body">
   <figure><img src="/assets/home-previews/easy-original-v20261031.webp" alt={copy.imageAlt}/><figcaption>{copy.caption}</figcaption></figure>
   <section><h3>{copy.avoid}</h3><ul>{copy.pitfalls.map(item=><li key={item}>{item}</li>)}</ul><p>{copy.note}</p></section>
  </div>
 </div>;
}
export function EnglishPhotoGuide(){return <PhotoGuide language="en"/>;}
export function ThaiPhotoGuide(){return <PhotoGuide language="th"/>;}
