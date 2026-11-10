import {decodedStudioImage} from './studio-image-cache.js';
export const ENGLISH_MANUAL_OUTFIT_VERSION='fixed-pattern-fit-head-v2';
// The standard garment canvas is fixed independently of the portrait. Keep
// native proportions, full workspace width and the pattern's bottom edge.
// Head scale and position are fitted separately by fitStudioSuit.
export function planEnglishManualOutfit({uniform,W=900,H=1200}){
 if(![uniform?.width,uniform?.height,W,H].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid outfit dimensions');
 const h=W*uniform.height/uniform.width;
 return {x:0,y:H-h,w:W,h};
}
export async function fitEnglishManualOutfit({source}){
 const image=await decodedStudioImage(source);
 return planEnglishManualOutfit({uniform:{width:image.naturalWidth||image.width,height:image.naturalHeight||image.height}});
}
