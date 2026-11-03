import previews from './uniform-quick-previews.json' with {type:'json'};
import {englishPreviewEnabled} from './english-preview.js';
// Selection thumbnails only. The garment template, AI reference, editor layer
// and sample output photos remain the original full-resolution assets.
export function outfitChoicePreview(option,original,location=globalThis.location){
 if(!englishPreviewEnabled(location)||!option?.template?.startsWith('/assets/job-uniforms/'))return original;
 return previews[option.template]||option.template;
}
