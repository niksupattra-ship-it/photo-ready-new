import previews from './uniform-quick-previews.json' with {type:'json'};
// Selection thumbnails only, in every language. Templates, AI references,
// editor layers and sample output photos retain their full-resolution assets.
export function outfitChoicePreview(option,original){
 const template=option?.template||option?.img;
 if(typeof template!=='string'||!/^\/assets\/(?:job|government|student|gown)-uniforms\/[^/]+\.(?:png|webp)$/.test(template)||template.includes('-example'))return original;
 return previews[template]||template;
}
