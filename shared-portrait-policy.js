// The Natural AI cutout is the sole hair, anatomy and edge authority for both
// finish choices. Older independently generated makeup has no shared base.
export const SHARED_PORTRAIT_BASE_VERSION='natural-base-v1-locked-hair-edges';
export const PORTRAIT_MAKEUP_VERSION='soft-peach-rose-v8-source-eyes';
export function portraitMakeupNeedsUpdate(subject){
 return Boolean(sharedOriginalPortraitSource(subject)&&(subject?.idpromStudioCosmeticsVersion||subject?.studioCosmeticsVersion)&&(subject?.idpromStudioMakeupVersion||subject?.studioMakeupVersion)!==PORTRAIT_MAKEUP_VERSION);
}
export function sharedOriginalPortraitSource(subject){
 if(!['studio-original-ai-v5','studio-original-ai-v5-clear-gathered-v1'].includes(subject?.idpromStudioSkinVersion||subject?.studioSkinVersion)||(subject?.idpromSharedPortraitBaseVersion||subject?.sharedPortraitBaseVersion)!==SHARED_PORTRAIT_BASE_VERSION)return null;
 const source=subject?.idpromStudioSkinBaseSource||subject?.studioSkinBaseSource;
 return typeof source==='string'&&source.length<=32*1024*1024&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source)?source:null;
}
