import {guidedMakeupLuminance,LOCAL_MAKEUP_CONTOURS} from './local-makeup.js';
import {skinBlemishField} from './skin-blemish-retouch.js';
import {readBlurredMaskAlpha} from './canvas-mask-blur.js';
export const PRE_AI_SKIN_VERSION='native-texture-tonal-retouch-v6';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const dead=(v,t)=>Math.sign(v)*Math.max(0,Math.abs(v)-t);

// Weighted low-frequency colour/light estimates. Only skin contributes: no
// blue background, black hair or garment colour is averaged into the face.
function skinBase(pixels,w,h,coverage,radius){
 const stride=w+1,size=stride*(h+1),sum=Array.from({length:4},()=>new Float64Array(size));
 for(let y=0;y<h;y++){
  let r=0,g=0,b=0,n=0;
  for(let x=0;x<w;x++){
   const i=y*w+x,j=i*4,k=(y+1)*stride+x+1,weight=coverage[i]>.8&&pixels[j+3]>240?1:0;
   r+=pixels[j]*weight;g+=pixels[j+1]*weight;b+=pixels[j+2]*weight;n+=weight;
   sum[0][k]=sum[0][k-stride]+r;sum[1][k]=sum[1][k-stride]+g;sum[2][k]=sum[2][k-stride]+b;sum[3][k]=sum[3][k-stride]+n;
  }
 }
 const base=new Float32Array(w*h*3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4,k=i*3,x0=Math.max(0,x-radius),y0=Math.max(0,y-radius),x1=Math.min(w,x+radius+1),y1=Math.min(h,y+radius+1);
  const a=y0*stride+x0,b=y0*stride+x1,c=y1*stride+x0,d=y1*stride+x1,n=sum[3][d]-sum[3][b]-sum[3][c]+sum[3][a];
  for(let channel=0;channel<3;channel++)base[k+channel]=n>=12?(sum[channel][d]-sum[channel][b]-sum[channel][c]+sum[channel][a])/n:pixels[j+channel];
 }
 return base;
}

// Frequency-separated corrections: retain native high-frequency samples and
// apply bounded colour/light deltas, with conservative spot-only retouching.
export async function buildPreAiSkinField(pixels,w,h,coverage,{radius=Math.max(4,Math.round(w*.025))}={}){
 if(pixels.length!==w*h*4||coverage.length!==w*h)throw Error('ข้อมูลเตรียมผิวไม่ครบ');
 const Y=new Float32Array(w*h);for(let i=0;i<Y.length;i++)Y[i]=luma(pixels[i*4],pixels[i*4+1],pixels[i*4+2]);
 const fine=await guidedMakeupLuminance(Y,w,h,Math.max(2,radius*.25));
 const base=skinBase(pixels,w,h,coverage,radius),spots=skinBlemishField(pixels,w,h,coverage,{radius:Math.max(3,Math.round(radius*.4))});
 const hist=new Uint32Array(256);let count=0;
 for(let i=0;i<Y.length;i++)if(coverage[i]>.8&&!spots.protectedPixels[i]&&Y[i]>55&&Y[i]<235){const k=i*3;hist[Math.round(luma(base[k],base[k+1],base[k+2]))]++;count++}
 const quantile=f=>{let n=0;for(let i=0;i<256;i++){n+=hist[i];if(n>=count*f)return i}return 160};
 const low=quantile(.2),high=quantile(.8),target=quantile(.6),uneven=count>=24&&high-low>12;
 const deltas=new Float32Array(w*h*3);let corrected=0;
 for(let i=0;i<Y.length;i++){
  const j=i*4,k=i*3;if(coverage[i]<=0||pixels[j+3]<240)continue;
  const broad=luma(base[k],base[k+1],base[k+2]),residual=fine[i]-Y[i];
  const redExcess=(pixels[j]-pixels[j+1])-(base[k]-base[k+1]);
  // A clearly red, midtone spot can be colour-corrected; dark or ambiguous
  // marks retain the conservative mole protection from the existing tool.
  const clearRed=redExcess>14&&Y[i]>90&&Y[i]<220&&pixels[j]-pixels[j+2]>16;
  if(spots.protectedPixels[i]&&!clearRed)continue;
  if(clearRed)spots.protectedPixels[i]=0;
  const edge=1-clamp((Math.abs(residual)-8)/14,0,1),skin=clamp((Y[i]-55)/45,0,1),weight=coverage[i]*edge*skin;
  if(weight<=0)continue;
  // Analyse the original light: soften local hard patches, compress broad
  // light contrast gently, retain the source's light direction and 3D shading.
  const balance=uneven?clamp(dead(target-broad,7)*.24,-5,7):0;
  const diffusion=clamp(dead(broad-fine[i],2)*.28,-5,5);
  const light=clamp(balance+diffusion,-5,7);
  // Distinguish small red blemishes/shallow fine creases from pores and moles.
  const spot=redExcess>7&&pixels[j]-pixels[j+2]>12;
  // Keep fine skin grain and expression lines intact; no general smoothing.
  for(let channel=0;channel<3;channel++){
   const chroma=(base[k+channel]-broad)-(pixels[j+channel]-Y[i]);
   const colour=Math.abs(chroma)<16?clamp(dead(chroma,4)*.18,-2,2):0;
   const repair=clearRed?clamp((base[k+channel]-pixels[j+channel])*.55,-10,10):spot?spots.deltas[k+channel]:0;
   const delta=clamp(light+colour+repair,-10,12)*weight;
   deltas[k+channel]=delta;if(Math.abs(delta)>=.5)corrected++;
  }
 }
 return {deltas,protectedPixels:spots.protectedPixels,stats:{uneven,lightSpread:high-low,correctedChannels:corrected}};
}

