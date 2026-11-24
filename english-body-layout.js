import {measureHairCrown,fitWholeHeadGuide,usesNestedWholeHead,usesLoweredWholeHead,LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION} from './thai-whole-head-guide.js';
import {measureGarmentCollarContext} from './thai-collar-context.js';
import {garmentNeckBalance} from './garment-neck-balance.js';
import {ENGLISH_HEAD_SCALE} from './english-body-portrait.js';
import sharp from 'sharp';
import {measureUniformAnchors} from './src/portrait-uniform-fit.js';
// v9 is opt-in for English template portraits. Legacy generations retain their pixels.
export const ENGLISH_TEMPLATE_PROPORTION_PROFILE=Object.freeze({
 identityHeadScale:.95,headWidthToShoulder:.44,headHeightToShoulder:.66,
 chinToCollar:.012,neckToShoulder:.26,chestToShoulder:.46
});
// English men's tailored outfits need a smaller skull relative to the fixed
// garment shoulder span. This is conditioning geometry only, not a face warp.
// The legacy female v9 proportion profile above remains unchanged.
export const ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE=Object.freeze({
 identityHeadScale:.88,headWidthToShoulder:.35,headHeightToShoulder:.55,
 chinToCollar:.020,neckToShoulder:.255,chestToShoulder:.46
});
// The new English female portrait uses EXACTLY the English male head/neck/
// shoulder geometry. This alias cannot change the male or legacy female v9.
export const ENGLISH_FEMALE_MATCHED_PROPORTION_PROFILE=ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE;
// English female v2: the male-matched v1 head was too small against the
// unchanged full-width business suit. Increase only the conditioning head
// envelope to ~39% of the fixed outfit shoulder span. Keep existing v1,
// older female v9 and all male guides reproducible for saved/queued jobs.
export const ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE=Object.freeze({
 identityHeadScale:.95,headWidthToShoulder:.41,headHeightToShoulder:.55,
 chinToCollar:.020,neckToShoulder:.255,chestToShoulder:.46
});
// Conditioning reference only. Never paste this mannequin into delivered pixels.
export async function createEnglishBodyLayout(outfit,{headScale=ENGLISH_HEAD_SCALE,identity=null,canvasWidth=768,profile=null,returnNativeForeground=false,fixedIdentityEnvelope=false,stableGarmentFrame=false,neckHeadRatio=null,garmentBalancedNeck=false,poseOnlyHead=false,rearHairGuide=null,headOnlyScale=1,collarContext=null,wholeHeadGuide=null}={}){
 if(!Number.isFinite(headOnlyScale)||headOnlyScale<.75||headOnlyScale>1)throw Error('Invalid whole-head-only scale.');
 if(neckHeadRatio!==null&&(!Number.isFinite(neckHeadRatio)||neckHeadRatio<.10||neckHeadRatio>.25))throw Error('Invalid neck guide gap.');
 if(![768,1824].includes(canvasWidth))throw Error('Invalid layout canvas size.');
 if(!Number.isFinite(headScale)||headScale<=0||headScale>1)throw Error('Invalid English head reference scale.');
 const {data,info}=await sharp(outfit).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const uniform=measureUniformAnchors(data,info.width,info.height),span=uniform.shoulderWidth;
 const referenceHeadWidth=span*(profile?.headWidthToShoulder??.40);
 const referenceHeadHeight=span*(profile?.headHeightToShoulder??.54);
 const face=identity?await sharp(identity).metadata():null,faceAspect=face?.width&&face?.height?face.height/face.width:null;
 // The previous min(..., referenceHeadHeight/faceAspect) silently capped the
 // English face width, so raising headScale alone did not visibly enlarge it.
 // v9 keeps the original crop aspect ratio and sizes the face by shoulder span.
 let headWidth=profile?.headWidthToShoulder?referenceHeadWidth*headScale:Math.min(referenceHeadWidth*headScale,faceAspect?referenceHeadHeight/(faceAspect+.12):Infinity);
 // Thai v9 only: source crop aspect must not change the guide's physical
 // skull height or alter camera framing. Older English/Thai compositions
 // retain their exact original geometry.
 let headHeight=fixedIdentityEnvelope?referenceHeadHeight*headScale:faceAspect?headWidth*(faceAspect+.12):referenceHeadHeight*headScale;
 const frameNeckLength=span*(profile?.chinToCollar??.045),neckLength=garmentBalancedNeck?garmentNeckBalance(data,info.width,info.height,uniform,headHeight).gap:neckHeadRatio===null?frameNeckLength:Math.max(span*.06,Math.min(span*.09,headHeight*neckHeadRatio)),neckWidth=span*(profile?.neckToShoulder??.22);
 let chinY=uniform.collarTopY-neckLength;let headTop=chinY-headHeight;
 // Keep the original body/canvas transform; change only the head anchor and neck.
 const frameChinY=uniform.collarTopY-frameNeckLength;
 const left=Math.min(uniform.bounds.l,uniform.centerX-referenceHeadWidth/2),right=Math.max(uniform.bounds.r+1,uniform.centerX+referenceHeadWidth/2);
 // Reserve headroom for the larger v9 skull and the selected hairstyle without
 // stretching the garment; older English guides preserve their original frame.
 // V11 only: keep the entire native outfit at the SAME canvas scale for every
 // measured face shape. Reserving stable headroom relative to this template
 // prevents a long face from silently shrinking the suit or moving shoulders.
 // Enough room is reserved for the largest supported natural face crop.
 const top=stableGarmentFrame
  ?Math.min(uniform.collarTopY-span*.875,uniform.bounds.t)
  :Math.min(frameChinY-(profile?.headWidthToShoulder?Math.max(referenceHeadHeight,headHeight+span*.055):referenceHeadHeight),uniform.bounds.t);
 const bottom=uniform.bounds.b+1;
 const W=canvasWidth,H=canvasWidth*4/3,pad=canvasWidth/32,scale=Math.min((W-2*pad)/(right-left),(H-2*pad)/(bottom-top));
 const x=(W-(right-left)*scale)/2-left*scale,y=H-pad-bottom*scale;
 // Reduce only the displayed head AFTER the native garment/camera transform
 // and collar anchor are fixed. Never reframe the coat because the head shrank.
 headWidth*=headOnlyScale;headHeight*=headOnlyScale;
 let measuredWholeHead=null,collarHeadHeight=null;
 if(wholeHeadGuide){
  let hair=null;if(rearHairGuide){const raw=await sharp(rearHairGuide.buffer).ensureAlpha().raw().toBuffer();hair=measureHairCrown(raw,rearHairGuide.width,rearHairGuide.height,rearHairGuide)}
  const before={faceWidth:headWidth,faceHeight:headHeight,shoulderWidth:span,hair};
  collarHeadHeight=fitWholeHeadGuide({...before,version:LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION})?.faceHeight??null;
  measuredWholeHead=fitWholeHeadGuide({...before,version:wholeHeadGuide.version});
  if(measuredWholeHead){headWidth=measuredWholeHead.faceWidth;headHeight=measuredWholeHead.faceHeight;wholeHeadGuide.onMeasured?.(measuredWholeHead)}
 }

 const measuredCollar=collarContext?measureGarmentCollarContext(uniform,collarHeadHeight??headHeight,collarContext.template):null;
 if(measuredCollar){
  // New female guide only: move the complete head toward the existing collar.
  // Keep the garment/camera, facial aspect and all previous version anchors.
  if(usesLoweredWholeHead(wholeHeadGuide?.version)){const lower=Math.max(0,Math.min(span*.005,measuredCollar.gap-span*.003));measuredCollar.chinY+=lower;measuredCollar.gap-=lower;}
  chinY=measuredCollar.chinY;collarContext.onMeasured?.(measuredCollar)}
 const supportingNeckLength=measuredCollar?.gap??neckLength;
 headTop=chinY-headHeight;
 const cx=x+uniform.centerX*scale,headY=y+headTop*scale,chin=y+chinY*scale,collar=y+uniform.collarTopY*scale;
 // The cervical reference ends at the collar/shoulder junction. A deep V
 // exposes chest below it and must not become a longer reference neck.
 const skinBottom=y+Math.max(uniform.socketY,uniform.collarTopY+span*.20)*scale;
 const neckBase=collar+span*.035*scale;
 const skinWidth=span*(profile?.chestToShoulder??.40)*scale,neck=neckWidth*scale,upperNeck=faceAspect?headWidth*.60*scale:neck;
 const neckShape=faceAspect?`<path d="M ${cx-upperNeck/2} ${chin-supportingNeckLength*scale*.35} L ${cx-neck/2} ${neckBase} L ${cx+neck/2} ${neckBase} L ${cx+upperNeck/2} ${chin-supportingNeckLength*scale*.35} Z" fill="#929ba8"/>`:`<rect x="${cx-neck/2}" y="${chin-supportingNeckLength*scale*.35}" width="${neck}" height="${neckBase-chin+neckLength*scale*.35}" fill="#929ba8"/>`;
 const rangeGuide=usesNestedWholeHead(wholeHeadGuide?.version)&&measuredWholeHead;
 const outerHead=rangeGuide?`<ellipse cx="${cx}" cy="${chin-rangeGuide.height*scale/2}" rx="${rangeGuide.width*scale/2}" ry="${rangeGuide.height*scale/2}" fill="#929ba8"/>`:'';
 const shape=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#929ba8"/><stop offset="1" stop-color="#bec5ce"/></linearGradient></defs><rect width="100%" height="100%" fill="#e5e8ed"/><path d="M ${cx-neck/2} ${neckBase} Q ${cx-neck/2} ${skinBottom-neck*.25} ${cx-skinWidth/2} ${skinBottom} L ${cx+skinWidth/2} ${skinBottom} Q ${cx+neck/2} ${skinBottom-neck*.25} ${cx+neck/2} ${neckBase} Z" fill="url(#skin)"/>${neckShape}${outerHead}<ellipse cx="${cx}" cy="${headY+headHeight*scale/2}" rx="${headWidth*scale/2}" ry="${headHeight*scale/2}" fill="#aab2bd"/><g fill="#697585" stroke="#697585" stroke-width="${headWidth*scale*.012}" stroke-linecap="round"><circle cx="${cx-headWidth*scale*.19}" cy="${headY+headHeight*scale*.45}" r="${headWidth*scale*.017}"/><circle cx="${cx+headWidth*scale*.19}" cy="${headY+headHeight*scale*.45}" r="${headWidth*scale*.017}"/><path d="M ${cx} ${headY+headHeight*scale*.52} L ${cx} ${headY+headHeight*scale*.64}" fill="none"/></g></svg>`);
 const garment=await sharp(outfit).resize({width:Math.max(1,Math.round(info.width*scale)),height:Math.max(1,Math.round(info.height*scale))}).png().toBuffer();
 // Clip only transparent template margins outside the guide board. The measured
 // opaque garment bounds and all buttons/pockets remain inside the frame.
 const gx=Math.round(x),gy=Math.round(y),meta=await sharp(garment).metadata();
 const il=Math.max(0,-gx),it=Math.max(0,-gy),iw=Math.min(meta.width-il,W-Math.max(0,gx)),ih=Math.min(meta.height-it,H-Math.max(0,gy));
 if(iw<1||ih<1)throw Error('Could not prepare the outfit layout reference.');
 const visible=await sharp(garment).extract({left:il,top:it,width:iw,height:ih}).png().toBuffer();
 const overlays=[];
 if(faceAspect&&!poseOnlyHead){
  // Fixed Thai envelope: fit the original face crop inside the target head
  // rectangle with one uniform scaling factor. A wide, tall or close selfie
  // NEVER stretches the person's face or changes the outer head envelope.
  const maxWidth=Math.max(1,Math.round(headWidth*scale)),maxHeight=Math.max(1,Math.round(headHeight*scale));
  const fit=fixedIdentityEnvelope
   ?await sharp(identity).resize({width:maxWidth,height:maxHeight,fit:'inside'}).png().toBuffer()
   :null;
  const dims=fit?await sharp(fit).metadata():null;
  const width=fit?dims.width:maxWidth,height=fit?dims.height:Math.max(1,Math.round(maxWidth*faceAspect));
  const mask=await sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${width*.18}" fill="white"/></svg>`)).blur(Math.max(.3,width*.008)).png().toBuffer();
  const photo=await sharp(fit||identity).resize(width,height).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  overlays.push({input:photo,left:Math.max(0,Math.round(cx-width/2)),top:Math.max(0,Math.round(chin-height))});
 }
 // Conditioning only: exact selected hair goes BEHIND the opaque garment.
 if(rearHairGuide){
  const q=Math.min(headWidth/rearHairGuide.faceWidth,headHeight/rearHairGuide.faceHeight)*scale;
  const hw=Math.max(1,Math.round(rearHairGuide.width*q)),hh=Math.max(1,Math.round(rearHairGuide.height*q));
  const hx=Math.round(cx-rearHairGuide.centerX*q),hy=Math.round(chin-rearHairGuide.chinY*q);
  const left=Math.max(0,-hx),top=Math.max(0,-hy),width=Math.min(hw-left,W-Math.max(0,hx)),height=Math.min(hh-top,H-Math.max(0,hy));
  if(width>0&&height>0){let hairView=await sharp(rearHairGuide.buffer).resize(hw,hh).extract({left,top,width,height}).png().toBuffer();
   if(rangeGuide){
    // Bound only upper hair in the conditioning board, never the delivered
    // customer pixels. The uncut hairstyle remains a separate AI reference.
    const ox=Math.max(0,hx),oy=Math.max(0,hy),rx=rangeGuide.width*scale/2,ry=rangeGuide.height*scale/2;
    const mask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${cx-ox}" cy="${chin-ry-oy}" rx="${rx}" ry="${ry}" fill="white"/><rect x="${cx-rx-ox}" y="${chin-ry-oy}" width="${rx*2}" height="${ry}" fill="white"/><path d="M ${cx-rx-ox} ${chin-oy} L 0 ${chin+span*.08*scale-oy} L 0 ${height} L ${width} ${height} L ${width} ${chin+span*.08*scale-oy} L ${cx+rx-ox} ${chin-oy} Z" fill="white"/></svg>`);
    hairView=await sharp(hairView).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
   }
   overlays.push({input:hairView,left:Math.max(0,hx),top:Math.max(0,hy)});}
  // The newly generated supporting neck is also in front of rear hair.
  overlays.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${neckShape}</svg>`),left:0,top:0});
 }
 overlays.push({input:visible,left:Math.max(0,gx),top:Math.max(0,gy)});
 const composition=await sharp(shape).composite(overlays).png().toBuffer();
 if(!returnNativeForeground)return composition;
 // Thai-only optional output. Use the EXACT same garment crop, scale and
 // translation as the AI's Image 1 guide, without changing English output.
 const nativeForeground=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([{input:visible,left:Math.max(0,gx),top:Math.max(0,gy)}]).png().toBuffer();
 return {composition,nativeForeground,shoulderTopY:y+uniform.bounds.t*scale,collarTopY:collar,centerX:cx,shoulderSpan:span*scale,...(measuredCollar?{measuredCollar}: {}),...(measuredWholeHead?{measuredWholeHead}: {})};

}
