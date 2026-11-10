// Measurements use native face landmarks and the transparent person silhouette.
// No image pixels or facial features are transformed here.
export function measureEnglishProportions(pixels,width,height,face,{allowCropped=false}={}){
 const ids=[10,152,234,454];if(pixels.length!==width*height*4||ids.some(id=>![face?.[id]?.x,face?.[id]?.y].every(Number.isFinite)))return {measurable:false};
 const fw=Math.hypot((face[454].x-face[234].x)*width,(face[454].y-face[234].y)*height),fh=(face[152].y-face[10].y)*height,chin=face[152].y*height,cx=(face[234].x+face[454].x)/2*width;
 if(fw<12||fh<20)return {measurable:false};
 const spans=[];
 // A head correction must not change the shoulder measurement window itself.
 const bodyHeight=height-chin,start=allowCropped?chin+bodyHeight*.10:chin+fh*.12,end=allowCropped?chin+bodyHeight*.45:chin+fh*.80;
 for(let y=Math.max(0,Math.ceil(start));y<Math.min(height,end);y+=Math.max(1,Math.floor((end-start)/80))){
  let left=width,right=-1,count=0;
  for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=160){left=Math.min(left,x);right=x;count++}
  if(right-left>fw*1.8&&count>fw*1.5&&(allowCropped||left>1&&right<width-2))spans.push(right-left+1);
 }
 if(spans.length<5)return {measurable:false};
 spans.sort((a,b)=>a-b);const shoulders=spans[Math.floor((spans.length-1)*.85)];
 let crown=face[10].y*height;
 for(let y=0;y<crown;y++){let count=0;for(let x=Math.max(0,Math.floor(cx-fw*.75));x<Math.min(width,cx+fw*.75);x++)if(pixels[(y*width+x)*4+3]>=160)count++;if(count>fw*.08){crown=y;break}}
 const faceRatio=fw/shoulders,headRatio=(chin-crown)/shoulders,oversized=faceRatio>.37||(faceRatio>.35&&headRatio>.66);
 const headScale=Math.max(.76,Math.min(.94,.34/faceRatio,.60/headRatio));
 return {measurable:true,oversized,faceRatio,headRatio,headScale,faceWidth:fw,faceHeight:fh,shoulderSpan:shoulders,chinY:chin,centerX:cx,crownY:crown};
}
