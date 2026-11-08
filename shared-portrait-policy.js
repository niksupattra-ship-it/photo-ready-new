// The Natural AI cutout is the sole hair, anatomy and edge authority for both
// finish choices. Older independently generated makeup has no shared base.
export const SHARED_PORTRAIT_BASE_VERSION='natural-base-v1-locked-hair-edges';
export function sharedOriginalPortraitSource(subject){
 if((subject?.idpromStudioSkinVersion||subject?.studioSkinVersion)!=='studio-original-ai-v5'||(subject?.idpromSharedPortraitBaseVersion||subject?.sharedPortraitBaseVersion)!==SHARED_PORTRAIT_BASE_VERSION)return null;
 const source=subject?.idpromStudioSkinBaseSource||subject?.studioSkinBaseSource;
 return typeof source==='string'&&source.length<=32*1024*1024&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source)?source:null;
}
