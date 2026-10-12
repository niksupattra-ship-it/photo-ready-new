// Remove foreign template skin from the inner forehead edge of a native hair
// PNG. This only decreases PNG alpha: it cannot paint skin onto the portrait,
// change hair RGB, recolour a hairstyle or modify the AI image returned.
export function cleanTemplateForehead(pixels,w,h,face,rw,rh,matrix,referencePixels,referenceSkin,nativeSkin,nativeHair){
 if(pixels?.length!==w*h*4||referencePixels?.length!==rw*rh*4||referenceSkin?.length!==rw*rh*4||nativeSkin?.length!==w*h*4||nativeHair?.length!==w*h*4||!Array.isArray(matrix)||matrix.length!==6||!matrix.every(Number.isFinite)||[33,263,10,234,454].some(i=>!face?.[i]||![face[i].x,face[i].y].every(Number.isFinite)))throw Error('ตรวจผิวต้นแบบที่ขอบทรงผมไม่สำเร็จ');
 const [a,b,c,d,e,f]=matrix,dx=(face[263].x-face[33].x)*rw,dy=(face[263].y-face[33].y)*rh,eye=Math.hypot(dx,dy);
 if(eye<5||a*d-b*c<=0)throw Error('จุดต้นแบบทรงผมไม่ชัดพอสำหรับเก็บสีผิวติดขอบ');
 const cos=dx/eye,sin=dy/eye,cx=(face[33].x+face[263].x)*rw/2,cy=(face[33].y+face[263].y)*rh/2;
 const local=(x,y)=>({u:(x-cx)*cos+(y-cy)*sin,v:-(x-cx)*sin+(y-cy)*cos});
 const forehead=local(face[10].x*rw,face[10].y*rh).v,l=local(face[234].x*rw,face[234].y*rh),r=local(face[454].x*rw,face[454].y*rh),half=Math.abs(r.u-l.u)*.55;
 const nearest=new Int32Array(rw*rh),distance=new Float32Array(rw*rh);nearest.fill(-1);distance.fill(rw+rh);
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const n=y*rw+x,q=local(x,y);
  if(referenceSkin[n*4+3]>=128&&q.v>=forehead-eye*.08&&q.v<=-eye*.12&&Math.abs(q.u)<=half){nearest[n]=n;distance[n]=0}
 }
 // Nearest actual reference skin, not a fixed generic skin colour. The
 // calibrated context keeps the material check valid for each template.
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const n=y*rw+x;for(const k of [x?n-1:-1,y?n-rw:-1])if(k>=0&&distance[k]+1<distance[n]){distance[n]=distance[k]+1;nearest[n]=nearest[k]}
 }
 for(let y=rh-1;y>=0;y--)for(let x=rw-1;x>=0;x--){
  const n=y*rw+x;for(const k of [x+1<rw?n+1:-1,y+1<rh?n+rw:-1])if(k>=0&&distance[k]+1<distance[n]){distance[n]=distance[k]+1;nearest[n]=nearest[k]}
 }
 const out=new Uint8ClampedArray(pixels);let removed=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4,alpha=pixels[j+3];if(!alpha)continue;
  const rx=a*(x+.5)+c*(y+.5)+e-.5,ry=b*(x+.5)+d*(y+.5)+f-.5,q=local(rx,ry),nx=Math.round(rx),ny=Math.round(ry);
  if(nx<0||ny<0||nx>=rw||ny>=rh||Math.abs(q.u)>half||q.v<forehead-eye*.35||q.v>-eye*.10)continue;
  const n=ny*rw+nx,skinAt=nearest[n];if(skinAt<0||distance[n]>eye*.45)continue;
  // Preserve the natural opaque scalp part inside the hair above the true
  // forehead. It is not the foreign band sitting over the wearer's forehead.
  if(Math.abs(q.u)<eye*.09&&q.v<forehead-eye*.08)continue;
  const confirmedHair=nativeHair[j+3]>=128,confirmedSkin=nativeSkin[j+3]>=128;
  if(confirmedHair&&alpha>=128)continue;
  const k=skinAt*4,colourDistance=Math.hypot(pixels[j]-referencePixels[k],pixels[j+1]-referencePixels[k+1],pixels[j+2]-referencePixels[k+2]);
  const skinTone=colourDistance<=(confirmedSkin?100:56),whiteMatte=alpha<128&&Math.min(pixels[j],pixels[j+1],pixels[j+2])>210&&Math.max(pixels[j],pixels[j+1],pixels[j+2])-Math.min(pixels[j],pixels[j+1],pixels[j+2])<35;
  if(!skinTone&&!whiteMatte)continue;
  if(!confirmedSkin&&referenceSkin[n*4+3]<128&&alpha>=128)continue;
  out[j+3]=0;removed++;
 }
 return {pixels:out,removed};
}
