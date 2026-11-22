// Shared catalogue ordering and eligibility for Thai female job outfits.
export const THAI_FREE_FEMALE_SUIT_IDS=Object.freeze(['female-job-navy-notch-white-shirt','female-job-navy-double-breasted-cream-blouse','female-job-navy-white-collar','female-job-ivory-bow-blouse']);
export const THAI_FREE_FEMALE_SUIT_PATHS=Object.freeze(THAI_FREE_FEMALE_SUIT_IDS.map(id=>'/assets/job-uniforms/'+id+'.png'));
export const isThaiPremiumFemaleSuit=template=>typeof template==='string'&&/^\/assets\/job-uniforms\/female[^/]*\.(png|webp)$/.test(template)&&!THAI_FREE_FEMALE_SUIT_PATHS.includes(template);
export function orderThaiFemaleSuits(options){
 const rank=o=>{const i=THAI_FREE_FEMALE_SUIT_PATHS.indexOf(o.template);return i<0?4:i};
 return [...options].sort((a,b)=>rank(a)-rank(b));
}
