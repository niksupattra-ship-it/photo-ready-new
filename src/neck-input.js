// Only the temporary AI upload is changed. Never synthesize skin in canvas.
// Remove source garment cues before asking AI to build the final fitting neck.
export function prepareNeckInput(pixels,hair,clothing,w,h,region,{keepOriginalHair=false}={}){
 const {left,right,chin,eyeDistance}=region;
 if(pixels.length!==w*h*4||hair.length!==w*h||clothing.length!==w*h||
  ![left,right,chin,eyeDistance].every(Number.isFinite)||eyeDistance<=0||left>=right)throw Error('Invalid neck input geometry');
 const start=Math.max(0,Math.floor(chin-eyeDistance*.65));
 const rebuildBelow=chin+eyeDistance*.08;
 const center=(left+right)/2,neckHalf=(right-left)*.40;
 let changed=0;
 for(let y=start;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,i=n*4;
  // A hard, generous face/jaw rectangle protects even misclassified skin.
  if(y<=rebuildBelow&&x>=left&&x<=right)continue;
  // Original long hair can remain outside the neck when no replacement was
  // selected. Selected hairstyles are rebuilt from the chosen reference.
  if(keepOriginalHair&&hair[n]>=248&&Math.abs(x-center)>neckHalf)continue;
  if(y<=rebuildBelow&&clothing[n]<192)continue;
  pixels[i]=pixels[i+1]=pixels[i+2]=242;pixels[i+3]=255;changed++;
 }
 return changed;
}
