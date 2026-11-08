import {STUDIO_SKIN_SURFACE_VERSION} from './studio-skin-surface.js';
import {STUDIO_SKIN_WORKFLOW_VERSION,isSharedStudioSkinVersion} from './studio-skin-treatment.js';
import {sharedStudioSkinSource} from './src/shared-studio-skin.js';

const cosmeticStyles=new Set(['makeup','korean-rosy-v1','soft-rosy-v1']);
// These describe processed pixels only. Never put them on the immutable upload.
export function hasCompletedStudioSkin(subject,style='natural'){
 const version=subject?.idpromStudioSkinVersion||subject?.studioSkinVersion;
 if(!isSharedStudioSkinVersion(version))return false;
 const cosmetics=subject?.idpromStudioCosmeticsVersion||subject?.studioCosmeticsVersion;
 return cosmeticStyles.has(style)?cosmetics===version+':'+style:style==='natural'&&!cosmetics;
}
export function hasCurrentStudioSkin(subject,style='natural'){
 return (subject?.idpromStudioSkinVersion||subject?.studioSkinVersion)===STUDIO_SKIN_WORKFLOW_VERSION&&hasCompletedStudioSkin(subject,style);
}
export function studioSkinWorkflowMetadata(master,head={}){
 const version=master?.idpromStudioSkinVersion||head.studioSkinVersion;
 if(!isSharedStudioSkinVersion(version))return {};
 const cosmetics=master?.idpromStudioCosmeticsVersion||head.studioCosmeticsVersion;
 const base=sharedStudioSkinSource(master)||(head.studioSkinVersion===version?sharedStudioSkinSource(head):null);
 const surface=master?.idpromStudioSkinSurfaceVersion||(head.studioSkinVersion===version?head.studioSkinSurfaceVersion:null);
 return {studioSkinVersion:version,...(surface===STUDIO_SKIN_SURFACE_VERSION?{studioSkinSurfaceVersion:surface}:{}),...([...cosmeticStyles].some(style=>cosmetics===version+':'+style)?{studioCosmeticsVersion:cosmetics}:{}),...(base?{studioSkinBaseSource:base}:{})};
}
