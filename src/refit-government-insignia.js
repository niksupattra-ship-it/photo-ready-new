import {retainedGovernmentInsignia} from './government-insignia-retention.js';
// Rebuild only selected badges when a new photograph replaces the same uniform.
export async function refitGovernmentInsignia(layers,previousHead,nextHead,{englishFlow=false,fit,options,nativeAsset}={}){
 const retained=retainedGovernmentInsignia(layers,previousHead,nextHead,{englishFlow});
 if(!retained.length||!fit?.frame||previousHead.source===nextHead.source&&previousHead.jobId===nextHead.jobId)return layers;
 const replacements=new Map();
 for(const layer of retained){
  const option=options[layer.kind]?.find(item=>item.id===layer.assetId);
  if(!option)continue;
  const native=await nativeAsset(layer.kind,option,fit.frame,fit.preset);
  replacements.set(layer.id,{...layer,source:native.source,sourceFrame:native.sourceFrame,collarParts:native.collarParts,
   x:0,y:0,scale:1,rotation:0,squeezeX:1,squeezeY:1,neckWidth:0,neckHeight:0,
   collarLeftX:0,collarLeftY:0,collarRightX:0,collarRightY:0,collarLeftScale:1,collarRightScale:1,collarLeftRotation:0,collarRightRotation:0,
   mask:null,warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,easyInsigniaManualPlacement:false});
 }
 return replacements.size?layers.map(layer=>replacements.get(layer.id)||layer):layers;
}
