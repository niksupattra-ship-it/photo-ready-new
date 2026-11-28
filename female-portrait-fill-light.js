import sharp from 'sharp';

// Conservative photographic fill: correct unequal illumination relative to the
// portrait's own lit areas, not a fixed complexion target. No blur, geometry,
// alpha, face replacement, extra provider request or global whitening.
const clamp=(x)=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const ellipse=(x,y,cx,cy,rx,ry)=>smooth((1-Math.hypot((x-cx)/rx,(y-cy)/ry))*4);
const warm=(r,g,b)=>smooth((r-b-4)/14)*smooth((r-g+3)/10);

export function balancePortraitFillPixels(source,w,h){
 if(source.length!==w*h*4)throw Error('Invalid fill-light pixels');
 const hist=new Uint32Array(256);let count=0;
 // Sample the face's central region only; never target an absolute skin tone.
 for(let y=Math.floor(h*.19);y<Math.ceil(h*.46);y+=2)for(let x=Math.floor(w*.35);x<Math.ceil(w*.65);x+=2){
  const i=(y*w+x)*4,r=source[i],g=source[i+1],b=source[i+2];
  if(source[i+3]<245||warm(r,g,b)<.75)continue;
  hist[Math.round(luma(r,g,b))]++;count++;
 }
 if(count<Math.max(32,w*h*.001))return source;
 const quantile=q=>{let n=0;for(let i=0;i<256;i++){n+=hist[i];if(n>=count*q)return i}return 255};
 const low=quantile(.25),lit=quantile(.75);
 if(lit-low<14||lit<24)return source;
 const out=Buffer.from(source);
 for(let y=Math.floor(h*.10);y<Math.ceil(h*.64);y++)for(let x=Math.floor(w*.15);x<Math.ceil(w*.85);x++){
  const i=(y*w+x)*4,r=source[i],g=source[i+1],b=source[i+2],a=source[i+3];
  if(a<200)continue;
  const region=Math.max(ellipse(x/w,y/h,.5,.33,.31,.24),ellipse(x/w,y/h,.5,.48,.19,.16));
  const L=luma(r,g,b);
  // Keep very dark detail, highlights and non-skin colours protected.
  const weight=region*warm(r,g,b)*smooth((L-lit*.40)/Math.max(12,lit*.23))*smooth((lit-L)/Math.max(18,lit*.28))*smooth((a-200)/55);
  const gain=1+Math.min(.12,Math.max(0,(lit-L)*.25/Math.max(1,L)))*weight;
  const safe=Math.min(gain,248/Math.max(1,r,g,b));
  if(safe<=1)continue;
  out[i]=Math.round(r*safe);out[i+1]=Math.round(g*safe);out[i+2]=Math.round(b*safe);
 }
 return out;
}
export async function balancePortraitFill(png){
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const adjusted=balancePortraitFillPixels(data,info.width,info.height);
 if(adjusted===data||adjusted.equals(data))return png;
 return sharp(adjusted,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
