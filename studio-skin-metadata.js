import {STUDIO_SKIN_WORKFLOW_VERSION} from './studio-skin-treatment.js';
import {originalPortraitAiMetadata} from './original-portrait-ai.js';
import {sharedStudioSkinSource} from './src/shared-studio-skin.js';

const cosmeticStyles=new Set(['makeup','korean-rosy-v1','soft-rosy-v1']);
// These describe processed pixels only. Never put them on the immutable upload.
export function hasCurrentStudioSkin(subject,style='natural'){
 const version=subject?.idpromStudioSkinVersion||subject?.studioSkinVersion;
 if(version!==STUDIO_SKIN_WORKFLOW_VERSION)return false;
 const cosmetics=subject?.idpromStudioCosmeticsVersion||subject?.studioCosmeticsVersion;
 return cosmeticStyles.has(style)?cosmetics===STUDIO_SKIN_WORKFLOW_VERSION+':'+style:style==='natural'&&!cosmetics;
}
export function studioSkinWorkflowMetadata(master,head={}){
 const original=originalPortraitAiMetadata(master,head);if(original.studioSkinVersion)return original;
 const version=master?.idpromStudioSkinVersion||head.studioSkinVersion;
 if(version!==STUDIO_SKIN_WORKFLOW_VERSION)return {};
 const cosmetics=master?.idpromStudioCosmeticsVersion||head.studioCosmeticsVersion;
 const base=sharedStudioSkinSource(master)||sharedStudioSkinSource(head);
 return {studioSkinVersion:version,...([...cosmeticStyles].some(style=>cosmetics===version+':'+style)?{studioCosmeticsVersion:cosmetics}:{}),...(base?{studioSkinBaseSource:base}:{})};
}
