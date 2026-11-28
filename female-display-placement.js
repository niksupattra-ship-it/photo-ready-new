// Place the complete finished portrait as an editable image. No image pixels,
// head/body proportions, AI prompt or guide geometry are changed here.
export function femaleDisplayPlacement(data,w,h,W=900,H=1200){
 let crown=-1,bottom=-1;
 for(let y=0;y<h;y++){
  let count=0,body=0;for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=160){count++;if(x>=w*.25&&x<w*.75)body++}
  if(crown<0&&count>=Math.max(2,Math.ceil(w*.002)))crown=y;
  if(body>=w*.15)bottom=y;
 }
 if(crown<0||bottom<h*.5)throw Error('ยังวัดกรอบภาพคนไม่ได้');
 const rows=[];
 for(let y=Math.max(0,Math.floor(bottom-h*.1));y<=bottom;y++){
  let left=w,right=-1;for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=160){left=Math.min(left,x);right=x}
  if(right-left>=w*.25)rows.push({width:right-left+1,center:(left+right+1)/2});
 }
 rows.sort((a,b)=>a.width-b.width);const coat=rows[Math.floor(rows.length/2)];if(!coat)throw Error('ยังวัดกรอบชุดไม่ได้');
 const bleed=6,scale=(W+bleed*2)/coat.width,x=W/2-coat.center*scale;
 const y=Math.max(H+bleed-(bottom+1)*scale,H*.09-crown*scale);
 return {scale,x,y,crown,headroom:y+crown*scale,sourceWidth:w,sourceHeight:h};
}
