import {faceProportions,compareFaceProportions} from './face-proportion-check.js';
import {portraitProtectedFeatures,comparePortraitProtectedFeatures} from './portrait-feature-check.js';
import {LOCAL_MAKEUP_CONTOURS as C} from './local-makeup.js';
import {readBlurredMaskAlpha} from './canvas-mask-blur.js';

export function checkAiRosyGeometry(face,W,H,other,w,h){
 const proportions=compareFaceProportions(faceProportions(face,W,H),faceProportions(other,w,h));
 const limits={faceWidth:.08,jawWidth:.08,eyeToChin:.07,eyeToNose:.08,eyeToMouth:.08};
 if(!proportions.ok||Object.entries(limits).some(([name,limit])=>proportions.changes[name]>limit)||!comparePortraitProtectedFeatures(portraitProtectedFeatures(face,W,H),portraitProtectedFeatures(other,w,h)).ok)throw Error('รูปตา แววตา หรือสัดส่วนใบหน้าจาก AI คลาดเคลื่อนจากต้นฉบับ · เก็บงานเดิมไว้');
}
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const read=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height);
export async function composeAiRosyMakeup({original,generated,face,generatedFace,hairMask,skinMask,signal}){
 const check=()=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการแต่งเมคอัพแล้ว'),{name:'AbortError'})};check();
 const W=original.naturalWidth||original.width,H=original.naturalHeight||original.height,w=generated.naturalWidth||generated.width,h=generated.naturalHeight||generated.height;
 checkAiRosyGeometry(face,W,H,generatedFace,w,h);
 const points=(f,width,height)=>[33,263].map(id=>({x:f[id].x*width,y:f[id].y*height})),[a,b]=points(face,W,H),[p,q]=points(generatedFace,w,h);
 const scale=Math.hypot(b.x-a.x,b.y-a.y)/Math.hypot(q.x-p.x,q.y-p.y),angle=Math.atan2(b.y-a.y,b.x-a.x)-Math.atan2(q.y-p.y,q.x-p.x);
 const aligned=canvas(W,H),ax=aligned.getContext('2d');ax.translate((a.x+b.x)/2,(a.y+b.y)/2);ax.rotate(angle);ax.scale(scale,scale);ax.translate(-(p.x+q.x)/2,-(p.y+q.y)/2);ax.drawImage(generated,0,0);
 const mask=canvas(W,H),mx=mask.getContext('2d');mx.drawImage(skinMask,0,0,W,H);mx.fillStyle='#fff';
 const polygon=ids=>{mx.beginPath();ids.forEach((id,i)=>{const v=face[id];if(!v)throw Error('ตรวจตำแหน่งใบหน้าไม่ครบ');i?mx.lineTo(v.x*W,v.y*H):mx.moveTo(v.x*W,v.y*H)});mx.closePath();mx.fill()};
 for(const ids of [...C.brows,C.lips])polygon(ids);
 mx.globalCompositeOperation='destination-out';for(const ids of [...C.eyes,C.mouth])polygon(ids);
 const d=Math.hypot(a.x-b.x,a.y-b.y);for(const id of [98,327]){mx.beginPath();mx.ellipse(face[id].x*W,face[id].y*H,d*.016,d*.011,angle,0,Math.PI*2);mx.fill()}
 const hard=read(mask).data,soft=await readBlurredMaskAlpha(mask,W,H,Math.max(.7,d*.006),{signal}),hair=await readBlurredMaskAlpha(hairMask,W,H,0,{signal});check();
 const out=canvas(W,H),ox=out.getContext('2d',{willReadFrequently:true});ox.drawImage(original,0,0,W,H);const image=read(out),candidate=read(aligned).data;
 for(let i=0;i<W*H;i++){
  const j=i*4;if(image.data[j+3]<240||hair[i]>16||!hard[j+3]||candidate[j+3]<240)continue;
  const amount=soft[i]/255*hard[j+3]/255;
  for(let c=0;c<3;c++)image.data[j+c]=Math.round(image.data[j+c]*(1-amount)+candidate[j+c]*amount);
 }
 check();ox.putImageData(image,0,0);return out;
}
