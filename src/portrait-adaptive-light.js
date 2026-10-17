// Adaptive colour/exposure correction of the initial portrait's actual pixels.
// Eye whites provide an independent lighting cue; skin darkness alone never
// authorises a correction. No geometry, detail or alpha is reconstructed.
const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const quantile=(sorted,q)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.round((sorted.length-1)*q)))];
const median=a=>quantile(a.sort((x,y)=>x-y),.5);

function inside(p,polygon){
 let yes=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
 }
 return yes;
}

function edgeDistance(p,polygon){
 let best=Infinity;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1));
  best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
 }
 return best;
}

function eyeWhite(pixels,w,h,points,iris,d){
 const left=Math.max(1,Math.floor(Math.min(...points.map(p=>p.x)))),right=Math.min(w-2,Math.ceil(Math.max(...points.map(p=>p.x))));
 const top=Math.max(1,Math.floor(Math.min(...points.map(p=>p.y)))),bottom=Math.min(h-2,Math.ceil(Math.max(...points.map(p=>p.y))));
 const inset=Math.max(.65,Math.min(2,d*.003)),radius=Math.max(1.25,...iris.slice(1).map(p=>Math.hypot(p.x-iris[0].x,p.y-iris[0].y)))*1.25+.5;
 const candidates=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const p={x:x+.5,y:y+.5};
  if(!inside(p,points)||edgeDistance(p,points)<inset||Math.hypot(p.x-iris[0].x,p.y-iris[0].y)<=radius)continue;
  const j=(y*w+x)*4,r=pixels[j],g=pixels[j+1],b=pixels[j+2],L=luma(r,g,b);
  if(pixels[j+3]<240||Math.min(r,g,b)<10||Math.max(r,g,b)>246)continue;
  let gradient=0;
  for(const n of [j-4,j+4,j-w*4,j+w*4])gradient=Math.max(gradient,Math.abs(L-luma(pixels[n],pixels[n+1],pixels[n+2])));
  if(gradient>Math.max(35,L*.28))continue;
  candidates.push({r,g,b,L});
 }
 candidates.sort((a,b)=>a.L-b.L);
 const minimum=Math.max(6,Math.min(18,Math.ceil(d*.025)));
 if(candidates.length<minimum)return null;
 const low=quantile(candidates.map(p=>p.L),.45),high=quantile(candidates.map(p=>p.L),.87);
 const selected=candidates.filter(p=>p.L>=low&&p.L<=high);
 if(selected.length<Math.max(4,minimum*.45))return null;
 const rgb=['r','g','b'].map(c=>median(selected.map(p=>p[c]))),L=luma(...rgb);
 return {rgb,luma:L,count:candidates.length,high:quantile(candidates.map(p=>p.L),.95)};
}

function castEvidence(rgb,strict){
 const [r,g,b]=rgb,gb=g/Math.max(1,b),rb=r/Math.max(1,b),gr=g/Math.max(1,r);
 const yellow=gb>(strict?1.26:1.18)&&rb>(strict?1.34:1.26);
 const green=gr>(strict?1.09:1.045)&&gb>(strict?1.13:1.08)&&g/Math.max(1,(r+b)/2)>(strict?1.13:1.09);
 return {yellow,green,gb,rb,gr};
}

/**
 * skin is a native-size confidence plane in [0,1], combining face/body skin.
 * Normal or uncertain portraits return an exact copy and changed:false.
 * Output uses stricter gates to avoid repeating a successful input correction.
 */
