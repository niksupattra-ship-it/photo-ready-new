import {REAL_UNIFORM_DETAIL_TEMPLATES} from './real-uniform-details.js';
const kinds=new Set(['collar','chest','ribbon']);
export const isGovernmentAccessory=layer=>kinds.has(layer.kind);
// A new hairstyle/result in the same government garment must not silently
// discard the selected native insignia or a customer's manual placement.
export function retainedGovernmentInsignia(layers,previousHead,nextHead,{englishFlow=false}={}){
 const template=nextHead?.generatedOutfitTemplate;
 if(englishFlow||!previousHead||template!==previousHead.generatedOutfitTemplate||!REAL_UNIFORM_DETAIL_TEMPLATES.has(template))return [];
 return layers.filter(isGovernmentAccessory);
}
