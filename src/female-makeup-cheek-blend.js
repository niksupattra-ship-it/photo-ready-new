// Scoped finish for ONE-PASS female Makeup only. The AI renders all cosmetics
// in one request; this native-pixel step softens an over-concentrated cheek tint.
// No canvas geometry, alpha, skin brightness, hair, outfit or other makeup is
// reconstructed. Brows/eyes/nose/lips are protected by location and skin mask.
export const DIFFUSE_CHEEK_BLUSH_VERSION='diffuse-cheek-blush-v1';

const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t)};
const point=(face,id,w,h)=>{
 const p=face?.[id];
 return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-.1&&p.x<=1.1&&p.y>=-.1&&p.y<=1.1?{x:p.x*w,y:p.y*h}:null;
};

export function diffuseFemaleMakeupCheekBlush({pixels,width:w,height:h,face,skin,hair}={}){
 const unchanged=reason=>({pixels,changed:false,report:{status:'unchanged',reason,changedPixels:0}});
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w*h>8388608||
    !(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==w*h*4||
    !(skin instanceof Uint8Array||skin instanceof Uint8ClampedArray)||skin.length!==w*h||
    !(hair instanceof Uint8Array||hair instanceof Uint8ClampedArray)||hair.length!==w*h)return unchanged('invalid-frame');
 const required=[33,263,50,280,1,61,291,152],p={};
 for(const id of required){const value=point(face,id,w,h);if(!value)return unchanged('missing-landmarks');p[id]=value}
 const dx=p[263].x-p[33].x,dy=p[263].y-p[33].y,d=Math.hypot(dx,dy);
 if(d<38||d>Math.hypot(w,h)*.8)return unchanged('invalid-face-size');
 const ux=dx/d,uy=dy/d,chin=p[152],eyes={x:(p[33].x+p[263].x)/2,y:(p[33].y+p[263].y)/2};
 let vx=-uy,vy=ux;
 if((chin.x-eyes.x)*vx+(chin.y-eyes.y)*vy<0){vx=-vx;vy=-vy}
 const vertical=(x,y)=>(x-eyes.x)*vx+(y-eyes.y)*vy;
 const horizontal=(x,y)=>(x-p[1].x)*ux+(y-p[1].y)*uy;
 const mouth={x:(p[61].x+p[291].x)/2,y:(p[61].y+p[291].y)/2};
 const topLimit=d*.065,bottomLimit=vertical(mouth.x,mouth.y)-d*.11;
 if(bottomLimit<topLimit+d*.08)return unchanged('face-too-small-for-safe-cheeks');
 const rx=d*.47,ry=d*.30,boundX=Math.ceil(Math.abs(ux)*rx*1.2+Math.abs(vx)*ry*1.2)+2,
       boundY=Math.ceil(Math.abs(uy)*rx*1.2+Math.abs(vy)*ry*1.2)+2;
 let output=null,changed=0,affectedSides=0,largest=0;
 for(const id of [50,280]){
  const center=p[id],x0=Math.max(0,Math.floor(center.x-boundX)),x1=Math.min(w,Math.ceil(center.x+boundX)),
        y0=Math.max(0,Math.floor(center.y-boundY)),y1=Math.min(h,Math.ceil(center.y+boundY));
  let centerSum=0,centerWeight=0,outerSum=0,outerWeight=0;
  const each=(fn)=>{
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const i=y*w+x,j=i*4,alpha=skin[i]/255;
    if(alpha<.70||hair[i]>95||pixels[j+3]<245)continue;
    const v=vertical(x,y);
    if(v<topLimit||v>bottomLimit||Math.abs(horizontal(x,y))<d*.14)continue;
    const tx=((x-center.x)*ux+(y-center.y)*uy)/rx;
    const ty=((x-center.x)*vx+(y-center.y)*vy)/ry;
    const r=Math.hypot(tx,ty);
    if(r>=1.20)continue;
    fn({i,j,r,alpha,x,y});
   }
  };
  each(({j,r,alpha})=>{
   const red=pixels[j]-pixels[j+1];
   if(r<.40){centerSum+=red*alpha;centerWeight+=alpha}
   else if(r>.78&&r<1.16){outerSum+=red*alpha;outerWeight+=alpha}
  });
  if(centerWeight<12||outerWeight<20)continue;
  const centre=centerSum/centerWeight,base=outerSum/outerWeight;
  const excess=clamp(centre-base-3,0,36);
  // Do not invent blush or brighten skin if AI already distributed it well.
  if(excess<4||centre<base+7)continue;
  affectedSides++;
  each(({j,r,alpha})=>{
   const fade=1-smooth(.78,1.18,r);
   if(fade<.002)return;
   const current=pixels[j]-pixels[j+1];
   // Broad, restrained tint, rather than a saturated circular apple.
   const target=base+excess*(.34*Math.exp(-.9*r*r)+.23*Math.exp(-3*r*r));
   const delta=clamp((target-current)*.90*fade*alpha,-21,12);
   if(Math.abs(delta)<.9)return;
   // Preserve the exact pixel luminance: .2126 * deltaR +
   // .7152 * deltaG = 0. Keep blue and alpha unchanged.
   const red=clamp(Math.round(pixels[j]+.7152*delta),0,255),
         green=clamp(Math.round(pixels[j+1]-.2126*delta),0,255);
   if(red===pixels[j]&&green===pixels[j+1])return;
   if(!output)output=new Uint8ClampedArray(pixels);
   output[j]=red;output[j+1]=green;
   changed++;largest=Math.max(largest,Math.abs(delta));
  });
 }
 return {pixels:output||pixels,changed:Boolean(output),report:{
  status:output?'applied':'unchanged',version:DIFFUSE_CHEEK_BLUSH_VERSION,
  changedPixels:changed,affectedSides,maxColourDelta:largest
 }};
}
