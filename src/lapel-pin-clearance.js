// Read-only fabric evidence. Test the complete native badge footprint plus
// clearance, not a few white centre pixels which can miss a pale seam.
export function clearLapelPins(image,frame,collar){
 const {data,width,height}=image,span=frame.w,bw=span*collar.width;
 if(!data||data.length!==width*height*4||bw<3)return {collar,clear:false};
 const rx=bw*.72,ry=bw*.90,step=Math.max(1,Math.round(span/500));
 const delta=Math.max(1,Math.round(span*.004));
 const light=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<2||y<2||x>=width-2||y>=height-2)return null;const i=(y*width+x)*4;return data[i+3]>=190?[data[i],data[i+1],data[i+2]]:null};
 const safe=(x,y)=>{
  for(let dy=-ry;dy<=ry;dy+=step)for(let dx=-rx;dx<=rx;dx+=step){
   const p=light(x+dx,y+dy);if(!p||Math.min(...p)<170||Math.max(...p)-Math.min(...p)>55)return false;
   const lum=p.reduce((a,b)=>a+b,0)/3;
   for(const [a,b]of [[delta,0],[-delta,0],[0,delta],[0,-delta]]){const q=light(x+dx+a,y+dy+b);if(!q||Math.abs(lum-q.reduce((a,b)=>a+b,0)/3)>11)return false}
  }
  return true;
 };
 const ox=[collar.left,collar.right].map(x=>frame.x+span*x),oy=frame.y+frame.h*collar.y;
 if(ox.every(x=>safe(x,oy)))return {collar,clear:true};
 // Keep one level for the pair, while each side finds its nearest clear
 // fabric patch. Search locally so a collar cannot migrate to a shoulder.
 const reach=span*.065,grid=Math.max(2,span*.006);let best=null;
 for(let dy=-reach;dy<=reach;dy+=grid){
  const pair=ox.map((x,side)=>{
   let found=null;
   for(let dx=-reach;dx<=reach;dx+=grid){
    const px=x+dx;if(side===0?px>frame.x+span*.44:px<frame.x+span*.56)continue;
    if(!safe(px,oy+dy))continue;
    const score=dx*dx;if(!found||score<found.score)found={x:px,score};
   }
   return found;
  });
  if(pair.some(p=>!p))continue;
  const score=pair[0].score+pair[1].score+2*dy*dy;
  if(!best||score<best.score)best={pair,y:oy+dy,score};
 }
 if(!best)return {collar,clear:false};
 return {collar:{...collar,left:(best.pair[0].x-frame.x)/span,right:(best.pair[1].x-frame.x)/span,y:(best.y-frame.y)/frame.h},clear:true};
}
