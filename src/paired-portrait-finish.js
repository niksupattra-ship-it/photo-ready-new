import {isStudioSkinBaseSource} from './shared-studio-skin.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {PORTRAIT_MAKEUP_VERSION} from '../shared-portrait-policy.js';
export const hasPairedPortraitFinish=head=>isStudioSkinBaseSource(head?.studioSkinBaseSource)&&isStudioSkinBaseSource(head?.aiMakeupSource);
// These are the two completed photographs from the same generation, never a
// request for a new hairstyle, portrait or locally painted makeup overlay.
export function pairedPortraitFinish(head,style){
 if(!hasPairedPortraitFinish(head))throw Error('ภาพแต่งหน้าและไม่แต่งหน้ายังไม่พร้อม');
 const finish=style==='natural'?'natural':'makeup';
 const next={...head,source:finish==='natural'?head.studioSkinBaseSource:head.aiMakeupSource,femaleEyeStyle:finish,initialFemaleEyeStyle:finish,mask:null,warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,makeupStyles:{},makeupBaseSource:null,makeupCleanBaseSource:null,makeupFullSource:null};
 next.processedOriginalSource=next.source;
 if(finish==='natural'){delete next.studioCosmeticsVersion;delete next.studioMakeupVersion;next.naturalStudioSkinVersion=NATURAL_STUDIO_SKIN_VERSION}
 else{next.studioCosmeticsVersion=head.studioSkinVersion+':makeup';next.studioMakeupVersion=PORTRAIT_MAKEUP_VERSION;delete next.naturalStudioSkinVersion}
 return next;
}
