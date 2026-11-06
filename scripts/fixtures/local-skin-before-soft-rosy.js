import {skinBlemishField} from './skin-blemish-retouch.js';
import {guidedMakeupLuminance,LOCAL_MAKEUP_CONTOURS} from './local-makeup.js';
import {readBlurredMaskAlpha} from './canvas-mask-blur.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการปรับผิวแล้ว'),{name:'AbortError'})};
export async function renderLocalSkin({original,face,hairMask,skinMask,lookId,signal,onProgress}){
 const modes={'skin-bright-v1':{lift:13,soft:.32,shine:0},'skin-glow-v1':{lift:2,soft:.10,shine:.18},'skin-smooth-v1':{lift:2,soft:.72,shine:0}};
 const mode=modes[lookId];if(!mode)throw Error('กรุณาเลือกโทนปรับผิว');abort(signal);
 const W=original?.naturalWidth||original?.width,H=original?.naturalHeight||original?.height;
 if(!W||!H||!hairMask||!skinMask||!face?.[10]||!face?.[152])throw Error('ตรวจพื้นที่หน้าผาก ใบหน้า และคอไม่ครบ');
 // Only analysis is reduced; final RGB, geometry and alpha stay at native size.
 const scale=Math.min(1,1024/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale)),work=canvas(w,h),wx=work.getContext('2d',{willReadFrequently:true});wx.drawImage(original,0,0,w,h);
 const data=wx.getImageData(0,0,w,h).data,Y=new Float32Array(w*h);for(let i=0;i<Y.length;i++)Y[i]=luma(data[i*4],data[i*4+1],data[i*4+2]);onProgress?.(15);
 const guide=await guidedMakeupLuminance(Y,w,h,Math.max(2,w*.006),signal);abort(signal);
 const skinAlpha=await readBlurredMaskAlpha(skinMask,w,h,1.3,{signal});
 const hairAlpha=await readBlurredMaskAlpha(hairMask,w,h,1.2,{signal});
 const protectedFeatures=canvas(w,h),px=protectedFeatures.getContext('2d');px.fillStyle='#fff';px.strokeStyle='#fff';px.lineJoin='round';px.lineWidth=Math.max(1,w*.003);
 for(const ids of [...LOCAL_MAKEUP_CONTOURS.eyes,LOCAL_MAKEUP_CONTOURS.lips]){px.beginPath();ids.forEach((id,i)=>{const p=face[id];if(!p)throw Error('ตรวจตำแหน่งใบหน้าไม่ครบ');i?px.lineTo(p.x*w,p.y*h):px.moveTo(p.x*w,p.y*h)});px.closePath();px.fill();px.stroke()}
 const protectedAlpha=await readBlurredMaskAlpha(protectedFeatures,w,h,0,{signal});
 const featherAlpha=await readBlurredMaskAlpha(protectedFeatures,w,h,2,{signal});
 const brow=canvas(w,h),bx=brow.getContext('2d');bx.fillStyle='#fff';
 for(const ids of LOCAL_MAKEUP_CONTOURS.brows){bx.beginPath();ids.forEach((id,i)=>{const p=face[id];i?bx.lineTo(p.x*w,p.y*h):bx.moveTo(p.x*w,p.y*h)});bx.closePath();bx.fill()}
 const browAlpha=await readBlurredMaskAlpha(brow,w,h,3,{signal});
 const field=canvas(w,h),fc=field.getContext('2d'),f=fc.createImageData(w,h);
 const coverageField=new Float32Array(w*h);
 for(let i=0;i<Y.length;i++){
  coverageField[i]=skinAlpha[i]/255*(1-smooth(1,35,hairAlpha[i]))*(1-protectedAlpha[i]/255)*(1-featherAlpha[i]/255)*(1-browAlpha[i]/255*(1-smooth(55,130,Y[i])));
 }
 // Only the smoothing option applies conservative blemish/texture corrections.
 const retouch=lookId==='skin-smooth-v1'?skinBlemishField(data,w,h,coverageField):null;
 for(let i=0;i<Y.length;i++){
  const j=i*4,coverage=coverageField[i];
  // Keep native pores and strong features: modify only low-contrast luminance.
  const residual=guide[i]-Y[i],soft=clamp(residual,-7,7)*mode.soft*(1-smooth(8,22,Math.abs(residual))),lift=mode.lift*clamp((247-Y[i])/95),shine=mode.shine*clamp((Y[i]-140)/80)*(248-Y[i])*.24;
  const delta=clamp(soft+lift+shine,-10,20)*coverage;
  for(let c=0;c<3;c++)f.data[j+c]=128+(retouch?.protectedPixels[i]?0:clamp(delta+(retouch?.deltas[i*3+c]||0),-16,20))*4;f.data[j+3]=255;
 }
 fc.putImageData(f,0,0);onProgress?.(65);await new Promise(r=>setTimeout(r,0));abort(signal);
 const fullField=canvas(W,H),ff=fullField.getContext('2d',{willReadFrequently:true});ff.drawImage(field,0,0,W,H);const deltas=ff.getImageData(0,0,W,H).data;
 const out=canvas(W,H),ox=out.getContext('2d',{willReadFrequently:true});ox.drawImage(original,0,0,W,H);const result=ox.getImageData(0,0,W,H),pixels=result.data;
 for(let y=0;y<H;y++){
  for(let x=0;x<W;x++){const j=(y*W+x)*4;if(pixels[j+3]<240)continue;const sample=Math.min(h-1,Math.floor(y*h/H))*w+Math.min(w-1,Math.floor(x*w/W));if(retouch?.protectedPixels[sample])continue;for(let c=0;c<3;c++)pixels[j+c]=clamp(pixels[j+c]+(deltas[j+c]-128)/4,0,255)}
  if(y&&y%128===0){onProgress?.(65+Math.round(y/H*30));await new Promise(r=>setTimeout(r,0));abort(signal)}
 }
 ox.putImageData(result,0,0);onProgress?.(98);return out;
}
