import {ENGLISH_HEAD_TARGETS as targets} from '../english-body-portrait.js';
// Measurements use native face landmarks and the transparent person silhouette.
// No image pixels or facial features are transformed here.
export function measureEnglishProportions(pixels,width,height,face){
 const ids=[10,152,234,454];if(pixels.length!==width*height*4||ids.some(id=>!face?.[id]))return {measurable:false};
 const fw=Math.hypot((face[454].x-face[234].x)*width,(face[454].y-face[234].y)*height),fh=(face[152].y-face[10].y)*height,chin=face[152].y*height,cx=(face[234].x+face[454].x)/2*width;
 if(fw<12||fh<20)return {measurable:false};
 const spans=[];
 for(let y=Math.max(0,Math.ceil(chin+fh*.12));y<Math.min(height,chin+fh*.80);y+=Math.max(1,Math.floor(fh/80))){
  let left=width,right=-1,count=0;
  for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=160){left=Math.min(left,x);right=x;count++}
  if(right-left>fw*1.8&&count>fw*1.5&&left>1&&right<width-2)spans.push(right-left+1);
 }
 if(spans.length<5)return {measurable:false};
 spans.sort((a,b)=>a-b);const shoulders=spans[Math.floor((spans.length-1)*.85)];
 let crown=face[10].y*height;
 for(let y=0;y<crown;y++){let count=0;for(let x=Math.max(0,Math.floor(cx-fw*.75));x<Math.min(width,cx+fw*.75);x++)if(pixels[(y*width+x)*4+3]>=160)count++;if(count>fw*.08){crown=y;break}}
 const faceRatio=fw/shoulders,headRatio=(chin-crown)/shoulders,oversized=faceRatio>targets.faceMax||(faceRatio>targets.tallFaceMin&&headRatio>targets.headHeightMax);
 const headScale=Math.max(targets.minCorrectionScale,Math.min(targets.maxCorrectionScale,targets.targetFace/faceRatio,targets.targetHeadHeight/headRatio));
 return {measurable:true,oversized,faceRatio,headRatio,headScale};
}
