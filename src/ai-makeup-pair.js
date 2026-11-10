// Deliver the AI photograph as one continuous RGB image. Never paste a face
// oval, align a second face, or restore eye islands from another photograph.
// Only the outer transparent silhouette follows the cleaned Natural cutout.
export function useAiMakeupPixels({natural,makeup,width,height}){
 const length=width*height*4;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||natural.length!==length||makeup.length!==length)throw Error('ขนาดภาพแต่งหน้าไม่ตรงกับภาพฐาน');
 const out=new Uint8ClampedArray(makeup);
 for(let i=3;i<length;i+=4)out[i]=natural[i];
 return out;
}
