// Canvas2D.filter is ignored by some WebKit versions. Use the same alpha-only
// Gaussian on every browser so the skin tools keep the same soft boundaries.
const cancelled=signal=>{
 if(signal?.aborted)throw Object.assign(Error('ยกเลิกการปรับผิวแล้ว'),{name:'AbortError'});
};
const yieldWork=async signal=>{await new Promise(resolve=>setTimeout(resolve,0));cancelled(signal)};

export async function gaussianMaskAlpha(alpha,width,height,sigma,{signal}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||alpha.length!==width*height||!Number.isFinite(sigma)||sigma<0)throw Error('ข้อมูลขอบภาพไม่ถูกต้อง');
 cancelled(signal);
 if(sigma===0)return new Uint8ClampedArray(alpha);
 const radius=Math.ceil(sigma*3),weights=new Float64Array(radius*2+1);
 let sum=0;
 for(let k=-radius;k<=radius;k++){const value=Math.exp(-k*k/(2*sigma*sigma));weights[k+radius]=value;sum+=value}
 for(let k=0;k<weights.length;k++)weights[k]/=sum;
 const horizontal=new Float32Array(alpha.length),out=new Uint8ClampedArray(alpha.length);
 // Outside the mask is transparent, matching blur on an otherwise empty canvas.
 for(let y=0;y<height;y++){
  const row=y*width;
  for(let x=0;x<width;x++){
   let value=0;
   for(let k=Math.max(-radius,-x),end=Math.min(radius,width-1-x);k<=end;k++)value+=alpha[row+x+k]*weights[k+radius];
   horizontal[row+x]=value;
  }
  if(y&&y%64===0)await yieldWork(signal);
 }
 for(let y=0;y<height;y++){
  const start=Math.max(-radius,-y),end=Math.min(radius,height-1-y),row=y*width;
  for(let x=0;x<width;x++){
   let value=0;
   for(let k=start;k<=end;k++)value+=horizontal[(y+k)*width+x]*weights[k+radius];
   out[row+x]=value;
  }
  if(y&&y%64===0)await yieldWork(signal);
 }
 cancelled(signal);return out;
}

export async function readBlurredMaskAlpha(source,width,height,sigma,{signal}={}){
 cancelled(signal);
 const canvas=Object.assign(document.createElement('canvas'),{width,height});
 let alpha;
 try{
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('เตรียมขอบภาพไม่สำเร็จ กรุณาลองอีกครั้ง');
  context.drawImage(source,0,0,width,height);
  const pixels=context.getImageData(0,0,width,height).data;
  alpha=new Uint8ClampedArray(width*height);
  for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
 }finally{canvas.width=1;canvas.height=1}
 return gaussianMaskAlpha(alpha,width,height,sigma,{signal});
}
