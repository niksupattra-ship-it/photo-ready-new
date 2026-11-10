// Fit the visible person, not the transparent padding around the PNG.
// One common X/Y scale preserves the AI's head-to-body proportions.
export function fitEnglishPortraitFrame({width,height,bounds,W=900,H=1200}){
 if(![width,height,W,H,bounds?.w,bounds?.h].every(n=>Number.isFinite(n)&&n>0)||!['l','t','r','b'].every(k=>Number.isFinite(bounds[k])))throw Error('Cannot measure portrait placement');
 const headroom=H*.035;
 const baseScale=Math.max(W/bounds.w,(H-headroom)/bounds.h);
 const bleed=Math.max(2,Math.ceil(baseScale*1.5));
 const scale=Math.max((W+bleed*2)/bounds.w,(H-headroom+bleed)/bounds.h);
 const hX=(W-bounds.w*scale)/2-bounds.l*scale;
 // Cover the portrait width and lower edge while protecting the hair crown.
 // Any necessary crop is on the torso, with no independent face stretching.
 const hY=headroom-bounds.t*scale;
 return {W,H,hX,hY,scale,headW:width,headH:height};
}
