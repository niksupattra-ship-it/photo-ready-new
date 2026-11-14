// English men's replacement set. Duplicate Copy exports are not menu choices.
const styles=[
 ['Soft curly fringe','short','short dark hair with soft defined curls falling toward the forehead, a rounded textured crown and compact sides; preserve the actual curly fringe'],
 ['Centre-parted curtains','short','smooth centre-parted dark curtain hair with a clean middle opening, rounded side sections and neat short sides'],
 ['Wavy centre-parted curtains','short','medium-short dark hair with a centre opening, loose swept-back waves and a soft M-shaped forehead frame; retain the reference crown volume'],
 ['Textured side-swept crop','short','a short dark textured crop with a soft side sweep across the forehead, low natural volume and neat compact sides'],
 ['Flowing wavy middle part','short','dark centre-parted hair with full soft flowing waves, a curved M-shaped front and longer rounded side locks at temple level'],
 ['Tousled wavy middle part','short','short dark tousled wavy hair with a centre opening, lifted separated textured strands and irregular soft waves; no stiff spikes or extra crown height'],
 ['Straight textured fringe','short','short straight dark layered hair with a low uneven forehead fringe, a subtle off-centre split and compact tapered sides; preserve its straight strand texture']
];
export const ENGLISH_MALE_HAIR_CATALOG=styles.map(([name,kind,description],i)=>({
 id:'seedream-'+String(64+i),gender:'male',interfaceLanguage:'en',
 name,kind,description,file:String(64+i)+'.png',
 src:'/assets/seedream-hairstyles/previews/'+String(64+i)+'.webp'
}));

export function englishMaleHairInstruction(selected){
 if(selected?.interfaceLanguage!=='en'||selected.gender!=='male')return '';
 return `SELECTED ENGLISH MALE HAIRSTYLE ${selected.id}: ${selected.description}. Image 2 controls this one exact hairstyle: its parting direction, forehead fringe, curl or wave pattern, strand texture, hairline, crown height, side taper and cut endpoints. Replace all conflicting source hair with this design; never substitute the default business side part, turn curly hair into straight hair, or remove a chosen curtain/fringe. Fit the roots naturally to this person's own scalp and skull, including a receding or bald scalp; do not place the hair above the head, increase skull height or copy a donor head shape. Preserve the uploaded person's own face, eyes, eye colour, ears, skin and identity. The reference supplies hair only, never a donor face, neck, clothing or expression. Keep short sideburns attached to the selected haircut without adding beard, nape tails or extra rear lengths. The exact selected design overrides generic neat-hair, open-forehead and loose-strand cleanup wording.`;
}
