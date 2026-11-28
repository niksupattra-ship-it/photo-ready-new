// Placement metadata only: the native image is never resized, warped or rewritten.
export function planFemaleResultHeadroom(pixels,width,height,{W=900,H=1200,headroom=.07}={}){
 if(![width,height,W,H].every(n=>Number.isInteger(n)&&n>0))return {scale:1,x:0,y:0,applied:false};
 const contain=Math.min(W/width,H/height),fallback={scale:contain,x:(W-width*contain)/2,y:(H-height*contain)/2,applied:false};
 if(!Number.isFinite(headroom)||headroom<0||headroom>.3||!pixels||pixels.length!==width*height*4||!Number.isFinite(contain)||contain<=0)return fallback;
 const support=Math.max(3,Math.ceil(width*.003)),bodySupport=Math.max(4,Math.ceil(width*.12));let crown=-1,bottom=-1,run=0;
 for(let y=0;y<height;y++){
  let count=0,body=0;
  for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=160){count++;if(x>=width*.25&&x<=width*.75)body++;}
  run=count>=support?run+1:0;if(crown<0&&run>=3)crown=y-2;
  if(body>=bodySupport)bottom=y+1;
 }
 if(crown<0||bottom<height*.5||bottom-crown<height*.3)return fallback;
 const scale=H*(1-headroom)/(bottom-crown);
 return {scale,x:(W-width*scale)/2,y:H*headroom-crown*scale,applied:true,crown,bottom,headroom:H*headroom};
}