export async function preparePreAiSkin(image,skinMask,face){
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const required=[33,263,10,152,...LOCAL_MAKEUP_CONTOURS.eyes.flat(),...LOCAL_MAKEUP_CONTOURS.brows.flat(),...LOCAL_MAKEUP_CONTOURS.lips];
 if(!skinMask||required.some(id=>!Number.isFinite(face?.[id]?.x)||!Number.isFinite(face?.[id]?.y)))throw Error('ตรวจบริเวณผิวก่อนประมวลผลไม่สำเร็จ กรุณาใช้รูปที่เห็นใบหน้าชัดเจน');
 const eye=Math.hypot((face[33].x-face[263].x)*W,(face[33].y-face[263].y)*H);if(eye<20)throw Error('ใบหน้าเล็กเกินไปสำหรับเตรียมผิว');
 const scale=Math.min(1,1024/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale));
 const work=canvas(w,h),wx=work.getContext('2d',{willReadFrequently:true});wx.drawImage(image,0,0,w,h);
 const pixels=wx.getImageData(0,0,w,h).data,mask=canvas(w,h),mx=mask.getContext('2d');mx.drawImage(skinMask,0,0,w,h);
 // Protect actual feature contours, not rectangular strips of adjacent skin.
 const features=canvas(w,h),fx=features.getContext('2d');fx.fillStyle='white';fx.strokeStyle='white';fx.lineWidth=Math.max(1,eye*scale*.009);fx.lineJoin='round';
 for(const ids of [...LOCAL_MAKEUP_CONTOURS.eyes,...LOCAL_MAKEUP_CONTOURS.brows,LOCAL_MAKEUP_CONTOURS.lips]){
  fx.beginPath();ids.forEach((id,i)=>{const p=face[id];i?fx.lineTo(p.x*w,p.y*h):fx.moveTo(p.x*w,p.y*h)});fx.closePath();fx.fill();fx.stroke();
 }
 const alpha=await readBlurredMaskAlpha(mask,w,h,0),soft=await readBlurredMaskAlpha(mask,w,h,Math.max(1,eye*scale*.018)),protectedAlpha=await readBlurredMaskAlpha(features,w,h,0),featureSoft=await readBlurredMaskAlpha(features,w,h,1);
 const coverage=new Float32Array(w*h),cx=(face[33].x+face[263].x)*w/2,top=face[10].y*h-eye*scale*.05,bottom=face[152].y*h+eye*scale*1.5;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;coverage[i]=Math.abs(x-cx)<=eye*scale*1.1&&y>=top&&y<=bottom?alpha[i]/255*clamp((soft[i]-128)/127,0,1)*(1-protectedAlpha[i]/255)*(1-featureSoft[i]/255):0}
 const field=await buildPreAiSkinField(pixels,w,h,coverage,{radius:Math.max(4,Math.round(eye*scale*.12))});
 const encoded=canvas(w,h),ex=encoded.getContext('2d'),data=ex.createImageData(w,h);
 for(let i=0;i<w*h;i++){for(let c=0;c<3;c++)data.data[i*4+c]=128+field.deltas[i*3+c]*4;data.data[i*4+3]=255}ex.putImageData(data,0,0);
 const full=canvas(W,H),fc=full.getContext('2d',{willReadFrequently:true});fc.drawImage(encoded,0,0,W,H);const correction=fc.getImageData(0,0,W,H).data;
 const out=canvas(W,H),ox=out.getContext('2d',{willReadFrequently:true});ox.drawImage(image,0,0);const result=ox.getImageData(0,0,W,H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,j=i*4,k=Math.min(h-1,Math.floor(y*h/H))*w+Math.min(w-1,Math.floor(x*w/W));
  if(coverage[k]<=0||field.protectedPixels[k]||result.data[j+3]<240)continue;
  for(let c=0;c<3;c++)result.data[j+c]+=(correction[j+c]-128)/4;
 }
 ox.putImageData(result,0,0);out.idpromSkinPreparation=field.stats;
 for(const c of [work,mask,features,encoded,full]){c.width=1;c.height=1}return out;
}
