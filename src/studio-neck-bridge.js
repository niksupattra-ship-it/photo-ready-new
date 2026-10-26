import {decodedStudioImage} from './studio-image-cache.js';
import {headPose} from './hair-preview-fit.js';

export const STUDIO_NECK_BRIDGE_VERSION='neck-fit-v1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const finite=Number.isFinite;
const colour=(r,g,b)=>({y:.299*r+.587*g+.114*b,cb:-.168736*r-.331264*g+.5*b,cr:.5*r-.418688*g-.081312*b});
function interpolate(rows,y){
 if(y<=rows[0].y)return rows[0];if(y>=rows[rows.length-1].y)return rows[rows.length-1];
 let lo=0,hi=rows.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(rows[mid].y>y)hi=mid;else lo=mid}
 const a=rows[lo],b=rows[hi],t=(y-a.y)/(b.y-a.y);
 return {y,left:a.left+(b.left-a.left)*t,right:a.right+(b.right-a.right)*t};
}
function skinMatcher(reference){
 if(!reference||!['y','cb','cr'].every(k=>finite(reference[k]))||reference.y<20||Math.hypot(reference.cb,reference.cr)<5)return null;
 return (pixels,j)=>{if(pixels[j+3]<96)return false;const c=colour(pixels[j],pixels[j+1],pixels[j+2]);return c.y>Math.max(12,reference.y*.52)&&c.y<Math.min(255,reference.y*1.5+12)&&Math.hypot(c.cb-reference.cb,c.cr-reference.cr)<23};
}
function closingRow(garment){
 const {pixels,width,height,opening}=garment||{};
 if(pixels?.length!==width*height*4||!Array.isArray(opening)||opening.length<3)return null;
 const rows=opening.filter(r=>[r.y,r.left,r.right].every(finite)&&r.right>r.left).sort((a,b)=>a.y-b.y);if(rows.length<3)return null;
 const last=rows[rows.length-1],cx=median(rows.slice(-5).map(r=>(r.left+r.right)/2));
 const x0=Math.max(0,Math.floor(Math.min(last.left,cx-width*.02))),x1=Math.min(width-1,Math.ceil(Math.max(last.right,cx+width*.02)));
 let count=0;
 for(let y=Math.max(0,Math.floor(last.y));y<Math.min(height,last.y+width*.20);y++){
  let solid=true;for(let x=x0;x<=x1;x++)if(pixels[(y*width+x)*4+3]<160){solid=false;break}
  if(solid){if(++count>=3)return {x:cx,y:y-2}}else count=0;
 }
 return null;
}

