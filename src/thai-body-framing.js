// Placement only: one uniform transform of the untouched native portrait.
// Measure supported opaque rows, ignoring isolated matte noise below the coat.
export function planThaiBodyFrame(pixels,width,height,{W=900,H=1200}={}){
 if(![width,height,W,H].every(n=>Number.isInteger(n)&&n>0))return {scale:1,x:0,y:0,applied:false,reason:'unmeasurable'};
 const contain=Math.min(W/width,H/height),fallback={scale:contain,x:(W-width*contain)/2,y:(H-height*contain)/2,applied:false};
 if(pixels?.length!==width*height*4)return {...fallback,reason:'unmeasurable'};
 let crown=-1,bottom=-1;
 const support=Math.max(4,Math.ceil(width*.08));
 for(let y=0;y<height;y++){
  let count=0,body=0;for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=160){count++;if(x>=width*.3&&x<=width*.7)body++}
  if(crown<0&&count>=Math.max(2,Math.ceil(width*.002)))crown=y;
  if(body>=support)bottom=y;
 }
 if(crown<0||bottom<height*.55||bottom-crown<height*.45)return {...fallback,reason:'insufficient_body'};
 const scale=Math.max(W/width,H/(bottom+1)),y=H-(bottom+1)*scale,x=(W-width*scale)/2;
 // Do not solve a badly framed generation by cropping the crown or zooming
 // drastically. Preserve the native photo for review in ambiguous cases.
 if(scale/contain>1.22||crown*scale+y<Math.min(H*.012,crown*contain)){
  const anchored=H-(bottom+1)*contain;
  return {...fallback,y:anchored,applied:Math.abs(anchored-fallback.y)>.001,reason:'conservative_bottom_anchor',bottom,crown};
 }
 return {scale,x,y,applied:Math.abs(scale-contain)>.000001||Math.abs(y-fallback.y)>.001,reason:'bottom_anchored',bottom,crown};
}
