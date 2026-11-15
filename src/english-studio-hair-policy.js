// English-only Studio hairstyle rules. Never reuse this list for Thai Studio.
// Two understated professional hairstyles per gender, displayed first.
export const ENGLISH_STUDIO_FREE_HAIR_IDS=Object.freeze({
 female:Object.freeze(['seedream-49','seedream-53']), // sleek low ponytail, compact low updo
 male:Object.freeze(['seedream-67','seedream-76'])     // neat side sweep, glossy formal side part
});
export const isEnglishStudioFreeHair=(id,gender)=>
 Boolean(id&&ENGLISH_STUDIO_FREE_HAIR_IDS[gender]?.includes(id));
export const isEnglishStudioDiamondHair=(id,gender)=>
 Boolean(id&&!isEnglishStudioFreeHair(id,gender));
export const orderEnglishStudioHair=(options,gender)=>{
 const free=ENGLISH_STUDIO_FREE_HAIR_IDS[gender]||[];
 const items=(options||[]).filter(x=>x.gender===gender);
 return [...items].sort((a,b)=>{
  const ai=free.indexOf(a.id),bi=free.indexOf(b.id);
  return (ai<0?free.length:ai)-(bi<0?free.length:bi);
 });
};
// English Diamond is unlocked during the active USD 30-day package only.
// An already processed exact hairstyle/finish can still be restored from
// its saved result after expiry, without asking the AI provider again.
export function englishStudioDiamondActive(wallet,now=Date.now()){
 if(wallet?.usdPremiumPurchased!==true||wallet?.usdPremiumActive!==true)return false;
 const expiry=Date.parse(wallet.usdPremiumUntil||'');
 return Number.isFinite(expiry)&&expiry>now;
}
