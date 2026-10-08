// Shared allowlist: the client cannot submit arbitrary AI prompts.
export const MAKEUP_TABS=[['brows','คิ้ว'],['lips','ลิปสติก'],['cheeks','แก้ม'],['lashes','ขนตา'],['blush','บลัช']];
export const MAKEUP_PRESETS={
 brows:[['natural','ธรรมชาติ','soft natural dark-brown eyebrows, retain individual brow hairs'],['straight','ทรงตรง','neatly groomed soft straight brown eyebrows'],['arched','โก่งนุ่ม','refined softly arched dark-brown eyebrows']],
 lips:[['rose','ชมพูกุหลาบ','sheer rose-pink lipstick'],['nude','พีชนู้ด','warm peach-nude lipstick'],['berry','เบอร์รี','muted berry satin lipstick']],
 cheeks:[['healthy','ผิวสุขภาพดี','a subtle healthy sheen on cheek skin'],['dewy','ผิวฉ่ำ','restrained dewy cheek glow, not greasy'],['highlight','ไฮไลต์นุ่ม','soft luminous highlight on the upper cheeks']],
 lashes:[['natural','ธรรมชาติ','natural defined black upper eyelashes'],['curl','งอนนุ่ม','softly curled fine upper eyelashes'],['airy','ยาวละมุน','fine airy slightly longer upper eyelashes, not false-lash strips']],
 blush:[['rose','ชมพู','subtle soft rose-pink cheek blush'],['peach','พีช','subtle warm peach cheek blush'],['coral','คอรัล','subtle muted coral cheek blush']]
};
export function validateMakeupStyles(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('กรุณาเลือกเมคอัพ');
 const styles={};
 for(const [key,id] of Object.entries(value)){
  if(!MAKEUP_PRESETS[key]||typeof id!=='string'||!MAKEUP_PRESETS[key].some(p=>p[0]===id))throw Error('ตัวเลือกเมคอัพไม่ถูกต้อง');
  styles[key]=id;
 }
 if(!Object.keys(styles).length)throw Error('กรุณาเลือกเมคอัพอย่างน้อย 1 แบบ');
 return styles;
}
export function makeupPrompt(styles){
 styles=validateMakeupStyles(styles);
 return `Retouch the EXACT supplied portrait with ONLY these makeup effects: ${Object.entries(styles).map(([key,id])=>MAKEUP_PRESETS[key].find(p=>p[0]===id)[2]).join('; ')}. Preserve the subject's identity, facial structure, eye shape, iris and eye color, nose, mouth shape, expression, head orientation, skin tone and real pores. Keep all unselected makeup areas unchanged. Do not smooth or regenerate the entire face. Keep hair, hairline, ears, neck, shoulders, clothes, background, lighting, framing, proportions and image orientation unchanged. No new collar, no mirroring, no accessories. Makeup must be subtle, realistic and suitable for an ID portrait. Return ONE image with the same composition and aspect ratio as the input.`;
}
