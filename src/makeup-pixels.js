// Narrow feathered masks preserve every original pixel outside selected makeup.
export function makeupMask(face,w,h,styles){
 const c=Object.assign(document.createElement('canvas'),{width:w,height:h}),x=c.getContext('2d');
 const d=Math.hypot((face[33].x-face[263].x)*w,(face[33].y-face[263].y)*h);
 const polygon=ids=>{x.beginPath();ids.forEach((id,i)=>{const p=face[id];i?x.lineTo(p.x*w,p.y*h):x.moveTo(p.x*w,p.y*h)});x.closePath();x.fill()};
 const ellipse=(id,rx,ry)=>{x.beginPath();x.ellipse(face[id].x*w,face[id].y*h,d*rx,d*ry,0,0,Math.PI*2);x.fill()};
 x.fillStyle='#fff';x.filter=`blur(${Math.max(1,d*.012)}px)`;
 // A complete look gets a slightly inset face mask. Hair/ears/neck and the
 // existing face silhouette stay outside it, including the latest edge cleanup.
 if(styles.look){
  const ids=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const cx=(face[234].x+face[454].x)*w/2,cy=(face[10].y+face[152].y)*h/2;
  x.beginPath();ids.forEach((id,i)=>{const p=face[id],xx=cx+(p.x*w-cx)*.94,yy=cy+(p.y*h-cy)*.94;i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.closePath();x.fill();
 }
 if(styles.brows){polygon([70,63,105,66,107,55,65,52,53,46]);polygon([336,296,334,293,300,276,283,282,295,285])}
 if(styles.lips)polygon([61,40,37,0,267,270,291,321,314,17,84,91]);
 if(styles.lashes){x.lineWidth=d*.035;x.strokeStyle='#fff';for(const ids of [[33,160,159,158,133],[263,387,386,385,362]]){x.beginPath();ids.forEach((id,i)=>{const p=face[id];i?x.lineTo(p.x*w,p.y*h):x.moveTo(p.x*w,p.y*h)});x.stroke()}}
 if(styles.cheeks||styles.blush){ellipse(50,.22,.14);ellipse(280,.22,.14)}
 // Exclude eye interiors and nostrils even when nearby skin receives makeup.
 x.filter='none';x.globalCompositeOperation='destination-out';
 polygon([33,160,159,158,133,153,145,144]);polygon([263,387,386,385,362,380,374,373]);
 if(styles.lips||styles.look)polygon([78,81,13,311,308,402,14,178]);
 if(styles.look){ellipse(98,.014,.010);ellipse(327,.014,.010)}
 return c;
}
export function blendMakeupPixels(original,generated,mask){
 const out=new Uint8ClampedArray(original);
 for(let i=0;i<out.length;i+=4){const a=mask[i+3]/255;if(!a||!original[i+3])continue;for(let k=0;k<3;k++)out[i+k]=Math.round(original[i+k]*(1-a)+generated[i+k]*a)}
 return out;
}
