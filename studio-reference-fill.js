import {normalizeStudioReferenceIllumination} from './studio-reference-illumination.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// A single smooth photometric field across the image. No skin/feature stencil
// is used here; the AI receives the complete source without regional retouch.
export function normalizeStudioReferenceFill(input){
 const normalized=normalizeStudioReferenceIllumination(input),{pixels,width:W,height:H,evidence}=input,e=typeof evidence==='string'?JSON.parse(evidence):evidence,eyes=normalized.report.eyes;
 const report={...normalized.report,version:'studio-reference-fill-v2',directionalFill:false,shadowGain:1};
 if(eyes.some(v=>!v.valid)||report.reason==='bilateral-colour-disagreement')return {...normalized,report};
 const bright=eyes[0].luma>=eyes[1].luma?0:1,dark=1-bright,ratio=eyes[bright].luma/eyes[dark].luma;
 if(ratio<1.35||ratio>3)return {...normalized,report};
 const centers=[[33,133],[263,362]].map(ids=>({x:(e.face[ids[0]][0]+e.face[ids[1]][0])*.5*W,y:(e.face[ids[0]][1]+e.face[ids[1]][1])*.5*H})),a=centers[dark],b=centers[bright],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
 if(len<144)return {...normalized,report};
 const gain=Math.min(1.8,ratio),source=normalized.pixels,out=new Uint8ClampedArray(source);let changed=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;if(!pixels[k+3])continue;let t=clamp(((x+.5-a.x)*dx+(y+.5-a.y)*dy)/len,0,1);t=t*t*(3-2*t);const fill=Math.exp(Math.log(gain)*(1-t));let diff=false;for(let c=0;c<3;c++){let v=source[k+c]*fill;if(v>240)v=240+15*(1-Math.exp(-(v-240)/15));const next=Math.round(clamp(v,0,255));if(next!==source[k+c]){out[k+c]=next;diff=true;}}if(diff)changed++;}
 report.directionalFill=true;report.shadowGain=gain;report.status=changed?'applied':normalized.report.status;report.changedPixels=Math.max(changed,normalized.report.changedPixels);return {pixels:out,changed:normalized.changed||changed>0,report};
}
