import previews from './uniform-quick-previews.json' with {type:'json'};
import smallPreviews from './uniform-picker-thumbnails.json' with {type:'json'};
// Selection thumbnails only, in every language. Templates, AI references,
// editor layers and sample output photos retain their full-resolution assets.
export function outfitChoicePreview(option,original){
 const template=option?.template||option?.img;
 if(typeof template!=='string'||!/^\/assets\/(?:job|government|student|gown)-uniforms\/[^/]+\.(?:png|webp)$/.test(template)||template.includes('-example'))return original;
 return previews[template]||template;
}

// Job choices are image-only; retain their names for search and accessible labels.
export function isJobOutfit(option){
 const template=option?.template||option?.img;
 return option?.cat==='job'||typeof template==='string'&&template.startsWith('/assets/job-uniforms/');
}

// Tiny picker tiles only. The 512px transparent editor-preview and native
// downloadable outfit remain separate, full-precision sources.
export function outfitPickerPreview(option,original){
 const template=option?.template||option?.img;
 if(typeof template!=='string'||!/^\/assets\/(?:job|government|student|gown)-uniforms\/[^/]+\.(?:png|webp)$/.test(template)||template.includes('-example'))return original;
 return smallPreviews[template]||outfitChoicePreview(option,original);
}
