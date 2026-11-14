// English-only hairstyle sets supplied on 14 November 2026. Numbers match
// the uploaded cutouts and their separate example portraits, not old IDs.
const styles=[
 ['Sleek centre-parted long hair','long','sleek long straight dark-brown hair with a precise centre part, smooth low crown and complete straight shoulder-side lengths'],
 ['Centre-parted long waves','long','long dark-brown hair with a centre part and broad soft S-shaped waves on both sides, keeping the full reference length'],
 ['Shoulder-length soft layers','long','centre-parted shoulder-length dark-brown layers with a smooth crown and softly curved, outward-opening lower ends'],
 ['Centre-parted blunt lob','bob','a sleek centre-parted blunt lob ending at the shoulder line, with straight sides and softly inward-curving ends'],
 ['Side-parted swept waves','long','a deep side part with a broad diagonal forehead sweep and long loose waves swept over one shoulder; preserve its original left/right orientation'],
 ['Sleek low ponytail','long','sleek centre-parted hair tucked behind the visible ears and gathered into the low rear ponytail actually visible beside the neck; retain that reference ponytail only'],
 ['Soft half-up long hair','long','centre-parted soft half-up hair with swept-back upper sides, restrained crown lift and loose long straight rear lengths'],
 ['Rounded chin-length bob','bob','a compact centre-parted rounded chin-length bob with smooth full sides and inward-curving ends; keep the exact short endpoints'],
 ['Long layers with wispy fringe','long','long softly layered dark-brown hair with a light wispy forehead fringe, a subtle centre opening and the complete curved shoulder-side ends'],
 ['Low updo with face-framing wisps','gathered','a low compact softly gathered updo with a centre part and the intentional fine curved face-framing wisps beside both cheeks; keep those attached reference wisps, without adding long rear hair'],
 ['Tucked neck-length bob','bob','a sleek dark-brown neck-length bob with a near-centre part, sides tucked behind both visible ears and short softly flipped nape ends'],
 ['Side-swept blonde layered bob','bob','a chin-to-neck-length layered warm-blonde bob with darker roots, a side part and a broad soft diagonal sweep; preserve the reference blonde colour and rounded short ends'],
 ['Long brunette hair with flipped ends','long','sleek centre-parted dark-brunette hair reaching below the shoulders, with smooth long sides and the softly outward-flipped reference ends'],
 ['Shoulder-length blonde ombre layers','long','shoulder-length softly layered blonde ombre hair with dark roots, a centre opening, face-framing curtain sections and outward-curved ends; preserve the dark-to-blonde colour transition'],
 ['Warm brunette blowout layers','long','a soft centre-to-side-parted warm-brunette blowout with subtle lighter brown highlights, rounded shoulder-length layers and curved full ends'],
 ['Long straight blonde hair','long','long sleek straight blonde hair with darker roots and a precise centre part, keeping the complete smooth reference length and blonde colour'],
 ['Side-parted feathered bob','bob','a short dark-brunette feathered bob with an off-centre side part, a soft diagonal fringe and outward-flicked jaw-to-neck-length ends; preserve its short layered silhouette'],
 ['Shoulder-length brunette flipped layers','long','shoulder-length dark-brunette layered hair with a soft near-centre part, restrained crown volume and distinct outward-flipped lower layers'],
 ['Centre-parted blonde bob','bob','a sleek compact chin-length blonde bob with darker roots, a precise centre part and softly rounded inward-curved blunt ends; preserve the reference blonde colour'],
 ['Long soft brunette waves','long','long dark-brunette hair with a centre part, soft flowing waves and complete tapered shoulder-side lengths; retain the reference subtle warm-brown highlights']
];
export const ENGLISH_FEMALE_HAIR_CATALOG=styles.map(([name,kind,description],i)=>({
 id:'seedream-'+String(44+i),gender:'female',interfaceLanguage:'en',
 name,kind,description,referenceWisps:i===9,file:String(44+i)+'.png',
 src:'/assets/seedream-hairstyles/previews/'+String(44+i)+'.webp'
}));

export function englishFemaleHairInstruction(selected){
 if(selected?.interfaceLanguage!=='en')return '';
 return `SELECTED ENGLISH HAIRSTYLE ${selected.id}: ${selected.description}. Image 2 supplies this hairstyle only. Replace all conflicting source hair with this one exact design. Match its parting orientation, hairline, crown volume, waves, fringe, intentional face-framing pieces, gathering and endpoints together. Preserve the selected long lengths or short cut exactly; never turn waves into straight hair, a ponytail into an updo, a bob into long hair, or add source hair absent from the reference. Keep only the selected reference's visible ear covering and attached wisps. Fit the roots naturally to this person's actual scalp and skull; never float the hair above a bald head or increase head size to fit a donor. Transparent regions contain no reference hair. They do not authorize copying a donor face, neck, shoulders or clothes. Preserve the uploaded person's face, eye colour, eye highlights, skin and identity. This selected design overrides generic open-ear, short/updo cleanup, neat-hair and maximum-length wording.`;
}
