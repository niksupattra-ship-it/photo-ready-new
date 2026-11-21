// Finished Thai result placement only. Keep pixel references out of JSON so
// native image data is neither copied nor reduced to an unreliable string length.
const frame=f=>f?[f.x,f.y,f.w,f.h]:null;
const dimensions=surface=>surface?[surface.width??surface.naturalWidth??null,surface.height??surface.naturalHeight??null]:null;

export function governmentResultInsigniaSignature({head,suit,garment,gender,template,asset}={}){
 if(!head||!garment||!asset)return null;
 const key=JSON.stringify([
  head.id,head.jobId,head.hairId,head.portraitMode,head.generatedOutfitTemplate,
  gender,template,suit?.id,suit?.visible,suit?.templatePath,
  garment.id,garment.kind,garment.visible,
  garment.x??0,garment.y??0,garment.scale??1,garment.rotation??0,
  garment.squeezeX??1,garment.squeezeY??1,garment.opacity??1,
  frame(garment.sourceFrame),frame(garment.collarFrame),
  garment.neckWidth??0,garment.neckHeight??0,
  dimensions(asset.original),dimensions(asset.warped),dimensions(asset.mask),
  dimensions(asset.frameSources?.englishNeckClipMask)
 ]);
 // The editor replaces historyPixels after a brush/warp change. selectAsset
 // records that snapshot before measurement, including edits to mutable canvases.
 const pixels=[
  garment.source,garment.mask,garment.warpSource,garment.warpBaseMask,
  garment.eraseRestoreSource,garment.warpRestoreBase,garment.englishNeckClipMask,
  asset.original,asset.warped,asset.mask,asset.frameSources?.englishNeckClipMask,
  asset.historyPixels
 ];
 return {key,pixels};
}

export function sameGovernmentResultInsigniaSignature(a,b){
 return Boolean(a&&b&&a.key===b.key&&a.pixels.length===b.pixels.length&&
  a.pixels.every((value,index)=>value===b.pixels[index]));
}
