// Finished Thai result placement only. Keep pixel references out of JSON so
// native image data is neither copied nor reduced to an unreliable string length.
const frame=f=>f?[f.x,f.y,f.w,f.h]:null;
const dimensions=surface=>surface?[surface.width??surface.naturalWidth??null,surface.height??surface.naturalHeight??null]:null;

export function governmentResultInsigniaSignature({head,suit,garment,gender,template,asset,details=[]}={}){
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
  dimensions(asset.frameSources?.englishNeckClipMask),
  details.map(({layer:l})=>[l.id,l.visible,l.x??0,l.y??0,l.scale??1,l.rotation??0,l.squeezeX??1,l.squeezeY??1,l.opacity??1,frame(l.sourceFrame)])
 ]);
 // The editor replaces historyPixels after a brush/warp change. selectAsset
 // records that snapshot before measurement, including edits to mutable canvases.
 const pixels=[
  garment.source,garment.mask,garment.warpSource,garment.warpBaseMask,
  garment.eraseRestoreSource,garment.warpRestoreBase,garment.englishNeckClipMask,
  asset.original,asset.warped,asset.mask,asset.frameSources?.englishNeckClipMask,
  asset.historyPixels,
  ...details.flatMap(({layer:l,asset:a})=>[l.source,l.mask,l.warpSource,l.warpBaseMask,l.eraseRestoreSource,a?.original,a?.warped,a?.mask,a?.historyPixels])
 ];
 return {key,pixels};
}

export function sameGovernmentResultInsigniaSignature(a,b){
 return Boolean(a&&b&&a.key===b.key&&a.pixels.length===b.pixels.length&&
  a.pixels.every((value,index)=>value===b.pixels[index]));
}
