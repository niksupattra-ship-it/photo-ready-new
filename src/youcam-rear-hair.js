export const needsRearHair = id => /^youcam-f(?:16|17|18)$/.test(id);

// Split only lower classified hair; keep the crown/face untouched. The original
// neck skin is restored in front of it, and the rear is drawn below the suit.
export function splitRearHair(generated,original,hair,skin,w,h,chinY,transition){
 if([generated,original,hair,skin].some(a=>a?.length!==w*h*4)||!Number.isFinite(chinY))throw Error('ข้อมูลแยกผมด้านหลังไม่ครบ');
 const front=new Uint8ClampedArray(generated),back=new Uint8ClampedArray(generated);
 const span=Math.max(1,transition||1);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,t=Math.max(0,Math.min(1,(y-chinY)/span)),r=t*t*(3-2*t);
  const hairPart=hair[i+3]/255*r;
  back[i+3]=Math.round(generated[i+3]*hairPart);
  front[i+3]=Math.round(generated[i+3]*(1-hairPart));
  const a=original[i+3]/255*skin[i+3]/255*r;
  if(a>0){
   const b=front[i+3]/255,outA=a+b*(1-a);
   for(let c=0;c<3;c++)front[i+c]=Math.round((original[i+c]*a+front[i+c]*b*(1-a))/outA);
   front[i+3]=Math.round(outA*255);
  }
 }
 return {front,back};
}