// All planning uses bounded pixels. Coordinates remain in the portrait's
// sample space; the renderer below reads the original full-resolution neck.
export function planStudioNeckBridge({portrait,neckProfile,garment,headToUniform}){
 const {pixels,width,height}=portrait||{};
 if(pixels?.length!==width*height*4||width<2||height<2||width>1024||height>1024||!Array.isArray(neckProfile?.rows)||neckProfile.rows.length<3||!Array.isArray(headToUniform)||headToUniform.length!==6||!headToUniform.every(finite))return null;
 const {chin,faceWidth:fw,faceHeight:fh,reference}=neckProfile;
 if(!chin||![chin.x,chin.y,fw,fh].every(finite)||fw<12||fh<12)return null;
 const isSkin=skinMatcher(reference),close=closingRow(garment);if(!isSkin||!close)return null;
 const [a,b,c,d,e,f]=headToUniform,det=a*d-b*c;if(det<=0)return null;
 const destination={x:(d*(close.x-e)-c*(close.y-f))/det,y:(-b*(close.x-e)+a*(close.y-f))/det};
 const guard=chin.y+fh*.055;
 const rows=neckProfile.rows.filter(r=>[r.y,r.left,r.right].every(finite)&&r.right>r.left&&r.y>=guard).sort((p,q)=>p.y-q.y);
 const upper=rows.filter(r=>r.y<=chin.y+fh*.24);if(upper.length<3)return null;
 const upperWidth=clamp(median(upper.map(r=>r.right-r.left)),fw*.28,fw*.75),center=median(upper.map(r=>(r.left+r.right)/2));
 if(!finite(destination.y)||destination.y<=guard+fh*.08||destination.y>height+fh*1.5||Math.abs(destination.x-center)>upperWidth*.45)return null;
 const connected=[];let misses=0;
 for(let y=Math.max(0,Math.ceil(guard));y<height;y++){
  let seed=null;for(let dx=0;dx<=Math.max(1,fw*.06)&&seed===null;dx++)for(const sign of [1,-1]){const x=Math.round(center+dx*sign);if(x>=0&&x<width&&isSkin(pixels,(y*width+x)*4)){seed=x;break}}
  if(seed===null){if(connected.length&&++misses>fh*.08)break;continue}misses=0;
  const edge=sign=>{let last=seed,miss=0;for(let k=1;k<width;k++){const x=seed+k*sign;if(x<0||x>=width)break;if(isSkin(pixels,(y*width+x)*4)){last=x;miss=0}else if(++miss>Math.max(1,Math.round(fw*.008)))break}return last};
  const left=edge(-1),right=edge(1);if(right-left>=upperWidth*.30)connected.push({y,left,right});
 }
 const donors=connected.filter(r=>r.right-r.left>=upperWidth*.78);
 if(donors.length<4)return null;
 const donorTop=Math.max(guard,upper[0].y),donorBottom=donors[donors.length-1].y-1;
 if(donorBottom-donorTop<Math.max(4,fh*.04))return null;
 const targetBottom=destination.y+Math.max(1.5,fh*.008),needsLength=targetBottom>donorBottom+Math.max(2,fh*.02);
 const halfAt=y=>upperWidth*.5*(1+.10*smooth((y-chin.y-fh*.16)/(fh*.4)));
 const centerAt=y=>center+clamp(destination.x-center,-upperWidth*.12,upperWidth*.12)*smooth((y-donorBottom)/Math.max(1,targetBottom-donorBottom));
 const flared=connected.some(r=>r.y>guard+fh*.025&&(r.left<center-halfAt(r.y)-2||r.right>center+halfAt(r.y)+2));
 if(!needsLength&&!flared)return null;
 const start=Math.max(guard,donorTop-1),feather=Math.max(2,fh*.035);
 const profileRows=[];
 for(let y=rows[0].y;y<=targetBottom;y+=Math.max(1,fh*.018)){const cx=centerAt(y),half=halfAt(y);profileRows.push({y,left:cx-half,right:cx+half})}
 if(profileRows.length)profileRows.push({y:targetBottom,left:centerAt(targetBottom)-halfAt(targetBottom),right:centerAt(targetBottom)+halfAt(targetBottom)});
 return {guard,start,donorTop,donorBottom,targetBottom,upperWidth,center,connected,donors,halfAt,centerAt,feather,needsLength,flared,isSkin,profile:{...neckProfile,rows:profileRows,confidence:neckProfile.confidence||1,complete:true}};
}