export function finishPortraitLighting({pixels,width:w,height:h,face,skin,stage='input'}={}){
 const n=w*h;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||n>33554432||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==n*4)throw Error('ขนาดภาพปรับแสงไม่ถูกต้อง');
 const out=new Uint8ClampedArray(pixels),report={stage,lowLight:false,colorCast:false,confidence:0,changedPixels:0,exposureGain:1,whiteBalance:[1,1,1],reason:'insufficient-evidence'};
 const result=()=>({pixels:out,changed:report.changedPixels>0,report});
 if(stage!=='input'&&stage!=='output'){report.reason='invalid-stage';return result()}
 if(!skin||skin.length!==n)return result();
 for(let i=0;i<n;i++)if(!Number.isFinite(skin[i])||skin[i]<0||skin[i]>1)return result();
 const required=[...EYES.flat(),468,469,470,471,472,473,474,475,476,477,33,263,10,152,234,454];
 if(required.some(i=>!Number.isFinite(face?.[i]?.x)||!Number.isFinite(face?.[i]?.y)))return result();
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),left=point(33),right=point(263),d=Math.hypot(right.x-left.x,right.y-left.y);
 if(d<25)return result();
 const eyes=EYES.map((ids,k)=>eyeWhite(pixels,w,h,ids.map(point),[468+k*5,469+k*5,470+k*5,471+k*5,472+k*5].map(point),d));
 if(eyes.some(e=>!e))return result();
 const eyeRGB=[0,1,2].map(c=>(eyes[0].rgb[c]+eyes[1].rgb[c])/2),eyeL=luma(...eyeRGB);
 const eyeAgreement=Math.min(eyes[0].luma,eyes[1].luma)/Math.max(eyes[0].luma,eyes[1].luma);
 const ux=(right.x-left.x)/d,uy=(right.y-left.y)/d,cx=(left.x+right.x)/2,cy=(left.y+right.y)/2;
 let vx=-uy,vy=ux;if((point(152).x-cx)*vx+(point(152).y-cy)*vy<0){vx=-vx;vy=-vy}
 const skinSamples=[],channels=[[],[],[]],step=Math.max(1,Math.floor(Math.min(w,h)/320));
 for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
  const i=y*w+x,j=i*4,u=(x+.5-cx)*ux+(y+.5-cy)*uy,v=(x+.5-cx)*vx+(y+.5-cy)*vy;
  if(skin[i]<.9||pixels[j+3]<240||Math.abs(u)>d*.46||v<d*.12||v>d*.72)continue;
  const L=luma(pixels[j],pixels[j+1],pixels[j+2]);if(L<8||L>247)continue;
  skinSamples.push(L);for(let c=0;c<3;c++)channels[c].push(pixels[j+c]);
 }
 if(skinSamples.length<24)return result();
 skinSamples.sort((a,b)=>a-b);
 const skin10=quantile(skinSamples,.1),skin50=quantile(skinSamples,.5),skin90=quantile(skinSamples,.9),skinRGB=channels.map(median),ratio=skin50/Math.max(1,eyeL);
 report.eyeLuma=eyeL;report.eyeRGB=eyeRGB;report.eyes=eyes;report.skinLuma={p10:skin10,p50:skin50,p90:skin90};
 if(eyeAgreement<.64){report.reason='disagreeing-eye-light';return result()}
 const strict=stage==='output',casts=eyes.map(e=>castEvidence(e.rgb,strict));
 const yellow=casts.every(c=>c.yellow)&&skinRGB[1]/Math.max(1,skinRGB[2])>1.16;
 // Cosmetic lenses can tint both eye pools. Real illumination must shift
 // actual skin in the same direction as well, relative to those eye whites.
 const skinGreen=skinRGB[1]/Math.max(1,skinRGB[0]),eyeGreen=eyeRGB[1]/Math.max(1,eyeRGB[0]);
 const green=casts.every(c=>c.green)&&skinGreen>.82&&skinGreen/eyeGreen>=.70;
 const chromaAgreement=Math.abs(Math.log(casts[0].gb/casts[1].gb))<.17&&Math.abs(Math.log(casts[0].gr/casts[1].gr))<.17;
 report.colorCast=chromaAgreement&&(yellow||green);
 const severe=eyeL<(strict?95:105)&&eyes.every(e=>e.high<(strict?135:155))&&skin90<(strict?135:155);
 const moderate=eyeL<(strict?142:160)&&eyeL>=95&&ratio>=.74&&ratio<=1.4&&skin90<(strict?165:185)&&skin90/eyeL<1.55&&eyeAgreement>.74;
 report.lowLight=severe||moderate;
 if(!report.lowLight&&!report.colorCast){report.reason='normal-light';return result()}
 // A dark complexion with normal eye whites never enters the exposure path.
 // Bilateral eye evidence, not a target skin colour, controls its strength.
 let gain=1;
 if(report.lowLight){
  const target=severe?Math.min(strict?135:160,eyeL*(strict?1.2:1.6)):Math.min(strict?158:175,eyeL*(strict?1.10:1.22));
  const x=clamp(eyeL/255,.01,.97),t=clamp(target/255,.01,.97);
  gain=clamp(t*(1-x)/(x*(1-t)),1,strict?1.5:2.2);
 }
 let wb=[1,1,1];
 if(report.colorCast){
  const neutral=luma(...eyeRGB),target=[neutral*1.025,neutral,neutral*.985],strength=strict?.60:.74;
  wb=eyeRGB.map((v,c)=>clamp(1+(target[c]/Math.max(1,v)-1)*strength,strict?.90:.84,strict?1.20:1.30));
  const normalization=luma(...eyeRGB.map((v,c)=>v*wb[c]))/Math.max(1,neutral);
  wb=wb.map(v=>clamp(v/normalization,strict?.90:.84,strict?1.20:1.30));
 }
 report.exposureGain=gain;report.whiteBalance=wb;report.confidence=clamp(eyeAgreement*(chromaAgreement?1:.85));
 for(let i=0;i<n;i++){
  const j=i*4;if(pixels[j+3]<248||skin[i]<=.55)continue;
  const originalL=luma(pixels[j],pixels[j+1],pixels[j+2]);
  // Do not lift a dark, uncertain strand merely because a coarse skin model
  // crossed the hairline. The threshold is relative to this actual complexion.
  if(originalL<skin50*.20)continue;
  const mask=smooth(.55,.96,skin[i]),balanced=[pixels[j]*wb[0],pixels[j+1]*wb[1],pixels[j+2]*wb[2]],L=luma(...balanced)/255;
  const tone=gain===1?1:gain/(1+(gain-1)*L);
  let changed=false;
  for(let c=0;c<3;c++){
   const value=Math.round(pixels[j+c]+(clamp(balanced[c]*tone,0,255)-pixels[j+c])*mask);
   out[j+c]=value;if(value!==pixels[j+c])changed=true;
  }
  if(changed)report.changedPixels++;
 }
 report.reason=report.changedPixels?'corrected':'below-visible-strength';
 return result();
}
