// English men's replacement set. Duplicate Copy exports are not menu choices.
const styles=[
 ['Soft curly fringe','short','short dark hair with soft defined curls falling toward the forehead, a rounded textured crown and compact sides; preserve the actual curly fringe'],
 ['Centre-parted curtains','short','smooth centre-parted dark curtain hair with a clean middle opening, rounded side sections and neat short sides'],
 ['Wavy centre-parted curtains','short','medium-short dark hair with a centre opening, loose swept-back waves and a soft M-shaped forehead frame; retain the reference crown volume'],
 ['Textured side-swept crop','short','a short dark textured crop with a soft side sweep across the forehead, low natural volume and neat compact sides'],
 ['Flowing wavy middle part','short','dark centre-parted hair with full soft flowing waves, a curved M-shaped front and longer rounded side locks at temple level'],
 ['Tousled wavy middle part','short','short dark tousled wavy hair with a centre opening, lifted separated textured strands and irregular soft waves; no stiff spikes or extra crown height'],
 ['Straight textured fringe','short','short straight dark layered hair with a low uneven forehead fringe, a subtle off-centre split and compact tapered sides; preserve its straight strand texture'],
 ['Classic slicked-back','short','sleek dark hair combed straight back from a rounded open forehead, defined fine swept ridges on the crown, compact naturally tapered sides'],
 ['Neat side-swept taper','short','short dark brown smooth side-swept hair with a soft diagonal front and tight clean temple taper, no elevated quiff'],
 ['Textured ash-blonde quiff','short','light ash-brown hair with a softly lifted textured swept-back front, separated natural strands and short tapered sides'],
 ['Smooth open-forehead sweep','short','dark brown glossy swept-back cut with a gentle side part, open forehead, rounded low crown and neat close-cut sides'],
 ['Soft side-part pompadour','short','dark brown side-parted haircut with a smooth rounded side-swept front and restrained crown lift, compact natural sideburns'],
 ['Short curly crop','short','very short dark tightly textured curly crop with a compact low front, close neat sides and an even rounded crown'],
 ['Tousled textured waves','short','short dark layered soft waves tousled across the forehead, loose irregular wavy texture and compact sides'],
 ['Short neat textured buzz','short','very short dark even textured crop with a natural low frontal hairline, tiny short strands and close tapered sides']
];
export const ENGLISH_MALE_HAIR_CATALOG=styles.map(([name,kind,description],i)=>({
 id:'seedream-'+String(64+i),gender:'male',interfaceLanguage:'en',
 name,kind,description,file:String(64+i)+'.png',
 src:'/assets/seedream-hairstyles/previews/'+String(64+i)+'.webp'
}));

export function englishMaleHairInstruction(selected){
 if(selected?.interfaceLanguage!=='en'||selected.gender!=='male')return '';
 return `SELECTED ENGLISH MALE HAIRSTYLE ${selected.id}: ${selected.description}. Image 2 controls this one exact hairstyle: its parting direction, forehead fringe, curl or wave pattern, strand texture, hairline, crown height, side taper and cut endpoints. Replace all conflicting source hair with this design; never substitute the default business side part, turn curly hair into straight hair, or remove a chosen curtain/fringe. Fit the roots naturally to this person's own scalp and skull, including a receding or bald scalp; do not place the hair above the head, increase skull height or copy a donor head shape. Preserve the uploaded person's own face, eyes, eye colour, ears, skin and identity. The reference supplies hair only, never a donor face, neck, clothing or expression. The selected design is a SHORT haircut: end rear hair in a natural close taper at the upper nape, leaving the neck fully clear above the shirt collar. Absolutely no mullet, rear hair curtain, long neck-length back locks, detached strands hanging behind either ear, or hair descending onto the visible neck, shirt collar or suit lapels. Do not erase the normal short nape hairline, truncate a front curtain, or remove the intentional curls and fringe visible in Image 2. Do not enlarge the skull or inflate crown and side volume to recreate a donor head. Keep short sideburns attached to the selected haircut without adding a beard or extra rear lengths. The exact selected design overrides generic neat-hair, open-forehead and loose-strand cleanup wording.`;
}
