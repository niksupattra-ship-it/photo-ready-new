import {parseStudioSkinEvidence} from './studio-skin-treatment.js';

const EYES=[
 {outer:33,inner:133,ids:[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7]},
 {outer:263,inner:362,ids:[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]}
];
const TARGET=[190,180,185];
const MAX_EYE_SAMPLE_CELLS=8192;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit}return hit}
function brightest(samples){
 if(samples.length<8)return null;
 samples.sort((a,b)=>a[3]-b[3]);
 const lo=Math.floor(samples.length*.65),hi=Math.max(lo+1,Math.ceil(samples.length*.98)),chosen=samples.slice(lo,hi);
 if(chosen.length<3)return null;
 const rgb=[0,0,0];for(const p of chosen)for(let c=0;c<3;c++)rgb[c]+=p[c];
 return {rgb:rgb.map(v=>v/chosen.length),samples:samples.length,selected:chosen.length};
}
function eyeCue(pixels,W,H,face,eye){
 const point=id=>[face[id][0]*W,face[id][1]*H],polygon=eye.ids.map(point),a=point(eye.outer),b=point(eye.inner),dx=b[0]-a[0],dy=b[1]-a[1],span2=dx*dx+dy*dy;
 if(span2<144)return {valid:false,reason:'small-eye',samplingStep:1,analyzedCells:0,maxSampleCells:MAX_EYE_SAMPLE_CELLS};
 const x0=clamp(Math.floor(Math.min(...polygon.map(p=>p[0]))),0,W),x1=clamp(Math.ceil(Math.max(...polygon.map(p=>p[0]))),0,W),y0=clamp(Math.floor(Math.min(...polygon.map(p=>p[1]))),0,H),y1=clamp(Math.ceil(Math.max(...polygon.map(p=>p[1]))),0,H);
 // Sample native pixel centres without creating an analysis image. Very large
 // or malformed eye polygons must not allocate/sort one object per native pixel.
 const boxW=x1-x0,boxH=y1-y0;
 let step=Math.max(1,Math.ceil(Math.sqrt(boxW*boxH/MAX_EYE_SAMPLE_CELLS)));
 while(Math.ceil(boxW/step)*Math.ceil(boxH/step)>MAX_EYE_SAMPLE_CELLS)step++;
 const sampling={samplingStep:step,analyzedCells:0,maxSampleCells:MAX_EYE_SAMPLE_CELLS},result=value=>({...value,...sampling});
 const lobes=[[],[]];
 for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){
  sampling.analyzedCells++;
  const px=x+.5,py=y+.5,u=((px-a[0])*dx+(py-a[1])*dy)/span2;
  const side=u>=.10&&u<=.32?0:u>=.68&&u<=.90?1:-1;
  if(side<0||!inside(px,py,polygon))continue;
  const k=(y*W+x)*4,r=pixels[k],g=pixels[k+1],bb=pixels[k+2],Y=luma(r,g,bb);
  // Iris centres are outside these lobes. Discard clipped catchlights and
  // near-black samples rather than treating either as a physical white cue.
  if(pixels[k+3]<240||Math.max(r,g,bb)>=248||Y<20)continue;
  lobes[side].push([r,g,bb,Y]);
 }
 const sides=lobes.map(brightest);
 if(sides.some(s=>!s))return result({valid:false,reason:'missing-sclera',samples:lobes.map(s=>s.length)});
 const ratios=sides.map(s=>[s.rgb[0]/s.rgb[1],s.rgb[2]/s.rgb[1]]);
 if(ratios.some(r=>r[0]<.72||r[0]>1.55||r[1]<.55||r[1]>1.45))return result({valid:false,reason:'unreliable-sclera-colour'});
 if(ratios[0].some((v,c)=>Math.abs(Math.log(v/ratios[1][c]))>.14))return result({valid:false,reason:'within-eye-colour-disagreement'});
 const rgb=[0,1,2].map(c=>(sides[0].rgb[c]+sides[1].rgb[c])/2),Y=luma(...rgb);
 if(rgb[1]<25||Y<25)return result({valid:false,reason:'insufficient-sclera-exposure'});
 // Do not infer an extreme global cast from already bright but strongly
 // coloured eye whites. The remaining reference-guided AI pass can assess it.
 if(rgb[1]>=155&&Math.max(...rgb)-Math.min(...rgb)>60&&rgb[2]/rgb[1]<.72)return result({valid:false,reason:'unreliable-bright-sclera-colour'});
 return result({valid:true,rgb,luma:Y,samples:sides.map(s=>s.samples),selected:sides.map(s=>s.selected)});
}
function rolloff(value){return value<=240?value:240+15*(1-Math.exp(-(value-240)/15))}

// Estimate the source illumination from bilateral sclera, never from a fixed
// desired skin RGB. Apply one continuous photometric transform to the entire
// visible image so eye/brow/lip boundaries cannot become colour islands.
export function normalizeStudioReferenceIllumination({pixels,width:W,height:H,evidence}={}){
 const e=parseStudioSkinEvidence(evidence);
 if(W!==e.width||H!==e.height||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4)throw Object.assign(Error('ข้อมูลพื้นที่ผิวไม่ตรงกับรูปต้นฉบับ กรุณาลองใหม่'),{status:400,code:'studio_skin_evidence_invalid'});
 const report={version:'studio-reference-illumination-v1',status:'unchanged',reason:null,changedPixels:0,gains:[1,1,1],eyes:[],referenceEye:null,castCorrection:false,exposureCorrection:false,geometryChanged:false};
 report.eyes=EYES.map(eye=>eyeCue(pixels,W,H,e.face,eye));
 if(report.eyes.some(eye=>!eye.valid)){report.reason='unreliable-sclera';return {pixels,changed:false,report}}
 const ratios=report.eyes.map(eye=>[eye.rgb[0]/eye.rgb[1],eye.rgb[2]/eye.rgb[1]]);
 if(ratios[0].some((v,c)=>Math.abs(Math.log(v/ratios[1][c]))>.08)){report.reason='bilateral-colour-disagreement';return {pixels,changed:false,report}}
 // A shadow on only one side must not brighten the already well-exposed side
 // simply because an average of the two eyes is darker.
 const reference=report.eyes[0].luma>=report.eyes[1].luma?0:1,cue=report.eyes[reference].rgb,raw=TARGET.map((v,c)=>v/cue[c]),exposure=raw[1];
 report.referenceEye=reference;
 report.castCorrection=Math.max(Math.abs(Math.log(raw[0]/exposure)),Math.abs(Math.log(raw[2]/exposure)))>.07;
 report.exposureCorrection=exposure>1.12||cue[1]>=225;
 if(!report.castCorrection&&!report.exposureCorrection){report.reason='already-neutral-exposed';return {pixels,changed:false,report}}
 const gains=raw.map(v=>clamp(v,.65,3));report.gains=gains;
 let out=null;
 for(let i=0;i<W*H;i++){
  const k=i*4;if(!pixels[k+3])continue;
  let changed=false;
  for(let c=0;c<3;c++){
   const next=Math.round(clamp(rolloff(pixels[k+c]*gains[c]),0,255));
   if(next!==pixels[k+c]){if(!out)out=new Uint8ClampedArray(pixels);out[k+c]=next;changed=true}
  }
  if(changed)report.changedPixels++;
 }
 report.status=out?'applied':'unchanged';return {pixels:out||pixels,changed:Boolean(out),report};
}