const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
async function decoded(value){return typeof value==='string'?decodedStudioImage(value):value}
export async function createStudioNeckBridge({head,headSource,headMask=null,portrait,neckProfile,garment,headToUniform}){
 const empty={layer:null,mask:null,profile:null};
 const plan=planStudioNeckBridge({portrait,neckProfile,garment,headToUniform});if(!plan)return empty;
 const source=await decoded(headSource||head?.source),nw=source?.naturalWidth||source?.width,nh=source?.naturalHeight||source?.height;
 if(!head||![nw,nh].every(n=>Number.isInteger(n)&&n>1&&n<=8192)||nw*nh>8_000_000)return empty;
 const hf=head.sourceFrame||{x:0,y:0,w:900,h:1200};if(!['x','y','w','h'].every(k=>finite(hf[k]))||hf.w<=0||hf.h<=0)return empty;
 const {width:pw,height:ph}=portrait,sx=nw/pw,sy=nh/ph;
 const minX=Math.max(0,Math.floor((plan.center-plan.upperWidth*.60-2)*sx)),maxX=Math.min(nw,Math.ceil((plan.center+plan.upperWidth*.60+2)*sx));
 const minY=Math.max(0,Math.floor(plan.start*sy)),maxY=Math.ceil(plan.targetBottom*sy),cw=maxX-minX,ch=maxY-minY;
 if(cw<2||ch<2||cw>8192||ch>8192)return empty;
 const renderH=Math.min(ch,Math.max(2,Math.floor(650_000/cw)));
 const native=make(nw,nh),nc=native.getContext('2d',{willReadFrequently:true});nc.drawImage(source,0,0,nw,nh);const original=nc.getImageData(0,0,nw,nh).data;
 const bridge=make(cw,renderH),bc=bridge.getContext('2d'),out=bc.createImageData(cw,renderH),data=out.data;
 const sample=(x,y)=>{
  const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;let alpha=0,r=0,g=0,b=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const px=ix+xx,py=iy+yy;if(px<0||px>=nw||py<0||py>=nh)continue;const j=(py*nw+px)*4;if(!plan.isSkin(original,j))continue;const part=original[j+3]*(xx?dx:1-dx)*(yy?dy:1-dy);alpha+=part;r+=original[j]*part;g+=original[j+1]*part;b+=original[j+2]*part}
  return {r:alpha?r/alpha:0,g:alpha?g/alpha:0,b:alpha?b/alpha:0,a:alpha};
 };
 for(let y=0;y<renderH;y++){
  const nativeY=minY+(y+.5)*ch/renderH-.5,py=(nativeY+.5)/sy-.5,half=plan.halfAt(py),cx=plan.centerAt(py);
  const mix=smooth((py-plan.start)/plan.feather),stretched=plan.donorTop+(py-plan.donorTop)*(plan.donorBottom-plan.donorTop)/Math.max(1,plan.targetBottom-plan.donorTop),sourceY=clamp(py+(stretched-py)*mix,plan.donorTop,plan.donorBottom);
  const row=interpolate(plan.connected,sourceY),sourceCenter=clamp((row.left+row.right)/2,plan.center-plan.upperWidth*.08,plan.center+plan.upperWidth*.08),sourceHalf=Math.max(1,Math.min((row.right-row.left)/2-1,plan.upperWidth*.54));
  for(let x=0;x<cw;x++){
   const px=(minX+x+.5)/sx-.5,relative=(px-cx)/half;if(Math.abs(relative)>=1)continue;
   const oldX=minX+x,oldY=Math.floor(nativeY),old=oldY<nh?(oldY*nw+oldX)*4:-1;
   // Existing non-skin pixels can be hair; never paint a bridge over them.
   if(old>=0&&original[old+3]>96&&!plan.isSkin(original,old))continue;
   const value=sample((sourceCenter+relative*sourceHalf)*sx,sourceY*sy),j=(y*cw+x)*4;
   const edge=smooth((half-Math.abs(px-cx))/Math.max(1,1.4/sx)),top=smooth((py-plan.start)/plan.feather);
   data[j]=value.r;data[j+1]=value.g;data[j+2]=value.b;data[j+3]=value.a*edge*top;
  }
 }
 bc.putImageData(out,0,0);
 let mask=null;
 if(plan.flared){
  const candidate=make(nw,nh),mc=candidate.getContext('2d',{willReadFrequently:true});
  if(headMask)mc.drawImage(await decoded(headMask),0,0,nw,nh);else{mc.fillStyle='#fff';mc.fillRect(0,0,nw,nh)}
  const image=mc.getImageData(0,0,nw,nh),md=image.data;let changed=false;
  const firstY=Math.max(0,Math.ceil(plan.guard*sy)),lastY=Math.min(nh-1,Math.ceil((plan.connected[plan.connected.length-1].y+1)*sy)-1);
  for(let y=firstY;y<=lastY;y++){
   const py=(y+.5)/sy-.5,row=interpolate(plan.connected,py),half=plan.halfAt(py),vertical=smooth((py-plan.guard)/plan.feather);
   const left=Math.max(0,Math.floor((row.left-.5)*sx)),right=Math.min(nw-1,Math.ceil((row.right+.5)*sx)-1);
   for(let x=left;x<=right;x++){
    const j=(y*nw+x)*4;if(!plan.isSkin(original,j))continue;
    const distance=Math.abs((x+.5)/sx-.5-plan.center)-half;if(distance<=0)continue;
    const alpha=Math.round(255*(1-smooth(distance/Math.max(1,1.5/sx))*vertical));
    if(alpha<md[j+3]){md[j+3]=alpha;changed=true}
   }
  }
  if(changed){mc.putImageData(image,0,0);mask=candidate}
 }
 return {layer:{name:'คอ',kind:'neck-fit',source:bridge,sourceFrame:{x:hf.x+minX/nw*hf.w,y:hf.y+minY/nh*hf.h,w:cw/nw*hf.w,h:ch/nh*hf.h},...headPose(head),opacity:head.opacity??1,visible:head.visible!==false,locked:false,hairHeadId:head.id,hairHeadPose:headPose(head),neckFitVersion:STUDIO_NECK_BRIDGE_VERSION},mask,profile:plan.profile};
}
