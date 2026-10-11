// A rigid rotation only: no face warp, stretching, scaling or AI regeneration.
export function portraitLevelTransform(face,W,H){
 const a=face?.[33],b=face?.[263];
 if(!a||!b||![a.x,a.y,b.x,b.y,W,H].every(Number.isFinite)||W<=0||H<=0)return null;
 const dx=(b.x-a.x)*W,dy=(b.y-a.y)*H;
 if(dx<=0||Math.hypot(dx,dy)<W*.06)return null;
 const angle=Math.atan2(dy,dx);
 if(Math.abs(angle)<Math.PI/240||Math.abs(angle)>Math.PI*25/180)return null;
 const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
 return {angle:-angle,width:Math.ceil(W*c+H*s),height:Math.ceil(W*s+H*c)};
}
