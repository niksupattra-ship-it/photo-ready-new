// Thai Easy Mode ONLY: touch targets for draggable insignia on the finished photo.
// Input positions use the existing 900 x 1200 scene; proximity is CSS pixels.
const W=900,H=1200;
export function easyInsigniaHit(handles,point,frameWidth,frameHeight){
 if(!point||!(frameWidth>0)||!(frameHeight>0))return null;
 const cursor={x:point.x/W*frameWidth,y:point.y/H*frameHeight};
 let best=null;
 for(let index=0;index<handles.length;index++){
  const handle=handles[index],box=handle.box;
  if(!box||!(box.w>0)||!(box.h>0))continue;
  const x=box.x/W*frameWidth,y=box.y/H*frameHeight;
  const width=box.w/W*frameWidth,height=box.h/H*frameHeight;
  const padX=Math.max(16,(56-width)/2),padY=Math.max(16,(56-height)/2);
  const outsideX=Math.max(x-cursor.x,0,cursor.x-(x+width));
  const outsideY=Math.max(y-cursor.y,0,cursor.y-(y+height));
  if(outsideX>padX||outsideY>padY)continue;
  const score=Math.hypot(outsideX,outsideY)*10+Math.hypot(cursor.x-(x+width/2),cursor.y-(y+height/2));
  if(!best||score<best.score||(score===best.score&&index>best.index))best={handle,score,index};
 }
 return best?.handle||null;
}
// Four resize grips can overlap a small badge. Tapping on its real body
// always starts a move; outside corner grips still permit resizing.
export function easyInsigniaGestureMode(isResizeGrip,point,box){
 if(!isResizeGrip||!point||!box)return 'move';
 const inside=point.x>=box.x&&point.x<=box.x+box.w&&point.y>=box.y&&point.y<=box.y+box.h;
 return inside?'move':'resize';
}
