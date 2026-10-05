// Local inverse-mapped deformation. Source alpha is interpolated in premultiplied
// space to keep transparent hair/neck edges free of dark fringes.
export function deformPatch(input,width,height,originX,originY,centerX,centerY,radius,dx,dy,mode,strength){
 const out=new Uint8ClampedArray(input),limit=Math.min(radius*.24,Math.hypot(dx,dy));
 const distance=Math.hypot(dx,dy);if(distance>0){dx=dx/distance*limit;dy=dy/distance*limit}
 const left=Math.max(0,Math.floor(centerX-radius-originX)),right=Math.min(width,Math.ceil(centerX+radius-originX));
 const top=Math.max(0,Math.floor(centerY-radius-originY)),bottom=Math.min(height,Math.ceil(centerY+radius-originY));
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const vx=x+originX-centerX,vy=y+originY-centerY,d2=(vx*vx+vy*vy)/(radius*radius);if(d2>=1)continue;
  const weight=(1-d2)**2;let sx=x,sy=y;
  if(mode==='push'){sx-=dx*strength*weight;sy-=dy*strength*weight}
  else if(mode==='shrink'||mode==='expand'){const factor=1+(mode==='shrink'?1:-1)*strength*.12*weight;sx=centerX-originX+vx*factor;sy=centerY-originY+vy*factor}
  else{const angle=(mode==='clockwise'?-1:1)*strength*.12*weight,cos=Math.cos(angle),sin=Math.sin(angle);sx=centerX-originX+vx*cos-vy*sin;sy=centerY-originY+vx*sin+vy*cos}
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  let alpha=0,r=0,g=0,b=0;
  for(let corner=0;corner<4;corner++){const px=ix+(corner&1),py=iy+(corner>>1);if(px<0||px>=width||py<0||py>=height)continue;const w=((corner&1)?fx:1-fx)*((corner>>1)?fy:1-fy),i=(py*width+px)*4,a=input[i+3]/255*w;alpha+=a;r+=input[i]*a;g+=input[i+1]*a;b+=input[i+2]*a}
  const i=(y*width+x)*4;out[i]=alpha?r/alpha:0;out[i+1]=alpha?g/alpha:0;out[i+2]=alpha?b/alpha:0;out[i+3]=alpha*255;
 }
 return out;
}
export function liquifyCanvas(target,mask,center,radius,delta,mode,strength,frame=null,returnRegion=false){
 // Pointer coordinates stay in the 900 x 1200 workspace. Deform each surface
 // at its own resolution so full-resolution portrait pixels survive editing.
 let changed=false,region=null;
 for(const surface of [target,mask]){
  const scaleX=surface.width/(frame?.w||900),scaleY=surface.height/(frame?.h||1200);
  const p={x:(center.x-(frame?.x||0))*scaleX,y:(center.y-(frame?.y||0))*scaleY},r=radius*Math.max(scaleX,scaleY),padding=r*.6+3;
  const left=Math.max(0,Math.floor(p.x-r-padding)),top=Math.max(0,Math.floor(p.y-r-padding));
  const right=Math.min(surface.width,Math.ceil(p.x+r+padding)),bottom=Math.min(surface.height,Math.ceil(p.y+r+padding));
  if(right<=left||bottom<=top)continue;const width=right-left,height=bottom-top;
  const ctx=surface.getContext('2d',{willReadFrequently:true}),original=ctx.getImageData(left,top,width,height);
  const pixels=deformPatch(original.data,width,height,left,top,p.x,p.y,r,delta.x*scaleX,delta.y*scaleY,mode,strength);
  const x=Math.max(left,Math.floor(p.x-r)),y=Math.max(top,Math.floor(p.y-r)),rightEdge=Math.min(right,Math.ceil(p.x+r)),bottomEdge=Math.min(bottom,Math.ceil(p.y+r));
  ctx.putImageData(new ImageData(pixels,width,height),left,top,x-left,y-top,rightEdge-x,bottomEdge-y);changed=true;
  if(surface===target)region={x:Math.max(0,x-2),y:Math.max(0,y-2),w:Math.min(surface.width,rightEdge+2)-Math.max(0,x-2),h:Math.min(surface.height,bottomEdge+2)-Math.max(0,y-2)};
 }
 return returnRegion?region:changed;
}
