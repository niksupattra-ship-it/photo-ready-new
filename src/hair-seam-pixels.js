// A complete head: AI hair with the original face, ears, skin and neck pixels.
export function mergeRefinedHairHead(ai,portrait,hair,skin,w,h){
 const out=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++){
  const j=i*4;
  if(skin[j+3]>0&&portrait[j+3]>0){out.set(portrait.subarray(j,j+4),j);continue}
  if(!hair[j+3]||!ai[j+3])continue;
  out[j]=ai[j];out[j+1]=ai[j+1];out[j+2]=ai[j+2];out[j+3]=ai[j+3];
 }
 return out;
}
