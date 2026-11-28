// A bounded midtone lift of existing pixels, never a colour overlay or blur.
export function liftSkinPixels(source,mask,amount){
 if(source.length!==mask.length*4)throw Error('Invalid skin mask');
 const out=new Uint8ClampedArray(source),strength=Math.max(0,Math.min(100,Number(amount)||0))/100;
 if(!strength)return out;
 for(let n=0;n<mask.length;n++){
  const i=n*4;if(!source[i+3]||mask[n]<=0)continue;
  const r=source[i],g=source[i+1],b=source[i+2],l=(.2126*r+.7152*g+.0722*b)/255;
  // Dark features and near-white highlights remain fixed. Equal-channel
  // addition preserves the existing colour differences and surface texture.
  const shadow=Math.max(0,Math.min(1,(l-.12)/.18)),highlight=Math.max(0,Math.min(1,(.97-l)/.17));
  const lift=16*strength*Math.min(1,mask[n])*4*l*(1-l)*shadow*highlight;
  const delta=Math.min(lift,255-Math.max(r,g,b));
  out[i]=r+delta;out[i+1]=g+delta;out[i+2]=b+delta;
 }
 return out;
}

// Studio-light mode: balanced local tone curve, not skin recolouring or geometry editing.
export function adjustStudioLightPixels(source,mask,amount){
 if(source.length!==mask.length*4)throw Error('Invalid light mask');
 const out=new Uint8ClampedArray(source),strength=Math.max(0,Math.min(100,Number(amount)||0))/100;
 if(!strength)return out;
 for(let n=0;n<mask.length;n++){
  const i=n*4,w=Math.max(0,Math.min(1,mask[n]||0));if(!source[i+3]||!w)continue;
  const r=source[i],g=source[i+1],b=source[i+2],l=(.2126*r+.7152*g+.0722*b)/255;
  // Fixed black/white endpoints; fill shadows and roll off harsh highlights around a neutral pivot.
  // Equal channel offset preserves colour differences; no spatial filtering, blending of neighbouring pixels or warping.
  const delta0=24*strength*w*4*l*(1-l)*(.50-l);
  const delta=Math.max(-Math.min(r,g,b),Math.min(255-Math.max(r,g,b),delta0));
  out[i]=r+delta;out[i+1]=g+delta;out[i+2]=b+delta;
 }
 return out;
}
