// Blur only the eraser strength, never hair RGB or the entire PNG opacity.
// Three separable box passes approximate a Gaussian in linear image time.
export function softHairEraser(pixels,w,h,strength,sigma,limit=null){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==w*h*4||strength?.length!==w*h||!Number.isFinite(sigma)||sigma<=0||limit&&limit.length!==w*h)throw Error('ข้อมูลยางลบขอบฟุ้งไม่ถูกต้อง');
 const radius=Math.min(64,Math.max(1,Math.ceil(sigma))),size=radius*2+1;
 const field=new Float32Array(strength),scratch=new Float32Array(w*h);
 const clamp=(n,max)=>Math.max(0,Math.min(max,n));
 for(let pass=0;pass<3;pass++){
  for(let y=0;y<h;y++){
   const row=y*w;let sum=0;for(let k=-radius;k<=radius;k++)sum+=field[row+clamp(k,w-1)];
   for(let x=0;x<w;x++){scratch[row+x]=sum/size;sum+=field[row+clamp(x+radius+1,w-1)]-field[row+clamp(x-radius,w-1)]}
  }
  for(let x=0;x<w;x++){
   let sum=0;for(let k=-radius;k<=radius;k++)sum+=scratch[clamp(k,h-1)*w+x];
   for(let y=0;y<h;y++){field[y*w+x]=sum/size;sum+=scratch[clamp(y+radius+1,h-1)*w+x]-scratch[clamp(y-radius,h-1)*w+x]}
  }
 }
 const out=new Uint8ClampedArray(pixels);
 for(let n=0;n<w*h;n++){
  const j=n*4;if(!pixels[j+3])continue;
  const amount=Math.max(0,Math.min(1,field[n],limit?limit[n]:1));
  out[j+3]=Math.round(pixels[j+3]*(1-amount));
 }
 return out;
}
