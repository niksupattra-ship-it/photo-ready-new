// Local inverse-mapped deformation. Source alpha is interpolated in premultiplied
// space to keep transparent hair/neck edges free of dark fringes.
export function deformPatch(input,width,height,originX,originY,centerX,centerY,radius,dx,dy,mode,strength){
 const out=new Uint8ClampedArray(input),limit=Math.min(radius*.24,Math.hypot(dx,dy));
 const distance=Math.hypot(dx,dy);if(distance>0){dx=dx/distance*limit;dy=dy/distance*limit}
 const left=Math.max(0,Math.floor(centerX-radius-originX)),right=Math.min(width,Math.ceil(centerX+radius-originX));
 const top=Math.max(0,Math.floor(centerY-radius-originY)),bottom=Math.min(height,Math.ceil(centerY+radius-originY));
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const vx=x+originX-centerX,vy=y+originY-centerY,d=Math.hypot(vx,vy)/radius;if(d>=1)continue;
  const weight=(1-d*d)**2;let sx=x,sy=y;
  if(mode==='push'){sx-=dx*strength*weight;sy-=dy*strength*weight}
  else if(mode==='shrink'||mode==='expand'){const factor=1+(mode==='shrink'?1:-1)*strength*.12*weight;sx=centerX-originX+vx*factor;sy=centerY-originY+vy*factor}
  else{const angle=(mode==='clockwise'?-1:1)*strength*.12*weight,cos=Math.cos(angle),sin=Math.sin(angle);sx=centerX-originX+vx*cos-vy*sin;sy=centerY-originY+vx*sin+vy*cos}
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,indices=[[ix,iy,(1-fx)*(1-fy)],[ix+1,iy,fx*(1-fy)],[ix,iy+1,(1-fx)*fy],[ix+1,iy+1,fx*fy]];
  let alpha=0,r=0,g=0,b=0;for(const [px,py,w] of indices){if(px<0||px>=width||py<0||py>=height)continue;const i=(py*width+px)*4,a=input[i+3]/255*w;alpha+=a;r+=input[i]*a;g+=input[i+1]*a;b+=input[i+2]*a}
  const i=(y*width+x)*4;out[i]=alpha?r/alpha:0;out[i+1]=alpha?g/alpha:0;out[i+2]=alpha?b/alpha:0;out[i+3]=alpha*255;
 }
 return out;
}
export function liquifyCanvas(target,mask,center,radius,delta,mode,strength){
 const padding=radius*.6+3,left=Math.max(0,Math.floor(center.x-radius-padding)),top=Math.max(0,Math.floor(center.y-radius-padding));
 const right=Math.min(target.width,Math.ceil(center.x+radius+padding)),bottom=Math.min(target.height,Math.ceil(center.y+radius+padding));
 if(right<=left||bottom<=top)return false;const width=right-left,height=bottom-top;
 for(const surface of [target,mask]){const ctx=surface.getContext('2d',{willReadFrequently:true}),original=ctx.getImageData(left,top,width,height);const pixels=deformPatch(original.data,width,height,left,top,center.x,center.y,radius,delta.x,delta.y,mode,strength);ctx.putImageData(new ImageData(pixels,width,height),left,top)}
 return true;
}
