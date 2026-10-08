// Narrow feathered masks preserve every original pixel outside selected makeup.
export function makeupMask(face,w,h,styles){
 const c=Object.assign(document.createElement('canvas'),{width:w,height:h}),x=c.getContext('2d');
 const d=Math.hypot((face[33].x-face[263].x)*w,(face[33].y-face[263].y)*h);
 const polygon=ids=>{x.beginPath();ids.forEach((id,i)=>{const p=face[id];i?x.lineTo(p.x*w,p.y*h):x.moveTo(p.x*w,p.y*h)});x.closePath();x.fill()};
 const ellipse=(id,rx,ry)=>{x.beginPath();x.ellipse(face[id].x*w,face[id].y*h,d*rx,d*ry,0,0,Math.PI*2);x.fill()};
 x.fillStyle='#fff';x.filter=`blur(${Math.max(1,d*.012)}px)`;
 if(styles.brows){polygon([70,63,105,66,107,55,65,52,53,46]);polygon([336,296,334,293,300,276,283,282,295,285])}
 if(styles.lips)polygon([61,40,37,0,267,270,291,321,314,17,84,91]);
 if(styles.lashes){x.lineWidth=d*.035;x.strokeStyle='#fff';for(const ids of [[33,160,159,158,133],[263,387,386,385,362]]){x.beginPath();ids.forEach((id,i)=>{const p=face[id];i?x.lineTo(p.x*w,p.y*h):x.moveTo(p.x*w,p.y*h)});x.stroke()}}
 if(styles.cheeks||styles.blush){ellipse(50,.22,.14);ellipse(280,.22,.14)}
 // Exclude eye interiors and nostrils even when nearby skin receives makeup.
 x.filter='none';x.globalCompositeOperation='destination-out';
 polygon([33,160,159,158,133,153,145,144]);polygon([263,387,386,385,362,380,374,373]);
 if(styles.lips)polygon([78,81,13,311,308,402,14,178]);
 return c;
}
export function blendMakeupPixels(original,generated,mask){
 const out=new Uint8ClampedArray(original);
 for(let i=0;i<out.length;i+=4){const a=mask[i+3]/255;if(!a||!original[i+3])continue;for(let k=0;k<3;k++)out[i+k]=Math.round(original[i+k]*(1-a)+generated[i+k]*a)}
 return out;
}
