// Framing uses decoded display orientation, before any crop, resize-to-fit or AI.
// These ratios measure framing, not physical camera distance or neck posture.
export const PHOTO_FRAMING_LIMITS={minFaceHeight:.27,maxFaceHeight:.50,maxFaceWidth:.58,minChestRoom:.85,minTopRoom:.10};
export function checkPhotoFraming({width,height,face}){
 const point=id=>face?.[id];
 if(![width,height].every(v=>Number.isFinite(v)&&v>0)||![10,152,234,454].every(id=>Number.isFinite(point(id)?.x)&&Number.isFinite(point(id)?.y)))return {ok:false,code:'PHOTO_FACE_MISSING',message:'ไม่พบใบหน้าชัดเจน กรุณาเลือกรูปใหม่'};
 const top=point(10).y,bottom=point(152).y,faceHeight=(bottom-top)*height,faceWidth=Math.hypot((point(454).x-point(234).x)*width,(point(454).y-point(234).y)*height),ratio=faceHeight/height,L=PHOTO_FRAMING_LIMITS;
 if(faceHeight<=0||faceWidth<=0)return {ok:false,code:'PHOTO_FACE_MISSING',message:'ไม่พบใบหน้าชัดเจน กรุณาเลือกรูปใหม่'};
 if(ratio>L.maxFaceHeight||faceWidth/width>L.maxFaceWidth)return {ok:false,code:'PHOTO_TOO_CLOSE',message:'รูปใกล้เกินไป ใช้รูปที่เห็นถึงช่วงอก'};
 if(ratio<L.minFaceHeight)return {ok:false,code:'PHOTO_TOO_FAR',message:'รูปไกลเกินไป ใช้รูปช่วงอกขึ้นไปที่เห็นหน้าชัด'};
 if(top*height<faceHeight*L.minTopRoom||(1-bottom)*height<faceHeight*L.minChestRoom||Math.min(point(234).x,point(454).x)<.03||Math.max(point(234).x,point(454).x)>.97)return {ok:false,code:'PHOTO_FRAME_CROPPED',message:'ใช้รูปที่เห็นศีรษะครบและมีพื้นที่ถึงช่วงอก'};
 return {ok:true,faceHeightRatio:ratio};
}
let inspect;
const accepted=new WeakMap();
export function configurePhotoFramingInspector(callback){inspect=callback}
export async function assertPhotoFraming(file){
 let pending=accepted.get(file);
 if(!pending){
  pending=(async()=>{
   if(!inspect)throw Error('ยังตรวจระยะรูปไม่ได้ กรุณาลองอีกครั้ง');
   const result=checkPhotoFraming(await inspect(file));
   if(!result.ok)throw Object.assign(Error(result.message),{code:result.code});
   return result;
  })();
  accepted.set(file,pending);pending.catch(()=>{if(accepted.get(file)===pending)accepted.delete(file)});
 }
 return pending;
}
