// Alpha-only wide/deep neck-backing silhouette enforcement. RGB inside the retained face/neck/hair
// remains the AI output, with no skin retouch or face/head rescaling.
export function boundPortraitNeckAlpha(pixels,hair,width,height,face,{skin=null}={}){
 const a=face?.[33],b=face?.[263],chin=face?.[152];
 if(!a||!b||!chin||pixels.length!==width*height*4||hair.length!==pixels.length)throw Error('Invalid head/neck evidence');
 const dx=(b.x-a.x)*width,dy=(b.y-a.y)*height,d=Math.hypot(dx,dy);
 if(!Number.isFinite(d)||d<20)throw Error('Unmeasurable head/neck');
 const ex=dx/d,ey=dy/d,cx=chin.x*width,cy=chin.y*height,feather=Math.max(1,d*.008);let changed=false;
 const left=face?.[234],right=face?.[454];
 const measuredWidth=left&&right?Math.hypot((right.x-left.x)*width,(right.y-left.y)*height):0;
 const faceWidth=Number.isFinite(measuredWidth)?measuredWidth:0;
 const upperHalf=Math.max(.95*d,Math.min(1.20*d,faceWidth*.55));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;if(!pixels[i+3])continue;
  const px=(x-cx)*ex+(y-cy)*ey,py=-(x-cx)*ey+(y-cy)*ex;
  if(py<=d*.08||hair[i+3]>=192||skin&&skin[i+3]<192)continue;
  const t=py/d;
  // Keep the visible neck a wide, straight-sided shaft. The former
  // smoothstep flare began immediately under the chin and could carve a
  // curved silhouette even into a straight AI cutout. Flare only in the
  // lower overlap region, using straight sides before the rounded U base.
  const flare=Math.max(0,Math.min(1,(t-.80)/.20));
  const half=t<=1?upperHalf+(1.44*d-upperHalf)*flare:1.44*d*Math.sqrt(Math.max(0,1-((t-1)/.62)**2));
  const keep=Math.max(0,Math.min(1,(half-Math.abs(px))/feather,(d*1.62-py)/feather));
  const alpha=Math.round(pixels[i+3]*keep);if(alpha!==pixels[i+3]){pixels[i+3]=alpha;changed=true}
 }
 return changed;
}
