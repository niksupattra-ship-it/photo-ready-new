// English men's replacement collection from ผมชายอังกฤษ.zip: exactly 66.png–78.png,
// one-to-one with their 66.webp–78.webp previews. Older 64–65 choices are retired.
const styles=[
 [
  "Curly middle-part fringe",
  "short",
  "loose dark curls forming a center opening, rounded soft curly fringe and restrained compact sides"
 ],
 [
  "Neat side sweep",
  "short",
  "short dark soft side-swept layers, angled front strands, modest low crown and short neat sides"
 ],
 [
  "Soft curtain waves",
  "short",
  "medium-short smooth wavy center-parted curtains with wide rounded side sections and a clean forehead opening"
 ],
 [
  "Airy wavy middle part",
  "short",
  "loose wavy middle part with airy natural top volume, curved front locks and tidy side hair"
 ],
 [
  "Textured straight fringe",
  "short",
  "forward textured layered straight dark fringe with a soft diagonal front and close tapered sides"
 ],
 [
  "Classic slicked back",
  "short",
  "glossy dark hair brushed backward into clean controlled ridges with a fully open forehead and close sides"
 ],
 [
  "Very short textured crop",
  "short",
  "short even dark cropped top with fine uneven frontal fringe and neatly tapered sides"
 ],
 [
  "Wavy side-swept curls",
  "short",
  "defined tousled dark brown waves swept across one forehead side, irregular wave texture and short sides"
 ],
 [
  "Compact curly crop",
  "short",
  "short tightly defined dark curly top, raised textured curly front and trimmed close sides"
 ],
 [
  "Polished business sweep",
  "short",
  "smooth brown side-swept front with restrained rounded high wave, clean open forehead and neat tapered temples"
 ],
 [
  "Glossy formal side part",
  "short",
  "neatly combed glossy black formal side part, visible backward ridges, open forehead and compact sides"
 ],
 [
  "Light blond textured quiff",
  "short",
  "sandy blond textured hair with softly raised airy front, lifted separated strands and close tapered sides"
 ],
 [
  "Classic brown side part",
  "short",
  "polished dark brown medium-short side part, soft backward swept front and clean restrained side volume"
 ]
];
export const ENGLISH_MALE_HAIR_CATALOG=styles.map(([name,kind,description],i)=>({
 id:'seedream-'+String(66+i),gender:'male',interfaceLanguage:'en',
 name,kind,description,file:String(66+i)+'.png',
 src:'/assets/seedream-hairstyles/previews/'+String(66+i)+'.webp'
}));
export function englishMaleHairInstruction(selected){
 if(selected?.interfaceLanguage!=='en'||selected.gender!=='male')return '';
 return `SELECTED ENGLISH MALE HAIRSTYLE ${selected.id}: ${selected.description}. Image 2 is exactly the hairstyle selected in the numbered picker and is the sole hairstyle authority. Copy the recognizable selected parting, forehead opening and bangs, curl/wave texture, flow direction, crown shape and side taper; do not substitute any other similar curtain, short crop, quiff or slick cut from the menu. Preserve the uploaded customer's face, eyes, ears, skull size, expression and natural skin; Image 2 supplies hairstyle only, never the reference model's facial features or body. Fit the hair roots naturally to the customer without making the head larger. Keep a tidy short male nape without added strands running behind the ears, down the neck or onto the collar; do not cut away deliberate front/side curls shown in the chosen hair. No mullet or long rear hair absent from this reference. Selected hairstyle specifics override generic neat-hair cleanup or default side-part instructions.`;
}
